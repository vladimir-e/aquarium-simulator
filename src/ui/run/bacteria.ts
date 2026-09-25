/**
 * Biofilter readout: AOB + NOB against their ceiling (each type caps at
 * surface × bacteriaPerCm2), the per-hour conversion the current colonies
 * manage, and a forward projection of the nitrite peak.
 */

import {
  aobCapacity,
  calculateAmmoniaToNitrite,
  calculateColonyFlows,
  calculateEvaporation,
  calculateMaxBacteria,
  calculateNitriteToNitrate,
  calculateSeeding,
  calculateWasteToAmmonia,
  colonyRates,
  nobCapacity,
} from '../../simulation/systems/index.js';
import {
  calculateSubstrateLeach,
  wasteSettlingShare,
  processMetabolism,
  type Resources,
  type SimulationState,
} from '../../simulation/index.js';
import { WATER_LEVEL_THRESHOLD } from '../../simulation/equipment/ato.js';
import type { NitrogenCycleConfig, TunableConfig } from '../../simulation/config/index.js';
import { getPpm } from '../../simulation/resources/index.js';
import { monodFactor } from '../../simulation/core/kinetics.js';
import { NH3_TO_NO2_MASS_RATIO } from '../../simulation/core/chemistry.js';
import { mineralisationBase, wasteInflow } from './waste.js';

/**
 * The share of its own ceiling at which a colony counts as having filled it.
 *
 * Not 100: unconditional decay puts the arithmetic limit at
 * `1 − deathRate/growthRate`, and oxygen stops NOB short of even that.
 *
 * Only a tank held under a heavy load gets near it at all: an ordinary
 * stocked tank rests at a couple of percent, because a colony grows to its load
 * and not to its surface.
 */
const SURFACE_BOUND_PCT = 85;

/** How far ahead the cycle projection will look before giving up, in ticks. */
const PROJECTION_HORIZON = 24 * 180;

/** What a hobby test kit reads as zero, ppm. */
const TRACE_PPM = 0.1;

/**
 * The least throughput that still counts as a biofilter, ppm/h: one test-kit
 * trace cleared over a day. Below it the colonies are turning over less than
 * the keeper's kit could ever show, which is the state an unfed tank fades into
 * — bed spent, both toxins at zero, and nothing left that a feeding would not
 * spike. An unfed tank crosses it around day 80–120; one on an ordinary ration
 * runs at ~12× it, and only a token ration — hundredths of a gram a day —
 * settles within 2×.
 *
 * A ppm figure, so it is the same test at every volume for a load that scales
 * with volume, which bed leaching does. A fixed ration does not: the pinch of
 * food that holds a nano over this floor leaves a stock tank under it.
 */
const MIN_CLEARANCE_PPM_PER_HOUR = TRACE_PPM / 24;

/**
 * Whether a colony is big enough to matter at all rather than being a rounding
 * error, and can take what arrives at it each hour while holding its substrate
 * at the trace line.
 *
 * The second is read off the Monod curve at trace, not off the colony's
 * ceiling: uptake falls with the concentration, so a colony whose ceiling
 * covers its load can still only keep up by letting the toxin climb until the
 * curve pays for it.
 */
function clearsAtTrace(throughput: number, halfSaturation: number, arriving: number): boolean {
  return (
    throughput >= MIN_CLEARANCE_PPM_PER_HOUR &&
    throughput * monodFactor(TRACE_PPM, halfSaturation) >= arriving
  );
}

/**
 * The word every surface uses for the state of a biofilter — list row, section
 * header, inspector and CLI all read the same predicate, so they all say this.
 */
export function cycleWord(cycled: boolean): string {
  return cycled ? 'cycled' : 'uncycled';
}

/**
 * How much of the surface the colonies have taken, 0–100.
 *
 * Occupancy and not health: a colony grows to its load, so an ordinary cycled
 * tank sits at a couple of percent and the rest is the room it has left.
 */
export function biofilterColonisation(
  resources: Resources,
  config: NitrogenCycleConfig
): number {
  const ceiling = calculateMaxBacteria(resources.surface, config);
  if (ceiling <= 0) return 0;
  return Math.min(100, ((resources.aob + resources.nob) / (2 * ceiling)) * 100);
}

export interface Colony {
  count: number;
  ceiling: number;
  /** Share of this colony's own ceiling, 0–100. */
  pct: number;
}

export interface ConversionRates {
  /** NH₃ ppm mineralised from standing waste this hour. */
  wasteToAmmonia: number;
  /** NH₃ ppm excreted straight through fish gills this hour. */
  gillsToAmmonia: number;
  /** NH₃ ppm the AOB colony takes out of the water this hour. */
  ammoniaOxidised: number;
  /** Arriving minus oxidised — positive means ammonia is climbing. */
  netAmmonia: number;
  /** NO₂ ppm the AOB colony produces this hour. */
  ammoniaToNitrite: number;
  /** NO₂ ppm the NOB colony clears this hour. */
  nitriteToNitrate: number;
  /** Produced minus cleared — positive means nitrite is climbing. */
  netNitrite: number;
}

export interface BacteriaReadout {
  aob: Colony;
  nob: Colony;
  /** Colonisable biofilm, cm². */
  surface: number;
  /** Share of that biofilm both colonies together have taken, 0–100. */
  colonisation: number;
  /**
   * Both toxins reading trace or under, which is as far as a keeper's kit can
   * see. Half the cycle test, carried separately because the surfaces that
   * explain the word have to know which half failed: uncycled while this holds
   * is the colonies clearing less than the tank asks of them.
   */
  atTrace: boolean;
  /**
   * The keeper's own test: both toxins at trace, and colonies big enough to
   * keep them there. A single tick cannot see the one thing a run can — that
   * a nitrite peak was passed rather than never reached.
   *
   * Nitrite standing at trace is what keeps this off a tank at its nitrite
   * peak, where "produced no longer exceeds consumed" first goes true and a
   * keeper stocking on it would lose the fish. The throughput each stage has to
   * show is what keeps it off the other end: a tank left unfed until its bed is
   * spent holds both readings at zero on colonies that have faded to nothing,
   * and a single feeding would spike it.
   *
   * Nothing has to be arriving, though. A mature colony with an empty tank in
   * front of it reads cycled, because it will take the next feeding — so this
   * is not a claim that nitrate is climbing, and no surface may say it is.
   *
   * Deliberately not a share of the surface ceiling: surface is a cap for the
   * overstocked, and an ordinary stocked tank settles at a few percent of it.
   */
  cycled: boolean;
  rates: ConversionRates;
}

function colony(count: number, ceiling: number): Colony {
  return { count, ceiling, pct: ceiling > 0 ? Math.min(100, (count / ceiling) * 100) : 0 };
}

/** One bacteria unit, in cells — the gauge `bacteriaPerCm2` and the seed are quoted in. */
const CELLS_PER_UNIT = 1e6;

const SI_PREFIXES = ['', 'k', 'M', 'G', 'T'];

/**
 * A population in cells. Colonies span six orders of magnitude between a fresh
 * seed and a canister at its ceiling, so the digits go to an SI prefix rather
 * than to a comma-grouped wall of them.
 */
export function colonyCount(units: number): string {
  let cells = units * CELLS_PER_UNIT;
  let step = 0;
  // Rounded before compared, so a figure that prints as 1000.0 takes the next
  // prefix rather than overflowing this one.
  while (step < SI_PREFIXES.length - 1 && Number(cells.toFixed(1)) >= 1000) {
    cells /= 1000;
    step++;
  }
  return step === 0 ? Math.round(cells).toString() : `${cells.toFixed(1)} ${SI_PREFIXES[step]}`;
}

export function bacteriaReadout(
  state: SimulationState,
  config: TunableConfig
): BacteriaReadout {
  const r = state.resources;
  const nc = config.nitrogenCycle;
  const ceiling = calculateMaxBacteria(r.surface, nc);
  const water = r.water;

  // The AOB stage sees both of these: gill excretion lands in the active tier,
  // ahead of the passive nitrogen cycle, and mineralisation runs first inside it.
  const gills = processMetabolism(state.fish, r.food, r.oxygen, config.livestock).ammoniaProduced;
  const { ammoniaProduced } = calculateWasteToAmmonia(
    mineralisationBase(state, config, wasteInflow(state, config)),
    nc
  );
  const { ammoniaConsumed, nitriteProduced } = calculateAmmoniaToNitrite(
    r.ammonia + gills + ammoniaProduced,
    water,
    r.aob,
    r.temperature,
    r.oxygen,
    nc
  );
  const { nitriteConsumed } = calculateNitriteToNitrate(
    r.nitrite + nitriteProduced,
    water,
    r.nob,
    r.temperature,
    r.oxygen,
    nc
  );
  const aobThroughput = getPpm(aobCapacity(r.aob, r.temperature, r.oxygen, nc), water);
  const nobThroughput = getPpm(nobCapacity(r.nob, r.temperature, r.oxygen, nc), water);

  const rates: ConversionRates = {
    wasteToAmmonia: getPpm(ammoniaProduced, water),
    gillsToAmmonia: getPpm(gills, water),
    ammoniaOxidised: getPpm(ammoniaConsumed, water),
    netAmmonia: getPpm(gills + ammoniaProduced - ammoniaConsumed, water),
    ammoniaToNitrite: getPpm(nitriteProduced, water),
    nitriteToNitrate: getPpm(nitriteConsumed, water),
    netNitrite: getPpm(nitriteProduced - nitriteConsumed, water),
  };
  const atTrace = getPpm(r.ammonia, water) < TRACE_PPM && getPpm(r.nitrite, water) < TRACE_PPM;
  const ammoniaArriving = rates.wasteToAmmonia + rates.gillsToAmmonia;
  return {
    aob: colony(r.aob, ceiling),
    nob: colony(r.nob, ceiling),
    surface: r.surface,
    colonisation: biofilterColonisation(r, nc),
    atTrace,
    cycled:
      atTrace &&
      clearsAtTrace(aobThroughput, nc.aobAmmoniaHalfSaturation, ammoniaArriving) &&
      clearsAtTrace(
        nobThroughput,
        nc.nobNitriteHalfSaturation,
        ammoniaArriving * NH3_TO_NO2_MASS_RATIO
      ),
    rates,
  };
}

export interface CycleProjection {
  /** Ticks from now until nitrite tops out. */
  hours: number;
  /** Nitrite at the peak, ppm. */
  ppm: number;
}

/**
 * The tank's volume an hour on: evaporation runs every tick, and an enabled
 * ATO refills the moment the level drops past its threshold.
 */
function nextVolume(water: number, state: SimulationState, config: TunableConfig): number {
  const level =
    water -
    calculateEvaporation(
      water,
      state.resources.temperature,
      state.environment.roomTemperature,
      state.equipment.lid.type,
      config.evaporation
    );
  const { capacity } = state.tank;
  return state.equipment.ato.enabled && level < capacity * WATER_LEVEL_THRESHOLD ? capacity : level;
}

/**
 * Run the engine's own nitrogen model forward to find the nitrite peak.
 *
 * Waste inflow, biofilm surface, temperature and dissolved oxygen are held at
 * today's values, so this answers "if nothing else changes" — feeding more,
 * adding fish or a water change all move it. Evaporation and the bed's leaching
 * and settling are not choices: they run every tick whatever the keeper does,
 * so the projection carries them.
 */
export function projectNitritePeak(
  state: SimulationState,
  config: TunableConfig,
  horizon: number = PROJECTION_HORIZON
): CycleProjection | null {
  const r = state.resources;
  const nc = config.nitrogenCycle;
  const ceiling = calculateMaxBacteria(r.surface, nc);
  if (r.water <= 0 || ceiling <= 0) return null;
  const aobRates = colonyRates('aob', r.temperature, r.oxygen, nc);
  const nobRates = colonyRates('nob', r.temperature, r.oxygen, nc);

  const sources = wasteInflow(state, config).sources;
  const steadyInflow = sources
    .filter((source) => source.key !== 'substrate')
    .reduce((total, source) => total + source.gramsPerHour, 0);
  const gills = processMetabolism(state.fish, r.food, r.oxygen, config.livestock).ammoniaProduced;

  let reserve = state.equipment.substrate.organicReserve;
  let water = r.water;
  let waste = r.waste;
  let ammonia = r.ammonia;
  let nitrite = r.nitrite;
  let aob = r.aob;
  let nob = r.nob;

  let peakPpm = getPpm(nitrite, water);
  let peakAt = 0;

  for (let hour = 1; hour <= horizon; hour++) {
    const seeding = calculateSeeding(water, nc);
    water = nextVolume(water, state, config);

    const leached = calculateSubstrateLeach(reserve, config.decay);
    const settled =
      waste * wasteSettlingShare({ ...state, resources: { ...r, water } }, config.decay);
    reserve += settled - leached;
    waste += steadyInflow + leached - settled;

    const mineralised = calculateWasteToAmmonia(waste, nc);
    waste -= mineralised.wasteConsumed;
    ammonia += mineralised.ammoniaProduced + gills;

    const oxidised = calculateAmmoniaToNitrite(ammonia, water, aob, r.temperature, r.oxygen, nc);
    ammonia -= oxidised.ammoniaConsumed;
    nitrite += oxidised.nitriteProduced;

    const cleared = calculateNitriteToNitrate(nitrite, water, nob, r.temperature, r.oxygen, nc);
    nitrite -= cleared.nitriteConsumed;

    const nitritePpm = getPpm(nitrite, water);

    const aobFlows = calculateColonyFlows(
      aob,
      oxidised.utilization,
      aobRates.growthRate,
      aobRates.deathRate,
      ceiling,
      seeding
    );
    const nobFlows = calculateColonyFlows(
      nob,
      cleared.utilization,
      nobRates.growthRate,
      nobRates.deathRate,
      ceiling,
      seeding
    );
    aob += aobFlows.growth - aobFlows.death;
    nob += nobFlows.growth - nobFlows.death;

    if (nitritePpm > peakPpm) {
      peakPpm = nitritePpm;
      peakAt = hour;
    } else if (peakAt > 0 && nitritePpm < peakPpm * 0.9) {
      break;
    }
  }

  return peakAt > 0 ? { hours: peakAt, ppm: peakPpm } : null;
}

function inDays(hours: number): string {
  if (hours < 48) return `in ${hours} h`;
  return `in ${Math.round(hours / 24)} d`;
}

function peakClause(projection: CycleProjection | null): string {
  if (!projection) return ` No nitrite peak within ${PROJECTION_HORIZON / 24} d at this production rate.`;
  return ` Nitrite peaks ${inDays(projection.hours)} at ${projection.ppm.toFixed(2)} ppm.`;
}

/** What the two colonies mean together — the sentence the numbers add up to. */
export function bacteriaSummary(
  readout: BacteriaReadout,
  projection: CycleProjection | null
): string {
  const { aob, nob, rates, atTrace, cycled } = readout;

  // Ahead of the growing-colony lines, which promise a colony that catches up:
  // one already on its surface has nowhere left to do it, and under a load big
  // enough to fill a biofilm nitrite is always climbing.
  //
  // No projection either, and for the same reason: a peak is where a growing
  // colony overtakes its load, so a colony with no growth left in it has none.
  // On a tank fed hard enough to reach this state the projector returns the
  // 180-day horizon rather than a peak the tank passes through.
  if (aob.pct >= SURFACE_BOUND_PCT && nob.pct >= SURFACE_BOUND_PCT) {
    return 'Both colonies have filled the surface they live on — until the tank offers more biofilm, more load has nowhere to go.';
  }

  if (!cycled && rates.netAmmonia > 0) {
    return `Uncycled. Ammonia arrives faster than the young AOB colony can oxidise it, and climbs until the colony grows into it.${peakClause(projection)}`;
  }

  if (nob.count < aob.count && rates.netNitrite > 0) {
    const behind = Math.round((1 - nob.count / aob.count) * 100);
    return `NOB trail AOB by ${behind} % — nitrite accumulates until the colony catches up.${peakClause(projection)}`;
  }

  if (atTrace && !cycled) {
    return `Both toxins read zero, on colonies too small to hold a feeding — ${Math.round(readout.colonisation)} % of the biofilm this tank offers.`;
  }

  if (rates.netNitrite <= 0) {
    return `The biofilter is clearing nitrite at least as fast as it appears, on ${Math.round(readout.colonisation)} % of the biofilm this tank offers.`;
  }

  return `Nitrite rising at ${rates.netNitrite.toFixed(4)} ppm/h.${peakClause(projection)}`;
}

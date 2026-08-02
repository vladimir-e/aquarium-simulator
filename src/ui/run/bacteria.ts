/**
 * Biofilter readout: AOB + NOB against their ceiling (each type caps at
 * surface × bacteriaPerCm2), the per-hour conversion the current colonies
 * manage, and a forward projection of the nitrite peak.
 */

import {
  calculateAmmoniaToNitrite,
  calculateColonyFlows,
  calculateEvaporation,
  calculateMaxBacteria,
  calculateNitriteToNitrate,
  calculateWasteToAmmonia,
} from '../../simulation/systems/index.js';
import {
  calculateSubstrateLeach,
  processMetabolism,
  type Resources,
  type SimulationState,
} from '../../simulation/index.js';
import { WATER_LEVEL_THRESHOLD } from '../../simulation/equipment/ato.js';
import type { NitrogenCycleConfig, TunableConfig } from '../../simulation/config/index.js';
import { getPpm } from '../../simulation/resources/index.js';
import { mineralisationBase, wasteInflow } from './waste.js';

/** Below this colonisation percentage the biofilter cannot carry a bioload. */
export const CYCLED_PCT = 25;

/** How far ahead the cycle projection will look before giving up, in ticks. */
const PROJECTION_HORIZON = 24 * 180;

/** Colonisation as a percentage (0–100) of the tank's combined bacteria ceiling. */
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
  /** Combined colonisation, 0–100. */
  colonisation: number;
  cycled: boolean;
  rates: ConversionRates;
}

function colony(count: number, ceiling: number): Colony {
  return { count, ceiling, pct: ceiling > 0 ? Math.min(100, (count / ceiling) * 100) : 0 };
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
  const gills = processMetabolism(state.fish, r.food, config.livestock).ammoniaProduced;
  const { ammoniaProduced } = calculateWasteToAmmonia(
    mineralisationBase(r.waste, wasteInflow(state, config)),
    nc
  );
  const { nitriteProduced } = calculateAmmoniaToNitrite(
    r.ammonia + gills + ammoniaProduced,
    r.aob,
    water,
    nc
  );
  const { nitriteConsumed } = calculateNitriteToNitrate(
    r.nitrite + nitriteProduced,
    r.nob,
    water,
    nc
  );
  const colonisation = biofilterColonisation(r, nc);

  return {
    aob: colony(r.aob, ceiling),
    nob: colony(r.nob, ceiling),
    surface: r.surface,
    colonisation,
    cycled: colonisation >= CYCLED_PCT,
    rates: {
      wasteToAmmonia: getPpm(ammoniaProduced, water),
      gillsToAmmonia: getPpm(gills, water),
      ammoniaToNitrite: getPpm(nitriteProduced, water),
      nitriteToNitrate: getPpm(nitriteConsumed, water),
      netNitrite: getPpm(nitriteProduced - nitriteConsumed, water),
    },
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
 * Waste inflow, biofilm surface and temperature are held at today's values, so
 * this answers "if nothing else changes" — feeding more, adding fish or a water
 * change all move it. Evaporation and substrate leaching are not choices: both
 * run every tick whatever the keeper does, so the projection carries them.
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

  const sources = wasteInflow(state, config).sources;
  const steadyInflow = sources
    .filter((source) => source.key !== 'substrate')
    .reduce((total, source) => total + source.gramsPerHour, 0);
  const gills = processMetabolism(state.fish, r.food, config.livestock).ammoniaProduced;

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
    water = nextVolume(water, state, config);

    const leached = calculateSubstrateLeach(reserve, config.decay);
    reserve -= leached;
    waste += steadyInflow + leached;

    const mineralised = calculateWasteToAmmonia(waste, nc);
    waste -= mineralised.wasteConsumed;
    ammonia += mineralised.ammoniaProduced + gills;

    const oxidised = calculateAmmoniaToNitrite(ammonia, aob, water, nc);
    ammonia -= oxidised.ammoniaConsumed;
    nitrite += oxidised.nitriteProduced;

    const cleared = calculateNitriteToNitrate(nitrite, nob, water, nc);
    nitrite -= cleared.nitriteConsumed;

    const ammoniaPpm = getPpm(ammonia, water);
    const nitritePpm = getPpm(nitrite, water);

    if (aob === 0 && ammoniaPpm >= nc.aobSpawnThreshold) aob = nc.spawnAmount;
    if (nob === 0 && nitritePpm >= nc.nobSpawnThreshold) nob = nc.spawnAmount;

    const aobFlows = calculateColonyFlows(
      aob,
      oxidised.utilization,
      nc.aobGrowthRate,
      nc.bacteriaDeathRate,
      ceiling
    );
    const nobFlows = calculateColonyFlows(
      nob,
      cleared.utilization,
      nc.nobGrowthRate,
      nc.bacteriaDeathRate,
      ceiling
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
  projection: CycleProjection | null,
  config: NitrogenCycleConfig
): string {
  const { aob, nob, rates } = readout;

  if (aob.count === 0) {
    return `Uncycled. Ammonia has to reach ${config.aobSpawnThreshold} ppm before AOB colonise, and nitrite follows them.${peakClause(projection)}`;
  }

  const gap = Math.round(aob.pct - nob.pct);
  if (gap >= 1 && rates.netNitrite > 0) {
    return `NOB trail AOB by ${gap} pp — nitrite accumulates until the colony catches up.${peakClause(projection)}`;
  }

  if (aob.pct >= 99 && nob.pct >= 99) {
    return 'Both colonies sit at their ceiling — the biofilter processes everything this tank produces.';
  }

  if (rates.netNitrite <= 0) {
    return `The biofilter is clearing nitrite at least as fast as it appears. Colonisation ${Math.round(readout.colonisation)} % of ceiling.`;
  }

  return `Nitrite rising at ${rates.netNitrite.toFixed(4)} ppm/h.${peakClause(projection)}`;
}

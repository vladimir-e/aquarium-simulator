/**
 * Shared scenarios for the tests and sweeps that watch a tank cycle itself,
 * together with the outcome measurements read off them.
 *
 * Every measurement here takes an explicit config so a sweep can drive it
 * across a parameter grid; the anchors call the same functions on the shipped
 * defaults. One code path, so a swept number and an asserted number mean the
 * same thing.
 */

import { produce } from 'immer';
import {
  calculateTankHeight,
  createSimulation,
  DEFAULT_ROOM_TEMPERATURE,
  type SimulationConfig,
  type SimulationState,
} from '../state.js';
import { calculateParAtDepth } from '../equipment/light.js';
import { opticsDefaults } from '../config/optics.js';
import type { FishSex, FishSpecies } from '../livestock/species.js';
import { tick } from '../tick.js';
import { applySeed, type PresetSeed } from '../seed.js';
import { applyAction } from '../actions/index.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../config/index.js';
import { getMassFromPpm, getPpm } from '../resources/helpers.js';
import { calculateMaxBacteria } from '../systems/nitrogen-cycle.js';
import { computeFishVitality } from '../systems/fish-health.js';
import type { SubstrateType } from '../equipment/substrate.js';
import type { FilterType } from '../equipment/filter.js';
import type { PowerheadFlowRate } from '../equipment/powerhead.js';

export const DAY = 24;

/**
 * The draw stream every scenario here opens on unless it names another.
 *
 * A default rather than an option left empty: `createSimulation` takes a
 * time-derived seed when it is handed none, so a fixture that forgets to name
 * one runs a different life every time — and the fixtures that stock fish on
 * top of these are exactly the ones an anchor reads.
 */
export const DEFAULT_RNG_SEED = 1234;

/** Advance a tank by `hours` ticks. */
export function run(
  state: SimulationState,
  hours: number,
  config: TunableConfig = DEFAULT_CONFIG
): SimulationState {
  let running = state;
  for (let hour = 0; hour < hours; hour++) running = tick(running, config);
  return running;
}

/**
 * The fixture that lands `target` PAR on the substrate of a `capacity` tank —
 * a fixture cannot be pointed at a substrate reading directly, because the box
 * in between decides. Attenuation is linear in the fixture, so the reading a
 * 1 PAR fixture lands is the whole ratio, inverting through the model itself
 * rather than restating Beer–Lambert here.
 */
export function fixtureFor(target: number, capacity: number): number {
  return target / calculateParAtDepth(1, calculateTankHeight(capacity), opticsDefaults);
}

/** There is no chiller, so a tank only sits below the room if the room is that cold. */
const roomFor = (temperature: number): number =>
  Math.min(DEFAULT_ROOM_TEMPERATURE, temperature);

/** Everything in a tank that moves or aerates water. Anything unnamed is off. */
export interface Circulation {
  filter?: FilterType;
  /** Powerhead setting in GPH — the label on the box. */
  powerhead?: PowerheadFlowRate;
  airPump?: boolean;
}

function circulationOf({
  filter,
  powerhead,
  airPump = false,
}: Circulation): Pick<SimulationConfig, 'filter' | 'powerhead' | 'airPump'> {
  return {
    filter: filter === undefined ? { enabled: false } : { enabled: true, type: filter },
    powerhead:
      powerhead === undefined ? { enabled: false } : { enabled: true, flowRateGPH: powerhead },
    airPump: { enabled: airPump },
  };
}

/**
 * A fishless, unfed, unplanted tank: the bed is the only thing in it that can
 * produce ammonia, so it alone decides whether — and when — the tank cycles.
 *
 * The ATO is on by default so evaporation doesn't quietly concentrate every
 * reading: over the two months these runs cover, an open tank loses most of
 * its water, and a rising ppm would then be a story about the water level
 * rather than about the bed. Turn it off to watch evaporation itself.
 *
 * The heater is sized to the tank for the same reason. Nitrifiers run on
 * temperature, and the shipped 100 W default holds 25 °C only to about 200 L —
 * a 1000 L on it sits at 22.7 °C, so a sweep across volumes would be reading
 * the heater rather than the water. 1 W/L is the hobby rule of thumb, floored
 * at the shipped 100 W, and it holds the target at every volume these runs use.
 */
export function fishlessTank(
  substrate: SubstrateType,
  {
    capacity = 20,
    ato = true,
    temperature = 25,
    // The sponge every fresh tank starts with. Named rather than inherited,
    // because what the water is getting is the variable these traces vary.
    circulation = { filter: 'sponge' },
    seed,
    rngSeed = DEFAULT_RNG_SEED,
  }: {
    capacity?: number;
    ato?: boolean;
    temperature?: number;
    circulation?: Circulation;
    seed?: PresetSeed;
    /** The stream this tank's life is drawn from — see `createSimulation`. */
    rngSeed?: number;
  } = {}
): SimulationState {
  return createSimulation(
    {
      tankCapacity: capacity,
      substrate: { type: substrate },
      ato: { enabled: ato },
      initialTemperature: temperature,
      roomTemperature: roomFor(temperature),
      heater: { targetTemperature: temperature, wattage: Math.max(100, capacity) },
      ...circulationOf(circulation),
    },
    seed,
    rngSeed
  );
}

/**
 * A tank the bed has cycled on its own, the way a keeper waits before stocking.
 *
 * Deliberately unfed: feeding it first would grow the colony past what the bed
 * alone supports, and a challenge answered by that colony measures the
 * conditioning rather than the engine.
 */
export function cycledTank(
  capacity: number,
  {
    config = DEFAULT_CONFIG,
    days = 30,
    rngSeed = DEFAULT_RNG_SEED,
  }: { config?: TunableConfig; days?: number; rngSeed?: number } = {}
): SimulationState {
  return run(fishlessTank('aqua_soil', { capacity, rngSeed }), days * DAY, config);
}

/**
 * A tank handed a colony and the substrate to read it against, written straight
 * into the resources — the starting point for every measurement of the colony's
 * own arithmetic, where growing one first would only add a history to explain.
 *
 * The ATO is on so evaporation cannot move a concentration underneath a reading.
 */
export function seededColony(
  capacity: number,
  {
    aob = 0,
    nob = 0,
    ammoniaPpm = 0,
    nitritePpm = 0,
  }: { aob?: number; nob?: number; ammoniaPpm?: number; nitritePpm?: number } = {}
): SimulationState {
  return produce(
    createSimulation({ tankCapacity: capacity, ato: { enabled: true } }),
    (draft) => {
      draft.resources.aob = aob;
      draft.resources.nob = nob;
      draft.resources.ammonia = getMassFromPpm(ammoniaPpm, draft.resources.water);
      draft.resources.nitrite = getMassFromPpm(nitritePpm, draft.resources.water);
    }
  );
}

/**
 * A bare tank held under more ammonia than its colonies can clear, which is the
 * only regime where a biofilm grows toward its surface at all rather than to
 * the load it is given. Dosed each hour through the resource rather than fed,
 * so what the colonies meet is ammonia and not a decay curve.
 */
export function saturatedColony(
  capacity: number,
  days = 30,
  {
    config = DEFAULT_CONFIG,
    dosePpmPerHour = 2,
    // The sponge every fresh tank starts with, named the way `fishlessTank`
    // names it. Pass `{}` to strip the tank of everything that moves water.
    circulation = { filter: 'sponge' },
  }: { config?: TunableConfig; dosePpmPerHour?: number; circulation?: Circulation } = {}
): SimulationState {
  let state = produce(
    createSimulation({ tankCapacity: capacity, ...circulationOf(circulation) }),
    (draft) => {
      draft.resources.aob = 1;
      draft.resources.nob = 1;
    }
  );

  for (let hour = 1; hour <= days * DAY; hour++) {
    state = tick(
      produce(state, (draft) => {
        draft.resources.ammonia += getMassFromPpm(dosePpmPerHour, draft.resources.water);
      }),
      config
    );
  }
  return state;
}

/**
 * The same tank as {@link cycledTank}, handed the colony at tick 0 instead
 * of spending three weeks growing one.
 */
export function seededCycledTank(capacity: number): SimulationState {
  return fishlessTank('aqua_soil', { capacity, seed: { bacteria: 'cycled' } });
}

/**
 * Add `count` fish of one species.
 *
 * `sex` forces the fish this call adds, which is how a run watches a stocked
 * tank over months without breeding turning it into a different experiment.
 */
export function stock(
  state: SimulationState,
  species: FishSpecies,
  count: number,
  { sex }: { sex?: FishSex } = {}
): SimulationState {
  return produce(state, (draft) => {
    applySeed(draft, { fish: [{ species, count, sex }] });
  });
}

export interface CycleTrace {
  /** Day AOB first appear, or null if ammonia never reached their threshold. */
  spawnDay: number | null;
  ammoniaPeakPpm: number;
  nitritePeakPpm: number;
  nitritePeakDay: number;
  /** Nitrate standing at the hour nitrite peaked, ppm. */
  nitrateAtPeakPpm: number;
  /** Lowest dissolved oxygen any hour of the run closed on, mg/L. */
  minOxygen: number;
  /** Day nitrite first drops under 0.1 ppm past the peak with nitrate still rising. */
  cycledDay: number | null;
}

export interface TraceOptions {
  substrate?: SubstrateType;
  days?: number;
  config?: TunableConfig;
  /** Water temperature the tank is held at, °C. */
  temperature?: number;
  circulation?: Circulation;
  /**
   * Grams of food a day. A bed alone barely moves the oxygen, so this is how a
   * trace reaches the low-air regime a keeper's overfed tank sits in.
   */
  feed?: number;
}

/** Watch a fishless tank through its whole cycle and report the shape of it. */
export function traceCycle(capacity: number, options: TraceOptions = {}): CycleTrace {
  const {
    substrate = 'aqua_soil',
    days = 40,
    config = DEFAULT_CONFIG,
    temperature = 25,
    circulation,
    feed,
  } = options;

  let spawnHour: number | null = null;
  let ammoniaPeakPpm = 0;
  let nitritePeakPpm = 0;
  let nitrateAtPeakPpm = 0;
  let peakHour = 0;
  let minOxygen = Infinity;
  let cycledHour: number | null = null;
  let previousNitrate = 0;

  keep(
    fishlessTank(substrate, { capacity, temperature, circulation }),
    days,
    { config, feed },
    (hour, _before, state) => {
      const { water, nitrate } = state.resources;
      const ammonia = getPpm(state.resources.ammonia, water);
      const nitrite = getPpm(state.resources.nitrite, water);

      if (spawnHour === null && state.resources.aob > 0) spawnHour = hour;
      if (ammonia > ammoniaPeakPpm) ammoniaPeakPpm = ammonia;
      if (nitrite > nitritePeakPpm) {
        nitritePeakPpm = nitrite;
        nitrateAtPeakPpm = getPpm(nitrate, water);
        peakHour = hour;
      }
      minOxygen = Math.min(minOxygen, state.resources.oxygen);
      if (cycledHour === null && nitritePeakPpm > 0.5 && nitrite < 0.1 && nitrate > previousNitrate) {
        cycledHour = hour;
      }
      previousNitrate = nitrate;
    }
  );

  return {
    spawnDay: spawnHour === null ? null : spawnHour / DAY,
    ammoniaPeakPpm,
    nitritePeakPpm,
    nitritePeakDay: peakHour / DAY,
    nitrateAtPeakPpm,
    minOxygen,
    cycledDay: cycledHour === null ? null : cycledHour / DAY,
  };
}

/**
 * ppm of ammonia still standing 24 h after a dose onto `tank` — the
 * fishless-cycling keeper's own test that a biofilter is ready for stock.
 */
export function doseClearance(
  tank: SimulationState,
  { dosePpm = 2, config = DEFAULT_CONFIG }: { dosePpm?: number; config?: TunableConfig } = {}
): number {
  const dosed = produce(tank, (draft) => {
    draft.resources.ammonia += getMassFromPpm(dosePpm, draft.resources.water);
  });
  // Without this a dose that silently failed to land would read as a clearance
  // of nothing, and the anchor would pass on a flat zero.
  const landed = getPpm(dosed.resources.ammonia, dosed.resources.water);
  if (landed < dosePpm) throw new Error(`dose did not land: ${landed} ppm of ${dosePpm}`);

  const cleared = run(dosed, DAY, config);
  return getPpm(cleared.resources.ammonia, cleared.resources.water);
}

export interface FlowReading {
  /** Circulation the tank is getting, L/h — what the pumps are rated at. */
  lph: number;
  /** The same water read as tank volumes per hour — what a fish feels. */
  turnover: number;
  /** Flow damage, %/h after hardiness. */
  stress: number;
  /** Vitality net rate, %/h. Negative is a fish on its way down. */
  net: number;
}

/**
 * What one fish of `species` feels from the circulation in a `capacity` tank.
 *
 * The per-individual hardiness offset is zeroed: it is randomised at stocking,
 * and a reading meant to isolate circulation shouldn't also carry the luck of
 * the draw.
 */
export function flowReading(
  species: FishSpecies,
  capacity: number,
  circulation: Circulation = {},
  config: TunableConfig = DEFAULT_CONFIG
): FlowReading {
  const tank = createSimulation({ tankCapacity: capacity, ...circulationOf(circulation) });
  const state = produce(stock(tank, species, 1), (draft) => {
    for (const fish of draft.fish) fish.hardinessOffset = 0;
  });

  const fish = state.fish[0];
  if (fish === undefined) throw new Error(`no ${species} in the ${capacity} L tank to read`);

  const vitality = computeFishVitality(
    fish,
    state.resources,
    state.plants,
    state.resources.water,
    state.tank.capacity,
    config.livestock
  );

  return {
    lph: state.resources.flow,
    turnover: state.resources.flow / state.resources.water,
    stress: vitality.breakdown.stressors.find((s) => s.key === 'flow')?.amount ?? 0,
    net: vitality.breakdown.net,
  };
}

export interface FlowWatch {
  /** Worst flow damage any fish took at any hour of the run, %/h. */
  peakStress: number;
  /** Highest turnover the tank reached — evaporation concentrates it. */
  peakTurnover: number;
  /** Lowest health any fish in the roster fell to — what the player watches. */
  minHealth: number;
  /** How many of the fish stocked at the start are still alive. */
  survivors: number;
  /** Day the first of them died, or null if the roster held. */
  firstDeathDay: number | null;
}

export interface KeeperRoutine {
  /** Grams of food, once a day. */
  feed?: number;
  /** Fraction of the water swapped, once a week. */
  waterChange?: number;
  /** Whether the keeper tops the tank back up each day. */
  topOff?: boolean;
  config?: TunableConfig;
  /**
   * Rewrite the tank before each tick. A probe pins the inputs it is not
   * varying here, so one channel can be read with the rest held still.
   */
  hold?: (state: SimulationState) => SimulationState;
}

/**
 * Run a tank on a keeper's routine for `days` — the one loop every routine
 * measurement drives, so a swept number and an asserted number come off the
 * same schedule.
 *
 * `watch` sees each hour with the state that went into the tick and the state
 * it left behind. Water moves in the immediate and equipment tiers —
 * evaporation, then the ATO — before livestock runs against it, so anything a
 * fish was actually charged for only exists once the tick is over.
 */
export function keep(
  state: SimulationState,
  days: number,
  { feed, waterChange, topOff = false, config = DEFAULT_CONFIG, hold }: KeeperRoutine = {},
  watch?: (hour: number, before: SimulationState, after: SimulationState) => void
): SimulationState {
  let running = state;

  for (let hour = 1; hour <= days * DAY; hour++) {
    if (feed !== undefined && hour % DAY === 9) {
      running = applyAction(running, { type: 'feed', amount: feed }).state;
    }
    if (topOff && hour % DAY === 10) {
      running = applyAction(running, { type: 'topOff' }).state;
    }
    if (waterChange !== undefined && hour % (7 * DAY) === 0) {
      running = applyAction(running, { type: 'waterChange', amount: waterChange }).state;
    }

    if (hold !== undefined) running = hold(running);
    const before = running;
    running = tick(running, config);
    watch?.(hour, before, running);
  }

  return running;
}

/**
 * Run a stocked tank on a keeper's routine and watch what its circulation does
 * to the roster.
 */
export function watchFlow(
  state: SimulationState,
  days: number,
  routine: KeeperRoutine = {}
): FlowWatch {
  const config = routine.config ?? DEFAULT_CONFIG;
  const roster = new Set(state.fish.map((fish) => fish.id));
  const mine = (of: SimulationState): SimulationState['fish'] =>
    of.fish.filter((f) => roster.has(f.id));

  let peakStress = 0;
  let peakTurnover = 0;
  let minHealth = 100;
  let firstDeathHour: number | null = null;

  const final = keep(state, days, routine, (hour, before, after) => {
    const { water } = after.resources;
    peakTurnover = Math.max(peakTurnover, water > 0 ? after.resources.flow / water : 0);

    for (const fish of mine(before)) {
      const vitality = computeFishVitality(
        fish,
        after.resources,
        after.plants,
        water,
        after.tank.capacity,
        config.livestock
      );
      peakStress = Math.max(
        peakStress,
        vitality.breakdown.stressors.find((s) => s.key === 'flow')?.amount ?? 0
      );
    }

    for (const fish of mine(after)) minHealth = Math.min(minHealth, fish.health);
    if (firstDeathHour === null && mine(after).length < roster.size) firstDeathHour = hour;
  });

  return {
    peakStress,
    peakTurnover,
    minHealth,
    survivors: mine(final).length,
    firstDeathDay: firstDeathHour === null ? null : firstDeathHour / DAY,
  };
}

/** Share of the surface ceiling a colony occupies, 0–1. */
export function colonyFill(
  state: SimulationState,
  resource: 'aob' | 'nob' = 'aob',
  config: TunableConfig = DEFAULT_CONFIG
): number {
  const ceiling = calculateMaxBacteria(state.resources.surface, config.nitrogenCycle);
  return ceiling > 0 ? state.resources[resource] / ceiling : 0;
}

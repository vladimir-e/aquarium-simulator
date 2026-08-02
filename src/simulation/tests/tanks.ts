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
import { createSimulation, type FishSpecies, type SimulationState } from '../state.js';
import { tick } from '../tick.js';
import { applyAction } from '../actions/index.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../config/index.js';
import { getMassFromPpm, getPpm } from '../resources/helpers.js';
import { calculateMaxBacteria } from '../systems/nitrogen-cycle.js';
import type { SubstrateType } from '../equipment/substrate.js';

export const DAY = 24;

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
 * A fishless, unfed, unplanted tank: the bed is the only thing in it that can
 * produce ammonia, so it alone decides whether — and when — the tank cycles.
 *
 * The ATO is on by default so evaporation doesn't quietly concentrate every
 * reading: over the two months these runs cover, an open tank loses most of
 * its water, and a rising ppm would then be a story about the water level
 * rather than about the bed. Turn it off to watch evaporation itself.
 */
export function fishlessTank(
  substrate: SubstrateType,
  { capacity = 20, ato = true }: { capacity?: number; ato?: boolean } = {}
): SimulationState {
  return createSimulation({
    tankCapacity: capacity,
    substrate: { type: substrate },
    ato: { enabled: ato },
  });
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
  config: TunableConfig = DEFAULT_CONFIG,
  days = 30
): SimulationState {
  return run(fishlessTank('aqua_soil', { capacity }), days * DAY, config);
}

/**
 * Add `count` fish of one species.
 *
 * `sex` forces the whole roster one way, which is how a run watches a stocked
 * tank over months without breeding turning it into a different experiment.
 */
export function stock(
  state: SimulationState,
  species: FishSpecies,
  count: number,
  { sex }: { sex?: 'male' | 'female' } = {}
): SimulationState {
  let stocked = state;
  for (let i = 0; i < count; i++) {
    stocked = applyAction(stocked, { type: 'addFish', species }).state;
  }
  if (sex === undefined) return stocked;
  return produce(stocked, (draft) => {
    for (const fish of draft.fish) fish.sex = sex;
  });
}

export interface CycleTrace {
  /** Day AOB first appear, or null if ammonia never reached their threshold. */
  spawnDay: number | null;
  ammoniaPeakPpm: number;
  nitritePeakPpm: number;
  nitritePeakDay: number;
  /** Day nitrite first drops under 0.1 ppm past the peak with nitrate still rising. */
  cycledDay: number | null;
}

export interface TraceOptions {
  substrate?: SubstrateType;
  days?: number;
  config?: TunableConfig;
}

/** Watch a fishless tank through its whole cycle and report the shape of it. */
export function traceCycle(capacity: number, options: TraceOptions = {}): CycleTrace {
  const { substrate = 'aqua_soil', days = 40, config = DEFAULT_CONFIG } = options;

  let state = fishlessTank(substrate, { capacity });
  let spawnHour: number | null = null;
  let ammoniaPeakPpm = 0;
  let nitritePeakPpm = 0;
  let peakHour = 0;
  let cycledHour: number | null = null;
  let previousNitrate = 0;

  for (let hour = 1; hour <= days * DAY; hour++) {
    state = tick(state, config);
    const ammonia = getPpm(state.resources.ammonia, state.resources.water);
    const nitrite = getPpm(state.resources.nitrite, state.resources.water);

    if (spawnHour === null && state.resources.aob > 0) spawnHour = hour;
    if (ammonia > ammoniaPeakPpm) ammoniaPeakPpm = ammonia;
    if (nitrite > nitritePeakPpm) {
      nitritePeakPpm = nitrite;
      peakHour = hour;
    }
    if (
      cycledHour === null &&
      nitritePeakPpm > 0.5 &&
      nitrite < 0.1 &&
      state.resources.nitrate > previousNitrate
    ) {
      cycledHour = hour;
    }
    previousNitrate = state.resources.nitrate;
  }

  return {
    spawnDay: spawnHour === null ? null : spawnHour / DAY,
    ammoniaPeakPpm,
    nitritePeakPpm,
    nitritePeakDay: peakHour / DAY,
    cycledDay: cycledHour === null ? null : cycledHour / DAY,
  };
}

/**
 * ppm of ammonia still standing 24 h after a dose onto a cycled tank — the
 * fishless-cycling keeper's own test that a biofilter is ready for stock.
 */
export function doseClearance(
  capacity: number,
  { dosePpm = 2, config = DEFAULT_CONFIG }: { dosePpm?: number; config?: TunableConfig } = {}
): number {
  const dosed = produce(cycledTank(capacity, config), (draft) => {
    draft.resources.ammonia += getMassFromPpm(dosePpm, draft.resources.water);
  });
  const cleared = run(dosed, DAY, config);
  return getPpm(cleared.resources.ammonia, cleared.resources.water);
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

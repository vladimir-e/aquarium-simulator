/**
 * Calibration test helpers for running multi-tick scenarios.
 *
 * Provides utilities to set up tank configurations, run simulations
 * for many ticks with scheduled actions, and inspect results.
 */

import { produce } from 'immer';
import type { SimulationState, SimulationConfig, FishSpecies, PlantSpecies } from './state.js';
import type { Action } from './actions/types.js';
import { createSimulation } from './state.js';
import { tick } from './tick.js';
import { applyAction } from './actions/index.js';
import { getPpm, getMassFromPpm } from './resources/helpers.js';
import type { TunableConfig } from './config/index.js';
import { nitrogenCycleDefaults } from './config/nitrogen-cycle.js';

// Re-export helpers for test convenience
export { getPpm as ppm, getMassFromPpm as massFromPpm };

/**
 * Scheduled action to apply before a specific tick.
 */
export interface ScheduledAction {
  tick: number;
  action: Action;
}

/**
 * Options for running a multi-tick calibration scenario.
 */
export interface ScenarioOptions {
  /** Tank configuration */
  setup: SimulationConfig;
  /** Total ticks to simulate */
  ticks: number;
  /** Actions to apply before specific ticks */
  actions?: ScheduledAction[];
  /** Called before each tick. Can modify state (e.g., re-dose ammonia). */
  beforeTick?: (state: SimulationState, tickNumber: number) => SimulationState;
  /** Called after each tick. Read-only observation (e.g., track maximums). */
  afterTick?: (state: SimulationState, tickNumber: number) => void;
  /** Initial state modification before any ticks run. */
  beforeStart?: (state: SimulationState) => SimulationState;
  /** Custom tunable config (uses DEFAULT_CONFIG if omitted). */
  config?: TunableConfig;
}

/**
 * Run a multi-tick scenario and return the final state.
 */
export function runScenario(options: ScenarioOptions): SimulationState {
  const {
    setup,
    ticks,
    actions = [],
    beforeTick,
    afterTick,
    beforeStart,
    config,
  } = options;

  let state = createSimulation(setup);

  if (beforeStart) {
    state = beforeStart(state);
  }

  // Index scheduled actions by tick for O(1) lookup
  const actionsByTick = new Map<number, Action[]>();
  for (const sa of actions) {
    const existing = actionsByTick.get(sa.tick) ?? [];
    existing.push(sa.action);
    actionsByTick.set(sa.tick, existing);
  }

  for (let t = 1; t <= ticks; t++) {
    // Apply scheduled actions before tick processing
    const tickActions = actionsByTick.get(t);
    if (tickActions) {
      for (const action of tickActions) {
        state = applyAction(state, action).state;
      }
    }

    // Before-tick hook (can modify state)
    if (beforeTick) {
      state = beforeTick(state, t);
    }

    // Process tick
    state = config ? tick(state, config) : tick(state);

    // After-tick hook (observation only)
    if (afterTick) {
      afterTick(state, t);
    }
  }

  return state;
}

/**
 * Create a pre-cycled tank with established bacteria colonies.
 * Bacteria at carrying capacity, baseline nitrate, no ammonia/nitrite.
 */
export function createCycledTank(
  setup: SimulationConfig,
  options?: {
    nitratePpm?: number;
    aobFraction?: number;
    nobFraction?: number;
  }
): SimulationState {
  const state = createSimulation(setup);
  const maxBacteria = state.resources.surface * nitrogenCycleDefaults.bacteriaPerCm2;

  return produce(state, (draft) => {
    draft.resources.aob = maxBacteria * (options?.aobFraction ?? 1.0);
    draft.resources.nob = maxBacteria * (options?.nobFraction ?? 1.0);
    draft.resources.nitrate = getMassFromPpm(
      options?.nitratePpm ?? 15,
      draft.resources.water
    );
  });
}

/**
 * Add multiple fish to a state.
 */
export function addFish(
  state: SimulationState,
  species: FishSpecies,
  count: number
): SimulationState {
  let s = state;
  for (let i = 0; i < count; i++) {
    s = applyAction(s, { type: 'addFish', species }).state;
  }
  return s;
}

/**
 * Add multiple plants to a state.
 */
export function addPlants(
  state: SimulationState,
  species: PlantSpecies,
  count: number,
  initialSize?: number
): SimulationState {
  let s = state;
  for (let i = 0; i < count; i++) {
    s = applyAction(s, { type: 'addPlant', species, initialSize }).state;
  }
  return s;
}

/**
 * Directly set ammonia to a target ppm.
 */
export function setAmmoniaPpm(state: SimulationState, targetPpm: number): SimulationState {
  return produce(state, (draft) => {
    draft.resources.ammonia = getMassFromPpm(targetPpm, draft.resources.water);
  });
}

/**
 * Directly add ammonia mass (mg) to the state.
 */
export function addAmmonia(state: SimulationState, massInMg: number): SimulationState {
  return produce(state, (draft) => {
    draft.resources.ammonia += massInMg;
  });
}

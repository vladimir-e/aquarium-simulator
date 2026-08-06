/**
 * Livestock processing - handles fish metabolism and health.
 *
 * Called during ACTIVE tier processing in tick.ts (after plants).
 * Returns updated state and effects for resource changes.
 */

import { produce } from 'immer';
import type { SimulationState } from '../state.js';
import type { Effect } from '../core/effects.js';
import type { TunableConfig } from '../config/index.js';
import { livestockDefaults } from '../config/livestock.js';
import { processMetabolism } from '../systems/metabolism.js';
import { processHealth } from '../systems/fish-health.js';
import { createLog } from '../core/logging.js';
import { getPpm } from '../resources/index.js';

export interface LivestockProcessingResult {
  /** Updated state with modified fish */
  state: SimulationState;
  /** Effects for resource changes (food, waste, O2, CO2) */
  effects: Effect[];
  /**
   * Vitality net rate per surviving fish this tick, keyed by id. Passed
   * to `processBreeding` so the spawn gate can require a non-negative
   * trend without recomputing stressors.
   */
  netByFishId: Map<string, number>;
}

/**
 * Process livestock for one tick.
 *
 * Handles:
 * 1. Metabolism: food consumption, waste/CO2 production, satiation/age updates
 * 2. Health: stressor calculations, health recovery/damage, death
 */
export function processLivestock(
  state: SimulationState,
  config: TunableConfig
): LivestockProcessingResult {
  const effects: Effect[] = [];
  const livestockConfig = config.livestock ?? livestockDefaults;

  // Skip if no fish
  if (state.fish.length === 0) {
    return { state, effects, netByFishId: new Map() };
  }

  // 1. Process metabolism (food consumption, waste, respiration, satiation, age)
  const metabolismResult = processMetabolism(
    state.fish,
    state.resources.food,
    state.resources.oxygen,
    livestockConfig
  );

  // Add metabolism effects
  if (metabolismResult.foodConsumed > 0) {
    effects.push({
      tier: 'active',
      resource: 'food',
      delta: -metabolismResult.foodConsumed,
      source: 'fish-metabolism',
    });
  }

  if (metabolismResult.wasteProduced > 0) {
    effects.push({
      tier: 'active',
      resource: 'waste',
      delta: metabolismResult.wasteProduced,
      source: 'fish-metabolism',
    });
  }

  // Direct ammonia excretion via gills (ammoniotelic pathway).
  // Stored as NH3 compound mass (mg); MW scaling handled in metabolism.
  if (metabolismResult.ammoniaProduced > 0) {
    effects.push({
      tier: 'active',
      resource: 'ammonia',
      delta: metabolismResult.ammoniaProduced,
      source: 'fish-gill-excretion',
    });
  }

  // Metabolism produces an intrinsic per-fish mass rate; the gases are stored
  // as concentrations, so they convert through the tank's water volume.
  const waterVolume = state.resources.water;
  const oxygenDrawn = getPpm(metabolismResult.oxygenConsumedMg, waterVolume);
  if (oxygenDrawn > 0) {
    effects.push({
      tier: 'active',
      resource: 'oxygen',
      delta: -oxygenDrawn,
      source: 'fish-respiration',
    });
  }

  const co2Exhaled = getPpm(metabolismResult.co2ProducedMg, waterVolume);
  if (co2Exhaled > 0) {
    effects.push({
      tier: 'active',
      resource: 'co2',
      delta: co2Exhaled,
      source: 'fish-respiration',
    });
  }

  // 2. Process health (stressors, recovery, death)
  const healthResult = processHealth(
    metabolismResult.updatedFish,
    state.resources,
    state.plants,
    state.resources.water,
    state.tank.capacity,
    livestockConfig
  );

  // Add death waste effects
  if (healthResult.deathWaste > 0) {
    effects.push({
      tier: 'active',
      resource: 'waste',
      delta: healthResult.deathWaste,
      source: 'fish-death',
    });
  }

  // Update fish in state and log deaths
  const newState = produce(state, (draft) => {
    draft.fish = healthResult.survivingFish;

    for (const fishName of healthResult.deadFishNames) {
      draft.logs.push(
        createLog(
          draft.tick,
          'simulation',
          'warning',
          `${fishName} died`,
          'fish-died'
        )
      );
    }
  });

  return { state: newState, effects, netByFishId: healthResult.netByFishId };
}

// Re-export for testing and external use
export { processMetabolism } from '../systems/metabolism.js';
export { processHealth, computeFishVitality } from '../systems/fish-health.js';
export { processBreeding } from './breeding.js';
export { createFish, fishMassForAge } from './create-fish.js';

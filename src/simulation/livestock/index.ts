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

export interface LivestockProcessingResult {
  /** Updated state with modified fish */
  state: SimulationState;
  /** Effects for resource changes (food, waste, O2, CO2) */
  effects: Effect[];
}

/**
 * Process livestock for one tick.
 *
 * Handles:
 * 1. Metabolism: food consumption, waste/CO2 production, hunger/age updates
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
    return { state, effects };
  }

  // 1. Process metabolism (food consumption, waste, respiration, hunger, age)
  const metabolismResult = processMetabolism(
    state.fish,
    state.resources.food,
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

  if (metabolismResult.oxygenDelta !== 0) {
    effects.push({
      tier: 'active',
      resource: 'oxygen',
      delta: metabolismResult.oxygenDelta,
      source: 'fish-respiration',
    });
  }

  if (metabolismResult.co2Delta !== 0) {
    effects.push({
      tier: 'active',
      resource: 'co2',
      delta: metabolismResult.co2Delta,
      source: 'fish-respiration',
    });
  }

  // 2. Process health (stressors, recovery, death)
  const healthResult = processHealth(
    metabolismResult.updatedFish,
    state.resources,
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
          `${fishName} died`
        )
      );
    }
  });

  return { state: newState, effects };
}

// Re-export for testing and external use
export { processMetabolism } from '../systems/metabolism.js';
export { processHealth, calculateStress } from '../systems/fish-health.js';

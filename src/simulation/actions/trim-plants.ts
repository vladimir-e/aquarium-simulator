/**
 * Trim plants action - reduces overgrown plants to target size.
 *
 * Trimmed material exits the system cleanly (not converted to waste).
 * This simulates the aquarist properly removing and disposing of trimmed leaves.
 */

import { produce } from 'immer';
import type { SimulationState } from '../state.js';
import { createLog } from '../core/logging.js';
import type { ActionResult, TrimPlantsAction } from './types.js';

/**
 * Check if any plants can be trimmed.
 * Plants can be trimmed if any plant is above 50% size.
 */
export function canTrimPlants(state: SimulationState): boolean {
  return state.plants.some((p) => p.size > 50);
}

/**
 * Get the number of plants that would be affected by trimming to a target size.
 */
export function getPlantsToTrimCount(
  state: SimulationState,
  targetSize: number
): number {
  return state.plants.filter((p) => p.size > targetSize).length;
}

/**
 * Trim plants action - reduces all plants above target to the target size.
 * Trimmed material exits the system (not converted to waste).
 *
 * @param state - Current simulation state
 * @param action - Trim action with target size
 * @returns Updated state and result message
 */
export function trimPlants(
  state: SimulationState,
  action: TrimPlantsAction
): ActionResult {
  const { targetSize } = action;

  // Validate target size
  if (![50, 85, 100].includes(targetSize)) {
    return {
      state,
      message: 'Invalid target size for trimming',
    };
  }

  // Check if any plants need trimming
  const plantsToTrim = state.plants.filter((p) => p.size > targetSize);
  if (plantsToTrim.length === 0) {
    return {
      state,
      message: `No plants above ${targetSize}% to trim`,
    };
  }

  // Calculate total amount trimmed (for logging)
  const totalTrimmed = plantsToTrim.reduce(
    (sum, p) => sum + (p.size - targetSize),
    0
  );

  const newState = produce(state, (draft) => {
    // Trim each plant to target size
    for (const plant of draft.plants) {
      if (plant.size > targetSize) {
        plant.size = targetSize;
      }
    }

    // Log the trim action
    draft.logs.push(
      createLog(
        draft.tick,
        'user',
        'info',
        `Trimmed ${plantsToTrim.length} plant(s) to ${targetSize}% (${totalTrimmed.toFixed(0)}% total removed)`
      )
    );
  });

  return {
    state: newState,
    message: `Trimmed ${plantsToTrim.length} plant(s) to ${targetSize}%`,
  };
}

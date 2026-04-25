/**
 * Trim plants action - reduces plant size, either a single plant (when `plantId` is set)
 * or every plant above `targetSize` in bulk.
 *
 * Trimmed material exits the system cleanly (not converted to waste).
 * This simulates the aquarist properly removing and disposing of trimmed leaves.
 */

import { produce } from 'immer';
import { PLANT_SPECIES_DATA, type SimulationState } from '../state.js';
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
 * Trim plants action.
 *
 * If `action.plantId` is set, trims only that plant down to `targetSize` (no-op if
 * the plant is missing or already at/below target). Otherwise, reduces every plant
 * above `targetSize` to the target. Trimmed material exits the system — the waste
 * pool is untouched.
 */
export function trimPlants(
  state: SimulationState,
  action: TrimPlantsAction
): ActionResult {
  const { targetSize, plantId } = action;

  // Validate target size: must be a finite number in [0, 100].
  if (!Number.isFinite(targetSize) || targetSize < 0 || targetSize > 100) {
    return {
      state,
      message: `Invalid target size for trimming (must be a number in [0, 100])`,
    };
  }

  return plantId === undefined
    ? trimBulk(state, targetSize)
    : trimSingle(state, targetSize, plantId);
}

function trimBulk(state: SimulationState, targetSize: number): ActionResult {
  const plantsToTrim = state.plants.filter((p) => p.size > targetSize);
  if (plantsToTrim.length === 0) {
    return {
      state,
      message: `No plants above ${targetSize}% to trim`,
    };
  }

  const totalTrimmed = plantsToTrim.reduce(
    (sum, p) => sum + (p.size - targetSize),
    0
  );

  const newState = produce(state, (draft) => {
    for (const plant of draft.plants) {
      if (plant.size > targetSize) {
        plant.size = targetSize;
      }
    }
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

function trimSingle(
  state: SimulationState,
  targetSize: number,
  plantId: string
): ActionResult {
  const plant = state.plants.find((p) => p.id === plantId);
  if (!plant) {
    return { state, message: `Plant not found` };
  }
  if (plant.size <= targetSize) {
    const speciesName = PLANT_SPECIES_DATA[plant.species].name;
    return {
      state,
      message: `${speciesName} is already at or below ${targetSize}%`,
    };
  }

  const speciesName = PLANT_SPECIES_DATA[plant.species].name;
  const removed = plant.size - targetSize;

  const newState = produce(state, (draft) => {
    const target = draft.plants.find((p) => p.id === plantId);
    // Guarded above; the find on the draft cannot realistically miss, but be defensive.
    if (!target) return;
    target.size = targetSize;
    draft.logs.push(
      createLog(
        draft.tick,
        'user',
        'info',
        `Trimmed ${speciesName} to ${targetSize}% (${removed.toFixed(0)}% removed)`
      )
    );
  });

  return {
    state: newState,
    message: `Trimmed ${speciesName} to ${targetSize}% (${removed.toFixed(0)}% removed)`,
  };
}

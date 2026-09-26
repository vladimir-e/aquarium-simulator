/**
 * Trim plants action - reduces plant size, either a single plant (when `plantId` is set)
 * or every plant above `targetSize` in bulk — of one family when `familyId` is set.
 *
 * Trimmed material exits the system cleanly (not converted to waste).
 * This simulates the aquarist properly removing and disposing of trimmed leaves.
 */

import { produce } from 'immer';
import type { Plant, SimulationState } from '../state.js';
import { PLANT_SPECIES_DATA } from '../plants/species.js';
import { createLog } from '../core/logging.js';
import { plantsDefaults, type PlantsConfig } from '../config/plants.js';
import { isPlantableSize } from '../systems/plant-lifecycle.js';
import type { ActionResult, TrimPlantsAction } from './types.js';

type TrimScope = Omit<TrimPlantsAction, 'type'>;

/** Whether a trim cuts this plant: over the target, and the plant or family it names if it names one. */
function cuts({ targetSize, plantId, familyId }: TrimScope): (plant: Plant) => boolean {
  return (plant) =>
    plant.size > targetSize &&
    (plantId !== undefined ? plant.id === plantId : familyId === undefined || plant.familyId === familyId);
}

/** Whether `trimPlants` would cut anything: a plantable target, and a plant in its scope over it. */
export function canTrimPlants(
  state: SimulationState,
  scope: TrimScope,
  plantsConfig: PlantsConfig = plantsDefaults
): boolean {
  return isPlantableSize(scope.targetSize, plantsConfig) && state.plants.some(cuts(scope));
}

/** Plants a trim of the whole tank to `targetSize` cuts. */
export function getPlantsToTrimCount(state: SimulationState, targetSize: number): number {
  return state.plants.filter(cuts({ targetSize })).length;
}

/**
 * Trim plants action.
 *
 * If `action.plantId` is set, trims only that plant down to `targetSize` (no-op if
 * the plant is missing or already at/below target). Otherwise, reduces every plant
 * above `targetSize` to the target — every plant of `action.familyId` when that is
 * set. Trimmed material exits the system — the waste pool is untouched. A target
 * under `deathSizeThreshold` is refused: the cut would leave a plant the next
 * tick retires.
 */
export function trimPlants(
  state: SimulationState,
  action: TrimPlantsAction,
  plantsConfig: PlantsConfig = plantsDefaults
): ActionResult {
  const { targetSize, plantId, familyId } = action;

  if (!isPlantableSize(targetSize, plantsConfig)) {
    return {
      state,
      message: `Invalid target size for trimming (must be a number in [${plantsConfig.deathSizeThreshold}, 100])`,
    };
  }

  return plantId === undefined
    ? trimBulk(state, targetSize, familyId)
    : trimSingle(state, targetSize, plantId);
}

function trimBulk(state: SimulationState, targetSize: number, familyId?: string): ActionResult {
  const trims = cuts({ targetSize, familyId });
  const plantsToTrim = state.plants.filter(trims);
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
      if (trims(plant)) {
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

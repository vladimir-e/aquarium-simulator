/**
 * Water Change action - removes old water and replaces with fresh tap water.
 *
 * Water change affects:
 * - Nitrogen compounds: removes proportional mass (ammonia, nitrite, nitrate)
 * - Temperature: blends toward tap water temperature
 * - Water volume: unchanged (removed = added)
 */

import { produce } from 'immer';
import type { SimulationState } from '../state.js';
import { createLog } from '../core/logging.js';
import type { ActionResult, WaterChangeAction } from './types.js';

/** Valid water change amounts as fractions */
export type WaterChangeAmount = 0.1 | 0.25 | 0.5 | 0.9;

/** Valid water change percentages for UI display */
export const WATER_CHANGE_AMOUNTS: WaterChangeAmount[] = [0.1, 0.25, 0.5, 0.9];

/**
 * Perform a water change: remove old water (with dissolved compounds)
 * and replace with fresh tap water at tap temperature.
 *
 * Physics:
 * - Removed water carries proportional nitrogen compound mass
 * - Temperature blends via heat capacity: (oldTemp * remaining + tapTemp * added) / total
 */
export function waterChange(
  state: SimulationState,
  action: WaterChangeAction
): ActionResult {
  const { amount } = action;

  // Validate amount
  if (amount <= 0 || amount > 1) {
    return {
      state,
      message: 'Invalid water change amount',
    };
  }

  const currentWater = state.resources.water;

  // Nothing to change if tank is empty
  if (currentWater <= 0) {
    return {
      state,
      message: 'No water to change',
    };
  }

  const waterRemoved = currentWater * amount;
  const remainingWater = currentWater - waterRemoved;

  const newState = produce(state, (draft) => {
    // 1. Remove proportional nitrogen compound mass
    // Water leaving carries dissolved compounds
    draft.resources.ammonia *= 1 - amount;
    draft.resources.nitrite *= 1 - amount;
    draft.resources.nitrate *= 1 - amount;

    // 2. Temperature blending
    // newTemp = (oldTemp * remaining + tapTemp * added) / total
    const oldTemp = draft.resources.temperature;
    const tapTemp = draft.environment.tapWaterTemperature;
    const newTemp =
      (oldTemp * remainingWater + tapTemp * waterRemoved) / currentWater;
    draft.resources.temperature = +newTemp.toFixed(2);

    // 3. Water volume unchanged (removed = added)
    // draft.resources.water stays the same

    // 4. Log the action
    const percentLabel = Math.round(amount * 100);
    draft.logs.push(
      createLog(
        draft.tick,
        'user',
        'info',
        `Water change: ${percentLabel}% (${waterRemoved.toFixed(1)}L)`
      )
    );
  });

  const percentLabel = Math.round(amount * 100);
  return {
    state: newState,
    message: `Changed ${percentLabel}% water (${waterRemoved.toFixed(1)}L)`,
  };
}

/**
 * Water Change action - removes old water and replaces with fresh tap water.
 *
 * Water change affects:
 * - Nitrogen compounds: removes proportional mass (ammonia, nitrite, nitrate)
 * - Temperature: blends toward tap water temperature
 * - Dissolved gases: O2 and CO2 blend with tap water concentrations
 * - pH: blends toward tap water pH using H+ concentration math
 * - Water volume: always restores to 100% capacity after change
 */

import { produce } from 'immer';
import type { SimulationState } from '../state.js';
import { createLog } from '../core/logging.js';
import { blendTemperature, blendConcentration, blendPH } from '../core/blending.js';
import { calculateO2Saturation } from '../systems/gas-exchange.js';
import { gasExchangeDefaults } from '../config/gas-exchange.js';
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
  const capacity = state.tank.capacity;

  // Nothing to change if tank is empty
  if (currentWater <= 0) {
    return {
      state,
      message: 'No water to change',
    };
  }

  // Calculate water dynamics:
  // 1. Remove X% of current water
  // 2. Fill back to 100% capacity
  const waterRemoved = currentWater * amount;
  const remainingWater = currentWater - waterRemoved;
  const waterAdded = capacity - remainingWater; // Fill to 100%

  const newState = produce(state, (draft) => {
    // 1. Remove proportional dissolved compound mass
    // Water leaving carries dissolved compounds (nitrogen + nutrients)
    draft.resources.ammonia *= 1 - amount;
    draft.resources.nitrite *= 1 - amount;
    draft.resources.nitrate *= 1 - amount;
    draft.resources.phosphate *= 1 - amount;
    draft.resources.potassium *= 1 - amount;
    draft.resources.iron *= 1 - amount;

    // 2. Temperature blending (remaining tank water + fresh tap water)
    const oldTemp = draft.resources.temperature;
    const tapTemp = draft.environment.tapWaterTemperature;
    draft.resources.temperature = blendTemperature(
      oldTemp,
      remainingWater,
      tapTemp,
      waterAdded
    );

    // 3. Dissolved gas blending (O2 and CO2)
    // Tap water comes saturated with O2 (at tap temp) and at atmospheric CO2
    const tapO2Saturation = calculateO2Saturation(tapTemp);
    const tapCo2 = gasExchangeDefaults.atmosphericCo2;

    // Blend O2: remaining tank water + fresh tap water at saturation
    draft.resources.oxygen = blendConcentration(
      draft.resources.oxygen,
      remainingWater,
      tapO2Saturation,
      waterAdded
    );

    // Blend CO2: remaining tank water + fresh tap water at atmospheric
    draft.resources.co2 = blendConcentration(
      draft.resources.co2,
      remainingWater,
      tapCo2,
      waterAdded
    );

    // 4. Blend pH using H+ concentration math
    const tapPH = draft.environment.tapWaterPH;
    draft.resources.ph = blendPH(
      draft.resources.ph,
      remainingWater,
      tapPH,
      waterAdded
    );

    // 5. Restore water to 100% capacity
    draft.resources.water = capacity;

    // 6. Log the action
    const percentLabel = Math.round(amount * 100);
    draft.logs.push(
      createLog(
        draft.tick,
        'user',
        'info',
        `Water change: ${percentLabel}% (removed ${waterRemoved.toFixed(1)}L, added ${waterAdded.toFixed(1)}L)`
      )
    );
  });

  const percentLabel = Math.round(amount * 100);
  return {
    state: newState,
    message: `Changed ${percentLabel}% water (removed ${waterRemoved.toFixed(1)}L, added ${waterAdded.toFixed(1)}L)`,
  };
}

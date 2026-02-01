/**
 * Dose action - adds fertilizer nutrients to the tank.
 */

import { produce } from 'immer';
import type { SimulationState } from '../state.js';
import { createLog } from '../core/logging.js';
import type { ActionResult, DoseAction } from './types.js';
import { nutrientsDefaults, type FertilizerFormula } from '../config/nutrients.js';

/**
 * Default fertilizer formula - can be overridden by config
 */
const DEFAULT_FORMULA = nutrientsDefaults.fertilizerFormula;

/**
 * Minimum dose amount (ml)
 */
const MIN_DOSE_ML = 0.1;

/**
 * Maximum dose amount (ml) - prevents accidents
 */
const MAX_DOSE_ML = 50;

/**
 * Calculate nutrients added for a given dose amount.
 *
 * @param amountMl - Dose amount in milliliters
 * @param formula - Fertilizer formula (nutrients per ml)
 * @returns Object with nutrient amounts in mg
 */
export function calculateDoseNutrients(
  amountMl: number,
  formula: FertilizerFormula = DEFAULT_FORMULA
): { nitrate: number; phosphate: number; potassium: number; iron: number } {
  return {
    nitrate: amountMl * formula.nitrate,
    phosphate: amountMl * formula.phosphate,
    potassium: amountMl * formula.potassium,
    iron: amountMl * formula.iron,
  };
}

/**
 * Check if dosing is available (needs plants in tank).
 *
 * @param state - Current simulation state
 * @returns Whether dosing is available
 */
export function canDose(state: SimulationState): boolean {
  return state.plants.length > 0;
}

/**
 * Dose: Add fertilizer nutrients to the tank.
 * Adds nutrients according to the all-in-one fertilizer formula.
 *
 * @param state - Current simulation state
 * @param action - Dose action with amount in ml
 * @param formula - Optional fertilizer formula override
 * @returns Action result with updated state and message
 */
export function dose(
  state: SimulationState,
  action: DoseAction,
  formula: FertilizerFormula = DEFAULT_FORMULA
): ActionResult {
  const { amountMl } = action;

  // Validate amount
  if (amountMl <= 0) {
    return {
      state,
      message: 'Cannot dose 0 or negative amount',
    };
  }

  if (amountMl < MIN_DOSE_ML) {
    return {
      state,
      message: `Minimum dose is ${MIN_DOSE_ML}ml`,
    };
  }

  if (amountMl > MAX_DOSE_ML) {
    return {
      state,
      message: `Maximum dose is ${MAX_DOSE_ML}ml to prevent accidents`,
    };
  }

  // Calculate nutrients to add
  const nutrients = calculateDoseNutrients(amountMl, formula);

  const newState = produce(state, (draft) => {
    // Add nutrients to resources
    draft.resources.nitrate += nutrients.nitrate;
    draft.resources.phosphate += nutrients.phosphate;
    draft.resources.potassium += nutrients.potassium;
    draft.resources.iron += nutrients.iron;

    // Log the action
    draft.logs.push(
      createLog(
        draft.tick,
        'user',
        'info',
        `Dosed ${amountMl.toFixed(1)}ml fertilizer (+${nutrients.nitrate.toFixed(1)}mg NO3, +${nutrients.phosphate.toFixed(2)}mg PO4, +${nutrients.potassium.toFixed(1)}mg K, +${nutrients.iron.toFixed(2)}mg Fe)`
      )
    );
  });

  return {
    state: newState,
    message: `Dosed ${amountMl.toFixed(1)}ml fertilizer`,
  };
}

/**
 * Get a preview of what dosing a given amount would add.
 * Useful for UI to show expected effect before dosing.
 *
 * @param amountMl - Dose amount in ml
 * @param waterVolume - Current water volume in liters
 * @param formula - Fertilizer formula
 * @returns Preview object with ppm increases
 */
export function getDosePreview(
  amountMl: number,
  waterVolume: number,
  formula: FertilizerFormula = DEFAULT_FORMULA
): { nitratePpm: number; phosphatePpm: number; potassiumPpm: number; ironPpm: number } {
  if (waterVolume <= 0) {
    return { nitratePpm: 0, phosphatePpm: 0, potassiumPpm: 0, ironPpm: 0 };
  }

  const nutrients = calculateDoseNutrients(amountMl, formula);

  return {
    nitratePpm: nutrients.nitrate / waterVolume,
    phosphatePpm: nutrients.phosphate / waterVolume,
    potassiumPpm: nutrients.potassium / waterVolume,
    ironPpm: nutrients.iron / waterVolume,
  };
}

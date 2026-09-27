/**
 * Auto Doser equipment - automatically doses fertilizer on a schedule.
 *
 * Auto dosing:
 * - Configurable dose amount (0.5-10.0 ml)
 * - Doses once per day at its start hour
 * - Uses the same fertilizer formula as manual dosing
 *
 * Provides consistent daily nutrient replenishment for planted tanks.
 */

import { produce } from 'immer';
import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import type { FertilizerFormula } from '../config/nutrients.js';
import { calculateDoseNutrients } from '../actions/dose.js';

// ============================================================================
// Types
// ============================================================================

export interface AutoDoser {
  /** Whether auto dosing is enabled */
  enabled: boolean;
  /** Dose amount in milliliters */
  doseAmountMl: number;
  /** Hour of the day it doses at, 0–23. */
  startHour: number;
  /** Whether the doser has already dosed today (resets at midnight) */
  dosedToday: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default auto doser configuration.
 */
export const DEFAULT_AUTO_DOSER: AutoDoser = {
  enabled: false,
  doseAmountMl: 2.0, // 2ml default dose
  startHour: 8,
  dosedToday: false,
};

/**
 * Available dose amount options (ml).
 */
export const DOSE_AMOUNT_OPTIONS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 7.5, 10.0] as const;

export type DoseAmount = (typeof DOSE_AMOUNT_OPTIONS)[number];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if it's time to dose: at its start hour, and only once per day.
 *
 * @param hourOfDay - Current hour (0-23)
 * @param startHour - Hour the doser doses at
 * @param dosedToday - Whether already dosed today
 * @returns Whether should dose now
 */
export function shouldDose(hourOfDay: number, startHour: number, dosedToday: boolean): boolean {
  return hourOfDay === startHour && !dosedToday;
}

/**
 * Check if it's time to reset the dosedToday flag (at midnight).
 *
 * @param hourOfDay - Current hour (0-23)
 * @returns Whether to reset dosedToday
 */
export function shouldResetDosedToday(hourOfDay: number): boolean {
  return hourOfDay === 0;
}

// ============================================================================
// Equipment Update
// ============================================================================

export interface AutoDoserUpdateResult {
  /** Updated state with dosedToday flag and possibly added nutrients */
  state: SimulationState;
  /** Effects from dosing (nutrient additions) */
  effects: Effect[];
  /** Whether dosing occurred this tick */
  dosed: boolean;
}

/**
 * Process auto doser: if enabled and at scheduled time, add nutrients.
 * Returns updated state, effects, and whether dosing occurred.
 *
 * @param state - Current simulation state
 * @param formula - Fertilizer formula the doser is filled with
 */
export function autoDoserUpdate(
  state: SimulationState,
  formula: FertilizerFormula
): AutoDoserUpdateResult {
  const { autoDoser } = state.equipment;
  const hourOfDay = state.tick % 24;
  const effects: Effect[] = [];

  // Start with potentially resetting dosedToday at midnight
  let newState = state;
  if (shouldResetDosedToday(hourOfDay) && autoDoser.dosedToday) {
    newState = produce(state, (draft) => {
      draft.equipment.autoDoser.dosedToday = false;
    });
  }

  // Check if should dose
  if (!autoDoser.enabled) {
    return { state: newState, effects, dosed: false };
  }

  const currentDosedToday = newState.equipment.autoDoser.dosedToday;

  if (!shouldDose(hourOfDay, autoDoser.startHour, currentDosedToday)) {
    return { state: newState, effects, dosed: false };
  }

  // Calculate nutrients to add
  const nutrients = calculateDoseNutrients(autoDoser.doseAmountMl, formula);

  // Create effects for nutrient additions
  effects.push({
    tier: 'active',
    resource: 'nitrate',
    delta: nutrients.nitrate,
    source: 'auto-doser',
  });

  effects.push({
    tier: 'active',
    resource: 'phosphate',
    delta: nutrients.phosphate,
    source: 'auto-doser',
  });

  effects.push({
    tier: 'active',
    resource: 'potassium',
    delta: nutrients.potassium,
    source: 'auto-doser',
  });

  effects.push({
    tier: 'active',
    resource: 'iron',
    delta: nutrients.iron,
    source: 'auto-doser',
  });

  // Update state to mark as dosed today
  newState = produce(newState, (draft) => {
    draft.equipment.autoDoser.dosedToday = true;
  });

  return { state: newState, effects, dosed: true };
}

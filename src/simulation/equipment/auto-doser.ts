/**
 * Auto Doser equipment - automatically doses fertilizer on a schedule.
 *
 * Auto dosing:
 * - Configurable dose amount (0.5-10.0 ml)
 * - Schedule-based operation (uses DailySchedule)
 * - Doses once per day at the schedule start hour
 * - Uses the same fertilizer formula as manual dosing
 *
 * Provides consistent daily nutrient replenishment for planted tanks.
 */

import { produce } from 'immer';
import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import type { DailySchedule } from '../core/schedule.js';
import { nutrientsDefaults, type FertilizerFormula } from '../config/nutrients.js';
import { calculateDoseNutrients } from '../actions/dose.js';

// ============================================================================
// Types
// ============================================================================

export interface AutoDoser {
  /** Whether auto dosing is enabled */
  enabled: boolean;
  /** Dose amount in milliliters */
  doseAmountMl: number;
  /** Schedule for dosing (doses at startHour, duration ignored) */
  schedule: DailySchedule;
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
  schedule: {
    startHour: 8, // 8am (around lights on)
    duration: 1, // Unused for doser, but required by DailySchedule
  },
  dosedToday: false,
};

/**
 * Available dose amount options (ml).
 */
export const DOSE_AMOUNT_OPTIONS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 7.5, 10.0] as const;

export type DoseAmount = (typeof DOSE_AMOUNT_OPTIONS)[number];

/**
 * Minimum dose amount (ml)
 */
export const MIN_DOSE_ML = 0.5;

/**
 * Maximum dose amount (ml)
 */
export const MAX_DOSE_ML = 10.0;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if it's time to dose (at schedule start hour).
 *
 * @param hourOfDay - Current hour (0-23)
 * @param schedule - Auto doser schedule
 * @param dosedToday - Whether already dosed today
 * @returns Whether should dose now
 */
export function shouldDose(
  hourOfDay: number,
  schedule: DailySchedule,
  dosedToday: boolean
): boolean {
  // Only dose at the exact start hour, and only once per day
  return hourOfDay === schedule.startHour && !dosedToday;
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

/**
 * Format the dose preview for UI display.
 *
 * @param doseAmountMl - Dose amount in ml
 * @param waterVolume - Tank water volume in liters
 * @param formula - Fertilizer formula
 * @returns Formatted string with expected ppm changes
 */
export function formatDosePreview(
  doseAmountMl: number,
  waterVolume: number,
  formula: FertilizerFormula = nutrientsDefaults.fertilizerFormula
): string {
  if (waterVolume <= 0) return 'N/A';

  const nutrients = calculateDoseNutrients(doseAmountMl, formula);
  const nitratePpm = nutrients.nitrate / waterVolume;
  const phosphatePpm = nutrients.phosphate / waterVolume;
  const potassiumPpm = nutrients.potassium / waterVolume;
  const ironPpm = nutrients.iron / waterVolume;

  return `+${nitratePpm.toFixed(1)} NO3, +${phosphatePpm.toFixed(2)} PO4, +${potassiumPpm.toFixed(1)} K, +${ironPpm.toFixed(2)} Fe ppm`;
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
 * @param formula - Optional fertilizer formula override
 */
export function autoDoserUpdate(
  state: SimulationState,
  formula: FertilizerFormula = nutrientsDefaults.fertilizerFormula
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

  if (!shouldDose(hourOfDay, autoDoser.schedule, currentDosedToday)) {
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

/**
 * Apply auto doser configuration changes.
 *
 * @param state - Current simulation state
 * @param updates - Partial updates to apply
 * @returns Updated state
 */
export function applyAutoDoserSettings(
  state: SimulationState,
  updates: Partial<Omit<AutoDoser, 'dosedToday'>>
): SimulationState {
  return produce(state, (draft) => {
    if (updates.enabled !== undefined) {
      draft.equipment.autoDoser.enabled = updates.enabled;
    }
    if (updates.doseAmountMl !== undefined) {
      // Clamp to valid range
      draft.equipment.autoDoser.doseAmountMl = Math.max(
        MIN_DOSE_ML,
        Math.min(MAX_DOSE_ML, updates.doseAmountMl)
      );
    }
    if (updates.schedule !== undefined) {
      draft.equipment.autoDoser.schedule = updates.schedule;
    }
  });
}

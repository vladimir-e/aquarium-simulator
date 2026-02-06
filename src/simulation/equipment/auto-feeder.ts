/**
 * Auto Feeder equipment - automatically dispenses food on a schedule.
 *
 * Auto feeding:
 * - Configurable feed amount (0.1-2.0 grams)
 * - Schedule-based operation (uses DailySchedule)
 * - Feeds once per day at the schedule start hour
 * - Adds food to the tank resource for fish consumption
 *
 * Provides consistent daily feeding for fish in the tank.
 */

import { produce } from 'immer';
import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import type { DailySchedule } from '../core/schedule.js';

// ============================================================================
// Types
// ============================================================================

export interface AutoFeeder {
  /** Whether auto feeding is enabled */
  enabled: boolean;
  /** Feed amount in grams per feeding */
  feedAmountGrams: number;
  /** Schedule for feeding (feeds at startHour, duration ignored) */
  schedule: DailySchedule;
  /** Whether the feeder has already fed today (resets at midnight) */
  fedToday: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default auto feeder configuration.
 */
export const DEFAULT_AUTO_FEEDER: AutoFeeder = {
  enabled: false,
  feedAmountGrams: 0.5, // 0.5g default feed
  schedule: {
    startHour: 9, // 9am
    duration: 1, // Unused for feeder, but required by DailySchedule
  },
  fedToday: false,
};

/**
 * Available feed amount options (grams).
 */
export const FEED_AMOUNT_OPTIONS = [0.1, 0.2, 0.3, 0.5, 0.75, 1.0, 1.5, 2.0] as const;

export type FeedAmount = (typeof FEED_AMOUNT_OPTIONS)[number];

/**
 * Minimum feed amount (grams)
 */
export const MIN_FEED_GRAMS = 0.1;

/**
 * Maximum feed amount (grams)
 */
export const MAX_FEED_GRAMS = 2.0;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if it's time to feed (at schedule start hour).
 *
 * @param hourOfDay - Current hour (0-23)
 * @param schedule - Auto feeder schedule
 * @param fedToday - Whether already fed today
 * @returns Whether should feed now
 */
export function shouldFeed(
  hourOfDay: number,
  schedule: DailySchedule,
  fedToday: boolean
): boolean {
  // Only feed at the exact start hour, and only once per day
  return hourOfDay === schedule.startHour && !fedToday;
}

/**
 * Check if it's time to reset the fedToday flag (at midnight).
 *
 * @param hourOfDay - Current hour (0-23)
 * @returns Whether to reset fedToday
 */
export function shouldResetFedToday(hourOfDay: number): boolean {
  return hourOfDay === 0;
}

/**
 * Format the feed preview for UI display.
 *
 * @param feedAmountGrams - Feed amount in grams
 * @returns Formatted string with expected food addition
 */
export function formatFeedPreview(feedAmountGrams: number): string {
  return `+${feedAmountGrams.toFixed(2)}g food per day`;
}

// ============================================================================
// Equipment Update
// ============================================================================

export interface AutoFeederUpdateResult {
  /** Updated state with fedToday flag */
  state: SimulationState;
  /** Effects from feeding (food addition) */
  effects: Effect[];
  /** Whether feeding occurred this tick */
  fed: boolean;
}

/**
 * Process auto feeder: if enabled and at scheduled time, add food.
 * Returns updated state, effects, and whether feeding occurred.
 *
 * @param state - Current simulation state
 */
export function autoFeederUpdate(state: SimulationState): AutoFeederUpdateResult {
  const { autoFeeder } = state.equipment;
  const hourOfDay = state.tick % 24;
  const effects: Effect[] = [];

  // Start with potentially resetting fedToday at midnight
  let newState = state;
  if (shouldResetFedToday(hourOfDay) && autoFeeder.fedToday) {
    newState = produce(state, (draft) => {
      draft.equipment.autoFeeder.fedToday = false;
    });
  }

  // Check if should feed
  if (!autoFeeder.enabled) {
    return { state: newState, effects, fed: false };
  }

  const currentFedToday = newState.equipment.autoFeeder.fedToday;

  if (!shouldFeed(hourOfDay, autoFeeder.schedule, currentFedToday)) {
    return { state: newState, effects, fed: false };
  }

  // Create effect for food addition
  effects.push({
    tier: 'active',
    resource: 'food',
    delta: autoFeeder.feedAmountGrams,
    source: 'auto-feeder',
  });

  // Update state to mark as fed today
  newState = produce(newState, (draft) => {
    draft.equipment.autoFeeder.fedToday = true;
  });

  return { state: newState, effects, fed: true };
}

/**
 * Apply auto feeder configuration changes.
 *
 * @param state - Current simulation state
 * @param updates - Partial updates to apply
 * @returns Updated state
 */
export function applyAutoFeederSettings(
  state: SimulationState,
  updates: Partial<Omit<AutoFeeder, 'fedToday'>>
): SimulationState {
  return produce(state, (draft) => {
    if (updates.enabled !== undefined) {
      draft.equipment.autoFeeder.enabled = updates.enabled;
    }
    if (updates.feedAmountGrams !== undefined) {
      // Clamp to valid range
      draft.equipment.autoFeeder.feedAmountGrams = Math.max(
        MIN_FEED_GRAMS,
        Math.min(MAX_FEED_GRAMS, updates.feedAmountGrams)
      );
    }
    if (updates.schedule !== undefined) {
      draft.equipment.autoFeeder.schedule = updates.schedule;
    }
  });
}

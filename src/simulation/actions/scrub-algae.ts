/**
 * Scrub Algae action - manually removes algae from tank surfaces.
 *
 * Each scrub removes a random 10-30% of current algae level.
 * Disabled when algae < 5 (too little to mechanically remove).
 * Removed algae exits the system (not converted to waste).
 */

import { produce } from 'immer';
import type { SimulationState } from '../state.js';
import { createLog } from '../core/logging.js';
import type { ActionResult, ScrubAlgaeAction } from './types.js';

/** Minimum percentage of algae removed per scrub */
export const MIN_SCRUB_PERCENT = 0.1; // 10%

/** Maximum percentage of algae removed per scrub */
export const MAX_SCRUB_PERCENT = 0.3; // 30%

/** Minimum algae level required to scrub */
export const MIN_ALGAE_TO_SCRUB = 5;

/**
 * Check if algae can be scrubbed (level >= 5).
 * Returns true if scrubbing is possible.
 */
export function canScrubAlgae(state: SimulationState): boolean {
  return state.resources.algae >= MIN_ALGAE_TO_SCRUB;
}

/**
 * Generate a random scrub percentage between MIN and MAX.
 * Can be overridden for testing via the action's randomPercent field.
 */
function generateScrubPercent(): number {
  return (
    MIN_SCRUB_PERCENT + Math.random() * (MAX_SCRUB_PERCENT - MIN_SCRUB_PERCENT)
  );
}

/**
 * Scrub algae from tank surfaces.
 * Removes a random 10-30% of current algae level.
 *
 * @param state - Current simulation state
 * @param action - Scrub action (optionally with deterministic randomPercent for testing)
 * @returns Updated state and message
 */
export function scrubAlgae(
  state: SimulationState,
  action: ScrubAlgaeAction
): ActionResult {
  // Check if scrubbing is possible
  if (!canScrubAlgae(state)) {
    return {
      state,
      message: 'Algae level too low to scrub (minimum 5)',
    };
  }

  // Use provided percentage (for testing) or generate random
  const scrubPercent = action.randomPercent ?? generateScrubPercent();

  // Calculate amount removed
  const currentAlgae = state.resources.algae;
  const removed = currentAlgae * scrubPercent;
  const remaining = currentAlgae - removed;

  const newState = produce(state, (draft) => {
    // Remove algae (exits system, not added to waste)
    draft.resources.algae = remaining;
    draft.logs.push(
      createLog(
        draft.tick,
        'scrub',
        'info',
        `Scraped algae: removed ${removed.toFixed(1)}, remaining ${remaining.toFixed(1)}`
      )
    );
  });

  return {
    state: newState,
    message: `Removed ${removed.toFixed(1)} algae (${(scrubPercent * 100).toFixed(0)}%)`,
  };
}

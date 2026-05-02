/**
 * Scrub Algae action — manually remove algae mass from tank surfaces.
 *
 * Each scrub removes a random 10–30 % of the current algae mass.
 * Disabled when mass < 5 (too little to mechanically remove). Removed
 * mass exits the system (not converted to waste — same convention as
 * the natural mass-decay path in algae vitality).
 *
 * Operates on `state.algae.mass`; the algae vitality / orchestrator
 * picks up the new mass next tick and continues from there.
 */

import { produce } from 'immer';
import type { SimulationState } from '../state.js';
import { createLog } from '../core/logging.js';
import type { ActionResult, ScrubAlgaeAction } from './types.js';

/** Minimum percentage of algae mass removed per scrub */
export const MIN_SCRUB_PERCENT = 0.1; // 10%

/** Maximum percentage of algae mass removed per scrub */
export const MAX_SCRUB_PERCENT = 0.3; // 30%

/** Minimum algae mass required to scrub */
export const MIN_ALGAE_TO_SCRUB = 5;

/**
 * Check if algae can be scrubbed (mass >= 5).
 * Returns true if scrubbing is possible.
 */
export function canScrubAlgae(state: SimulationState): boolean {
  return state.algae.mass >= MIN_ALGAE_TO_SCRUB;
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
 * Removes a random 10-30% of current algae mass.
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
  const currentMass = state.algae.mass;
  const removed = currentMass * scrubPercent;
  const remaining = currentMass - removed;

  const newState = produce(state, (draft) => {
    // Remove mass (exits system, not added to waste)
    draft.algae.mass = remaining;
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

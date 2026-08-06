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
import { draw, type RngState } from '../core/rng.js';
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

/** How much of the mass this scrub takes off, between MIN and MAX. */
function scrubBite(rng: RngState): number {
  return MIN_SCRUB_PERCENT + draw(rng) * (MAX_SCRUB_PERCENT - MIN_SCRUB_PERCENT);
}

/**
 * Scrub algae from tank surfaces.
 * Removes a random 10-30% of current algae mass.
 *
 * @param state - Current simulation state
 * @param action - Scrub action (optionally naming the percent outright)
 * @returns Updated state and message
 */
export function scrubAlgae(
  state: SimulationState,
  action: ScrubAlgaeAction
): ActionResult {
  const named = action.randomPercent;
  if (
    named !== undefined &&
    (!Number.isFinite(named) || named < MIN_SCRUB_PERCENT || named > MAX_SCRUB_PERCENT)
  ) {
    return {
      state,
      message: `Scrub percent must be between ${MIN_SCRUB_PERCENT} and ${MAX_SCRUB_PERCENT}`,
    };
  }

  // Check if scrubbing is possible
  if (!canScrubAlgae(state)) {
    return {
      state,
      message: 'Algae level too low to scrub (minimum 5)',
    };
  }

  const currentMass = state.algae.mass;
  // The bite is needed before the producer opens — it sizes `removed` and the
  // message — so the draw runs on a copy that goes back in. Drawing on
  // `state.rng` would advance the caller's own stream.
  const rng = { ...state.rng };
  const percent = named ?? scrubBite(rng);
  const removed = currentMass * percent;

  const newState = produce(state, (draft) => {
    draft.rng = rng;
    // Removed mass exits the system, not added to waste
    draft.algae.mass = currentMass - removed;
    draft.logs.push(
      createLog(
        draft.tick,
        'scrub',
        'info',
        `Scraped algae: removed ${removed.toFixed(1)}, remaining ${draft.algae.mass.toFixed(1)}`
      )
    );
  });

  return {
    state: newState,
    message: `Removed ${removed.toFixed(1)} algae (${(percent * 100).toFixed(0)}%)`,
  };
}

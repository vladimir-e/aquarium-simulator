/**
 * Scrub Algae action — scrape the blooms that coat the tank's surfaces.
 *
 * Each scrub takes a random 10–30 % off every kind that lives on the surfaces,
 * and is refused while none of them stands at mass 5 (too little to take off
 * by hand). What comes off is loose in the water as waste: it rots there, and
 * a gravel vac takes what has settled into the bed. A bloom in the water column
 * has nothing to scrape.
 */

import { produce } from 'immer';
import type { SimulationState } from '../state.js';
import { ALGAE, bloomTissue, habitatSize, kindsIn } from '../algae/index.js';
import { createLog } from '../core/logging.js';
import { draw, type RngState } from '../core/rng.js';
import type { ActionResult, ScrubAlgaeAction } from './types.js';

/** Minimum percentage of algae mass removed per scrub */
export const MIN_SCRUB_PERCENT = 0.1; // 10%

/** Maximum percentage of algae mass removed per scrub */
export const MAX_SCRUB_PERCENT = 0.3; // 30%

/** Minimum algae mass required to scrub */
export const MIN_ALGAE_TO_SCRUB = 5;

/** Whether any kind on the surfaces stands at the minimum or more. */
export function canScrubAlgae(state: SimulationState): boolean {
  return kindsIn('surfaces').some((kind) => state.algae[kind].mass >= MIN_ALGAE_TO_SCRUB);
}

/** How much of the mass this scrub takes off, between MIN and MAX. */
function scrubBite(rng: RngState): number {
  return MIN_SCRUB_PERCENT + draw(rng) * (MAX_SCRUB_PERCENT - MIN_SCRUB_PERCENT);
}

/**
 * Scrub the surfaces: one bite, a random 10–30 % unless the action names it,
 * off every kind that coats them.
 */
export function scrubAlgae(state: SimulationState, action: ScrubAlgaeAction): ActionResult {
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

  if (!canScrubAlgae(state)) {
    return {
      state,
      message: `Algae level too low to scrub (minimum ${MIN_ALGAE_TO_SCRUB})`,
    };
  }

  // The bite is needed before the producer opens — it sizes what comes off and
  // the message — so the draw runs on a copy that goes back in. Drawing on
  // `state.rng` would advance the caller's own stream.
  const rng = { ...state.rng };
  const percent = named ?? scrubBite(rng);
  const scraped = kindsIn('surfaces').map((kind) => {
    const before = state.algae[kind].mass;
    return { kind, removed: before * percent, left: before * (1 - percent) };
  });

  const newState = produce(state, (draft) => {
    draft.rng = rng;
    for (const { kind, removed, left } of scraped) {
      const traits = ALGAE[kind];
      draft.algae[kind].mass = left;
      draft.resources.waste += bloomTissue(removed, habitatSize(traits.habitat, state), traits);
      draft.logs.push(
        createLog(
          draft.tick,
          'scrub',
          'info',
          `Scraped ${traits.name.toLowerCase()}: removed ${removed.toFixed(1)}, remaining ${left.toFixed(1)}`
        )
      );
    }
  });

  const removed = scraped.map(({ kind, removed }) => `${removed.toFixed(1)} ${ALGAE[kind].name.toLowerCase()}`);
  return {
    state: newState,
    message: `Removed ${removed.join(', ')} (${(percent * 100).toFixed(0)}%)`,
  };
}

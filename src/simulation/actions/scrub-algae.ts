/**
 * Scrub Algae action — the keeper scrubs the glass clean.
 *
 * Every bloom loses what coats the glass walls: its mass times the walls'
 * share of its habitat. What the rest of its habitat holds stays, and spreads
 * back over the glass at once. What comes off is loose in the water as waste:
 * it rots there, and a gravel vac takes what has settled into the bed.
 */

import { produce } from 'immer';
import type { SimulationState } from '../state.js';
import {
  ALGAE,
  ALGAE_KINDS,
  bloomTissue,
  clearPlace,
  coverageAt,
  habitatSize,
  namePlaces,
  placesKept,
  type AlgaeKind,
} from '../algae/index.js';
import { createLog } from '../core/logging.js';
import type { ActionResult } from './types.js';

/** Each kind's mass times the walls' share of its habitat — what a scrub takes off. */
export function onTheGlass(state: SimulationState): Record<AlgaeKind, number> {
  return coverageAt(state.algae, 'walls', state);
}

export function scrubAlgae(state: SimulationState): ActionResult {
  const glass = onTheGlass(state);
  const scraped = ALGAE_KINDS.filter((kind) => glass[kind] > 0);
  if (scraped.length === 0) return { state, message: 'Nothing on the glass to scrub' };

  const newState = produce(state, (draft) => {
    draft.algae = clearPlace(state.algae, 'walls', state);
    for (const kind of scraped) {
      const traits = ALGAE[kind];
      draft.resources.waste += bloomTissue(glass[kind], habitatSize(traits.habitat, state), traits);
      draft.logs.push(
        createLog(
          draft.tick,
          'scrub',
          'info',
          `Scrubbed the glass: removed ${glass[kind].toFixed(1)} ${traits.name.toLowerCase()}, ${draft.algae[kind].mass.toFixed(1)} left on ${namePlaces(placesKept(traits.habitat, 'walls', state))}`
        )
      );
    }
  });

  const removed = scraped.map((kind) => `${glass[kind].toFixed(1)} ${ALGAE[kind].name.toLowerCase()}`);
  return { state: newState, message: `Scrubbed the glass: removed ${removed.join(', ')}` };
}

/**
 * Scrub Algae action — the keeper scrubs the glass clean.
 *
 * Every bloom loses what coats the glass walls: its mass times the walls'
 * share of its habitat. Film on the floor and the hardscape stays, and green
 * water floats free of the glass. What comes off is loose in the water as
 * waste: it rots there, and a gravel vac takes what has settled into the bed.
 */

import { produce } from 'immer';
import type { SimulationState } from '../state.js';
import { ALGAE, ALGAE_KINDS, bloomTissue, habitatSize, mapKinds, placeShare, type AlgaeKind } from '../algae/index.js';
import { createLog } from '../core/logging.js';
import type { ActionResult } from './types.js';

/** Coverage each kind has on the glass walls — what a scrub takes off it. */
export function onTheGlass(state: SimulationState): Record<AlgaeKind, number> {
  return mapKinds((kind) => state.algae[kind].mass * placeShare(ALGAE[kind].habitat, 'walls', state));
}

export function scrubAlgae(state: SimulationState): ActionResult {
  const glass = onTheGlass(state);
  const scraped = ALGAE_KINDS.filter((kind) => glass[kind] > 0);
  if (scraped.length === 0) return { state, message: 'Nothing on the glass to scrub' };

  const newState = produce(state, (draft) => {
    for (const kind of scraped) {
      const traits = ALGAE[kind];
      draft.algae[kind].mass -= glass[kind];
      draft.resources.waste += bloomTissue(glass[kind], habitatSize(traits.habitat, state), traits);
      draft.logs.push(
        createLog(
          draft.tick,
          'scrub',
          'info',
          `Scrubbed the glass: removed ${glass[kind].toFixed(1)} ${traits.name.toLowerCase()}, ${draft.algae[kind].mass.toFixed(1)} left on the floor and the hardscape`
        )
      );
    }
  });

  const removed = scraped.map((kind) => `${glass[kind].toFixed(1)} ${ALGAE[kind].name.toLowerCase()}`);
  return { state: newState, message: `Scrubbed the glass: removed ${removed.join(', ')}` };
}

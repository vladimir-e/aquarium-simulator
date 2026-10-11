/**
 * Scrub Algae action — the keeper scrubs the glass clean.
 *
 * Every bloom loses what coats the glass walls: the walls' share of its
 * tissue. What the rest of its habitat holds stays, and spreads back over the
 * glass at once. What comes off is dead and loose in the water: its tissue and
 * reserve as waste, which rots there and which a gravel vac takes once it has
 * settled into the bed, and its stores leached straight to the water.
 */

import { produce } from 'immer';
import type { SimulationState } from '../state.js';
import type { PlantsConfig } from '../config/plants.js';
import { mapNutrients } from '../config/nutrients.js';
import {
  ALGAE,
  ALGAE_KINDS,
  bloomCoverage,
  clearPlace,
  coverageAt,
  namePlaces,
  placeShare,
  placesKept,
  type AlgaeKind,
} from '../algae/index.js';
import { bloomParams } from '../flora/params.js';
import { remains, scaleFlora } from '../systems/flora-budget.js';
import { leach } from '../systems/nutrients.js';
import { applyEffects, type Effect } from '../core/effects.js';
import { createLog } from '../core/logging.js';
import { addOrganics } from '../core/organics.js';
import { sum } from '../core/sum.js';
import type { ActionResult } from './types.js';

/** Each kind's coverage times the walls' share of its habitat — what a scrub takes off. */
export function onTheGlass(state: SimulationState): Record<AlgaeKind, number> {
  return coverageAt(state, 'walls');
}

export function scrubAlgae(state: SimulationState, config: PlantsConfig): ActionResult {
  const glass = onTheGlass(state);
  const scraped = ALGAE_KINDS.filter((kind) => glass[kind] > 0);
  if (scraped.length === 0) return { state, message: 'Nothing on the glass to scrub' };

  const scrubbed = ALGAE_KINDS.map((kind) =>
    remains(
      scaleFlora(state.algae[kind].budget, placeShare(ALGAE[kind].habitat, 'walls', state)),
      bloomParams(kind, config)
    )
  );
  const newState = produce(state, (draft) => {
    draft.algae = clearPlace(state, 'walls');
    for (const kind of scraped) {
      const traits = ALGAE[kind];
      draft.logs.push(
        createLog(
          draft.tick,
          'scrub',
          'info',
          `Scrubbed the glass: removed ${glass[kind].toFixed(1)} ${traits.name.toLowerCase()}, ${bloomCoverage(draft, kind).toFixed(1)} left on ${namePlaces(placesKept(traits.habitat, 'walls', state))}`
        )
      );
    }
  });

  const leachate = mapNutrients((n) => sum(scrubbed.map((left) => left.leachate[n])));
  const effects: Effect[] = [
    { tier: 'active', resource: 'waste', delta: addOrganics(...scrubbed.map(({ waste }) => waste)), source: 'scrub' },
    ...leach(leachate),
  ];
  const removed = scraped.map((kind) => `${glass[kind].toFixed(1)} ${ALGAE[kind].name.toLowerCase()}`);
  return { state: applyEffects(newState, effects), message: `Scrubbed the glass: removed ${removed.join(', ')}` };
}

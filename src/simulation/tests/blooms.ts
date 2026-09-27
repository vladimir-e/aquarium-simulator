import type { SimulationState } from '../state.js';
import { ALGAE, ALGAE_KINDS, bloomTissue, habitatSize, type AlgaeKind } from '../algae/index.js';

/** Grams of tissue a kind of bloom holds, over its own habitat. */
export function kindTissue(state: SimulationState, kind: AlgaeKind): number {
  const traits = ALGAE[kind];
  return bloomTissue(state.algae[kind].mass, habitatSize(traits.habitat, state), traits);
}

/** Grams of tissue every kind of bloom holds. */
export function bloomsTissue(state: SimulationState): number {
  return ALGAE_KINDS.reduce((sum, kind) => sum + kindTissue(state, kind), 0);
}

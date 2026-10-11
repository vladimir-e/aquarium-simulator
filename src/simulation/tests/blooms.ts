import type { AlgaeState, SimulationState } from '../state.js';
import { plantsDefaults } from '../config/plants.js';
import { bloomParams } from '../flora/params.js';
import { stocked } from '../systems/flora-budget.js';
import { ALGAE, ALGAE_KINDS, bloomTissue, habitatSize, type AlgaeKind, type HabitatTank } from '../algae/index.js';

/** Grams of structure a kind of bloom holds. */
export function kindTissue(state: SimulationState, kind: AlgaeKind): number {
  return state.algae[kind].budget.structure;
}

/** Grams of structure every kind of bloom holds. */
export function bloomsTissue(state: SimulationState): number {
  return ALGAE_KINDS.reduce((sum, kind) => sum + kindTissue(state, kind), 0);
}

/** A kind's bloom at this coverage of its habitat in this tank, fed and stocked, at full condition unless it says otherwise. */
export function bloomAt(tank: HabitatTank, kind: AlgaeKind, coverage: number, condition = 100): AlgaeState {
  const traits = ALGAE[kind];
  return {
    budget: stocked(bloomTissue(coverage, habitatSize(traits.habitat, tank), traits), bloomParams(kind, plantsDefaults)),
    condition,
  };
}

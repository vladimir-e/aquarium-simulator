import type { Fish, SimulationState } from '../state.js';
import { STOCKED_FISH_SIZE, stockedBody } from '../livestock/create-fish.js';
import { debParams } from '../livestock/species.js';
import { ZERO_TOXINS } from '../config/livestock.js';
import { waterToxins } from '../systems/toxicokinetics.js';

/**
 * A fish record as a test names it: a neon male from the shop at the stocking size, fasting at full health and never
 * dying of old age, unloaded, unless it says otherwise; `size` raises it to that % of grown length.
 */
export function fishRecord({ size = STOCKED_FISH_SIZE, ...fields }: Partial<Fish> & { size?: number } = {}): Fish {
  const species = fields.species ?? 'neon_tetra';
  return {
    id: 'fish_1',
    species,
    health: 100,
    gut: 0,
    sex: 'male',
    hardinessOffset: 0,
    survivalDraw: 0,
    load: ZERO_TOXINS,
    ...stockedBody(species, size),
    ...fields,
  };
}

/** The fish with a brood buffer holding `eggs` of its species' eggs, at the cost a female lays them. */
export function holdingEggs<F extends Pick<Fish, 'species' | 'budget'>>(fish: F, eggs: number): F {
  const p = debParams(fish.species);
  return { ...fish, budget: { ...fish.budget, broodBuffer: (eggs * p.E0) / p.kappaR } };
}

export function steepedInAmmonia(state: SimulationState, ppm: number): SimulationState {
  const resources = { ...state.resources, ammonia: ppm * state.resources.water };
  const load = waterToxins(resources);
  return { ...state, resources, fish: state.fish.map((fish) => ({ ...fish, load })) };
}

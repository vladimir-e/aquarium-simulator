import type { Plant } from '../state.js';
import { plantsDefaults } from '../config/plants.js';
import { mapNutrients, type NutrientVector } from '../config/nutrients.js';
import { plantParams } from '../flora/params.js';
import { stocked, storeFill } from '../systems/flora-budget.js';
import { tissueMass } from '../plants/canopy.js';

type PlantFields = Pick<Plant, 'id' | 'species'> & { size: number } & Partial<Omit<Plant, 'id' | 'species'>>;

/**
 * A plant record as a test names it: a founder of its own family, at no
 * vigour and full condition, fed and stocked at `size`, unless it says otherwise.
 */
export function plantRecord({ size, ...fields }: PlantFields): Plant {
  return {
    parentId: null,
    familyId: fields.id,
    age: 0,
    vigour: 0,
    condition: 100,
    budget: stocked(tissueMass(fields.species, size), plantParams(fields.species, plantsDefaults)),
    ...fields,
  };
}

/** The plant restocked at `size`, fed and full, every other field as it was. */
export function atSize(plant: Plant, size: number): Plant {
  return { ...plant, budget: plantRecord({ id: plant.id, species: plant.species, size }).budget };
}

/** The plant with each store at this share of full — every store, or the ones named. */
export function withStores(plant: Plant, fill: number | Partial<NutrientVector>): Plant {
  const p = plantParams(plant.species, plantsDefaults);
  const share = typeof fill === 'number' ? mapNutrients(() => fill) : { ...storeFill(plant.budget, p), ...fill };
  const stores = mapNutrients((n) => share[n] * (p.qMax[n] - p.qMin[n]) * plant.budget.structure);
  return { ...plant, budget: { ...plant.budget, stores } };
}

/**
 * Plant construction — the mirror of `livestock/create-fish.ts`, and the single
 * factory for every plant record: planted, seeded, or bought out of a parent's
 * offshoot buffer. Every record draws its own vigour; a planted one founds a
 * family, an offshoot joins its parent's.
 */

import type { Plant } from '../state.js';
import type { PlantsConfig } from '../config/plants.js';
import { draw, drawId, type RngState } from '../core/rng.js';
import { stocked, type FloraState } from '../systems/flora-budget.js';
import { plantParams } from '../flora/params.js';
import { tissueMass } from './canopy.js';
import { growthFormOf, type PlantSpecies } from './species.js';

/** Size a plant goes in at when the caller doesn't say — a young specimen. */
export const DEFAULT_PLANT_SIZE = 50;

/** The least a plant is planted, seeded or trimmed to, % of one full unit. */
export const MIN_PLANTABLE_SIZE = 1;

export function isPlantableSize(size: number): boolean {
  return size >= MIN_PLANTABLE_SIZE && size <= 100;
}

/** The structure an offshoot is born with: its growth form's offshoot size. */
export function offshootStructure(species: PlantSpecies): number {
  return tissueMass(species, growthFormOf(species).offshootSize);
}

/** Its offshoot buffer as a share of its next offshoot. */
export function offshootShare(plant: Pick<Plant, 'species' | 'budget'>): number {
  return Math.min(1, plant.budget.offshootBuffer / offshootStructure(plant.species));
}

/**
 * Spread of a unit's assimilation ceiling either side of its species': clonal
 * ramets differ in growth by 10–20 %, and a unit's growth follows its ceiling
 * about one for one.
 */
export const VIGOUR_SPAN = 0.15;

function drawVigour(rng: RngState): number {
  return (draw(rng) - 0.5) * 2 * VIGOUR_SPAN;
}

export interface CreatePlantParams {
  species: PlantSpecies;
  /** % of one full unit, as `sizeOf` reads it. */
  size?: number;
  /** Ticks it has already stood in the tank — a seeded, established plant. Defaults to 0. */
  age?: number;
  /** The tank's draw stream — the vigour and the id come off it. */
  rng: RngState;
  config: PlantsConfig;
}

/** A planted or seeded plant, fed and stocked as a shop sells it: the founder of its own family. */
export function createPlant(params: CreatePlantParams): Plant {
  const { species, size = DEFAULT_PLANT_SIZE, age = 0, rng, config } = params;
  const vigour = drawVigour(rng);
  const id = drawId(rng, 'plant');

  return {
    id,
    species,
    budget: stocked(tissueMass(species, size), plantParams(species, config)),
    condition: 100,
    parentId: null,
    familyId: id,
    age,
    vigour,
  };
}

/** What a parent's offshoot buffer bought (see `buyOffshoot`): a new unit of its species and family, at full condition. */
export function createOffshoot(parent: Plant, budget: FloraState, rng: RngState): Plant {
  const vigour = drawVigour(rng);

  return {
    id: drawId(rng, 'plant'),
    species: parent.species,
    budget,
    condition: 100,
    parentId: parent.id,
    familyId: parent.familyId,
    age: 0,
    vigour,
  };
}

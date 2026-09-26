/**
 * Plant construction — the mirror of `livestock/create-fish.ts`, and the single
 * factory for every plant record: planted, seeded, or bought by a parent's full
 * bank. Every record draws its own vigour; a planted one founds a family, an
 * offshoot joins its parent's.
 */

import type { Plant } from '../state.js';
import { draw, drawId, type RngState } from '../core/rng.js';
import type { PlantSpecies } from './species.js';

/** Size a plant goes in at when the caller doesn't say — a young specimen. */
export const DEFAULT_PLANT_SIZE = 50;

/** The least a plant is planted, seeded or trimmed to, % of one full unit. */
export const MIN_PLANTABLE_SIZE = 1;

/** Whether a unit can be planted, seeded or trimmed to this size. */
export function isPlantableSize(size: number): boolean {
  return size >= MIN_PLANTABLE_SIZE && size <= 100;
}

/** Vigour span either side of 0: clonal ramets differ in growth by 10–20 %. */
export const VIGOUR_SPAN = 0.15;

function drawVigour(rng: RngState): number {
  return (draw(rng) - 0.5) * 2 * VIGOUR_SPAN;
}

export interface CreatePlantParams {
  species: PlantSpecies;
  /** Size %, same scale as `Plant.size`. */
  size?: number;
  /** Ticks it has already stood in the tank — a seeded, established plant. Defaults to 0. */
  age?: number;
  /** The tank's draw stream — the vigour and the id come off it. */
  rng: RngState;
}

/** A planted or seeded plant: the founder of its own family. */
export function createPlant(params: CreatePlantParams): Plant {
  const { species, size = DEFAULT_PLANT_SIZE, age = 0, rng } = params;
  const vigour = drawVigour(rng);
  const id = drawId(rng, 'plant');

  return {
    id,
    species,
    size,
    condition: 100,
    surplus: 0,
    parentId: null,
    familyId: id,
    age,
    vigour,
  };
}

/**
 * What a parent's full bank bought (see `propagate`): a new unit of its species
 * and family at the size the bank paid for, full on an empty bank — only a full
 * plant holds a full bank.
 */
export function createOffshoot(parent: Plant, size: number, rng: RngState): Plant {
  const vigour = drawVigour(rng);

  return {
    id: drawId(rng, 'plant'),
    species: parent.species,
    size,
    condition: 100,
    surplus: 0,
    parentId: parent.id,
    familyId: parent.familyId,
    age: 0,
    vigour,
  };
}

/**
 * Plant construction — the single factory for every plant that enters the
 * tank, whether planted by the player (`addPlant`) or placed by a seed.
 *
 * The mirror of `livestock/create-fish.ts`. Plants carry no individual
 * variation, so the only thing a caller chooses is the size it goes in at.
 */

import type { Plant, PlantSpecies } from '../state.js';

/** Size a plant goes in at when the caller doesn't say — a young specimen. */
export const DEFAULT_PLANT_SIZE = 50;

/** Monotonic sequence guaranteeing unique ids even within one tick. */
let plantSeq = 0;

/** Generate a process-unique plant id (time prefix + counter). */
export function generatePlantId(): string {
  return `plant_${Date.now().toString(36)}_${(plantSeq++).toString(36)}`;
}

export interface CreatePlantParams {
  species: PlantSpecies;
  /** Size %, same scale as `Plant.size`. */
  size?: number;
}

/** Build a plant at full condition with an empty surplus bank. */
export function createPlant(params: CreatePlantParams): Plant {
  const { species, size = DEFAULT_PLANT_SIZE } = params;

  return {
    id: generatePlantId(),
    species,
    size,
    condition: 100,
    surplus: 0,
  };
}

/**
 * Plant construction — the mirror of `livestock/create-fish.ts`. Plants carry
 * no individual variation, so the only thing a caller chooses is the size it
 * goes in at.
 */

import type { Plant } from '../state.js';
import { sequentialId } from '../core/ids.js';
import type { PlantSpecies } from './species.js';

/** Size a plant goes in at when the caller doesn't say — a young specimen. */
export const DEFAULT_PLANT_SIZE = 50;

export function generatePlantId(): string {
  return sequentialId('plant');
}

export interface CreatePlantParams {
  species: PlantSpecies;
  /** Size %, same scale as `Plant.size`. */
  size?: number;
}

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

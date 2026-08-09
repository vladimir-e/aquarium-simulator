/**
 * Plant construction — the mirror of `livestock/create-fish.ts`. Plants carry
 * no individual variation, so the only thing a caller chooses is the size it
 * goes in at.
 */

import type { Plant } from '../state.js';
import type { PlantsConfig } from '../config/plants.js';
import { drawId, type RngState } from '../core/rng.js';
import type { PlantSpecies } from './species.js';

/** Size a plant goes in at when the caller doesn't say — a young specimen. */
export const DEFAULT_PLANT_SIZE = 50;

/**
 * Reserve a plant arrives with — half the bank it is given. A specimen comes
 * out of the shop's tank with stores, and one starting at an empty bank would
 * read as fully starving on its first tick and melt on the way into a perfect
 * tank.
 */
export const establishmentSurplus = (plantsConfig: PlantsConfig): number =>
  plantsConfig.surplusCap / 2;

export interface CreatePlantParams {
  species: PlantSpecies;
  /** Size %, same scale as `Plant.size`. */
  size?: number;
  plantsConfig: PlantsConfig;
  /** The tank's draw stream — a plant carries no variation, only a name. */
  rng: RngState;
}

export function createPlant(params: CreatePlantParams): Plant {
  const { species, size = DEFAULT_PLANT_SIZE, plantsConfig, rng } = params;

  return {
    id: drawId(rng, 'plant'),
    species,
    size,
    condition: 100,
    surplus: establishmentSurplus(plantsConfig),
  };
}

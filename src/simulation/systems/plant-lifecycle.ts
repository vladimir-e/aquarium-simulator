/**
 * Plant lifecycle — what low condition costs a plant, on the flora law's loss:
 * it sheds a share of itself every hour that grows with the square of its
 * condition deficit, and condition 0 kills it, as it does a fish. Shed and dead
 * tissue leave as waste, so a melting planting fouls the water.
 */

import type { Plant } from '../state.js';
import type { PlantsConfig } from '../config/plants.js';
import { plantsDefaults } from '../config/plants.js';
import { fullRateUnits } from '../plants/canopy.js';
import type { PlantSpecies } from '../plants/species.js';
import { loseFlora, type FloraLoss } from './flora.js';

export function losePlant(plant: Plant, config: PlantsConfig = plantsDefaults): FloraLoss<Plant> {
  return loseFlora(plant, 'size', (size) => tissueMass(plant.species, size, config), config);
}

/** Grams of organic matter in this much size of a species, by its leaf. */
export function tissueMass(
  species: PlantSpecies,
  size: number,
  config: PlantsConfig = plantsDefaults
): number {
  return size * fullRateUnits(species) * config.tissuePerSize;
}

import type { Plant } from '../state.js';
import type { PlantsConfig } from '../config/plants.js';
import { plantsDefaults } from '../config/plants.js';
import { rateUnits } from '../plants/canopy.js';
import type { PlantSpecies } from '../plants/species.js';
import { loseFlora, tissuePerRateUnit, type FloraLoss } from './flora.js';

export function losePlant(plant: Plant, config: PlantsConfig = plantsDefaults): FloraLoss<Plant> {
  return loseFlora(plant, 'size', (size) => tissueMass(plant.species, size, config), config);
}

/** Grams of organic matter in this much size of a species, by its leaf. */
export function tissueMass(
  species: PlantSpecies,
  size: number,
  config: PlantsConfig = plantsDefaults
): number {
  return rateUnits({ species, size }) * tissuePerRateUnit(config);
}

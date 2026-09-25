/**
 * Plant nutrition — how much of each nutrient a species needs, and how much of
 * that need the water column meets.
 *
 * Every nutrient saturates on its own Monod curve, at a half-saturation scaled
 * by the species' demand for it; sufficiency is the scarcest of them (Liebig).
 * A species that needs none of a nutrient is never limited by it.
 */

import type { Resources } from '../state.js';
import type { PlantSpecies } from '../plants/species.js';
import { PLANT_SPECIES_DATA } from '../plants/species.js';
import {
  NUTRIENTS,
  nutrientsDefaults,
  type Nutrient,
  type NutrientsConfig,
  type NutrientVector,
} from '../config/nutrients.js';
import { monodFactor } from '../core/kinetics.js';
import { getPpm } from '../resources/index.js';

/** Share of a full-demand plant's need this species has, per nutrient. */
export function speciesDemand(
  species: PlantSpecies,
  config: NutrientsConfig = nutrientsDefaults
): NutrientVector {
  return config.demand[PLANT_SPECIES_DATA[species].nutrientDemand];
}

/** ppm at which this species runs at half on the nutrient. */
export function speciesHalfSaturation(
  species: PlantSpecies,
  nutrient: Nutrient,
  config: NutrientsConfig = nutrientsDefaults
): number {
  return speciesDemand(species, config)[nutrient] * config.halfSaturation[nutrient];
}

/** Share of the species' need for one nutrient that this ppm meets, 0–1. */
export function nutrientShare(
  ppm: number,
  species: PlantSpecies,
  nutrient: Nutrient,
  config: NutrientsConfig = nutrientsDefaults
): number {
  if (speciesDemand(species, config)[nutrient] <= 0) return 1;
  return monodFactor(ppm, speciesHalfSaturation(species, nutrient, config));
}

/** Liebig sufficiency: the scarcest nutrient's share, 0–1. */
export function calculateNutrientSufficiency(
  resources: Resources,
  waterVolume: number,
  species: PlantSpecies,
  config: NutrientsConfig = nutrientsDefaults
): number {
  if (waterVolume <= 0) return 0;
  return Math.min(
    ...NUTRIENTS.map((nutrient) =>
      nutrientShare(getPpm(resources[nutrient], waterVolume), species, nutrient, config)
    )
  );
}

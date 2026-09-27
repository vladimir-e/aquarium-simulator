/**
 * Plant lifecycle — shedding, death, and death-waste production.
 *
 * - Shedding is what low condition does to a plant — and to a bloom: it
 *   drops a share of itself every hour that grows with the square of its
 *   condition deficit, and the tissue leaves as waste — melting plants foul
 *   the water.
 * - Death comes at condition 0, as it does for a fish.
 */

import type { Plant } from '../state.js';
import type { PlantsConfig } from '../config/plants.js';
import { plantsDefaults } from '../config/plants.js';
import { fullRateUnits } from '../plants/canopy.js';
import type { PlantSpecies } from '../plants/species.js';

/** Share of itself an organism of this condition sheds in an hour: the square of its deficit, at `maxSheddingRate`. */
export function shedShare(condition: number, config: PlantsConfig = plantsDefaults): number {
  const deficit = Math.max(0, Math.min(1, 1 - condition / 100));
  return config.maxSheddingRate * deficit * deficit;
}

/** Tissue a plant drops this tick, and the waste it makes doing it. */
export function calculateShedding(
  plant: Plant,
  config: PlantsConfig = plantsDefaults
): { sizeReduction: number; wasteProduced: number } {
  const sizeReduction = shedShare(plant.condition, config) * plant.size;

  return {
    sizeReduction,
    wasteProduced: tissueMass(plant.species, sizeReduction, config),
  };
}

/** Grams of waste a dying plant leaves: all of what is left of it. */
export function calculateDeathWaste(
  plant: Plant,
  config: PlantsConfig = plantsDefaults
): number {
  return tissueMass(plant.species, plant.size, config);
}

/** Grams of organic matter in a rate unit of tissue — the relation a bloom's tissue is rated by too. */
export function tissuePerRateUnit(config: PlantsConfig = plantsDefaults): number {
  return 100 * config.tissuePerSize;
}

/** Grams of organic matter in this much size of a species, by its leaf. */
export function tissueMass(
  species: PlantSpecies,
  size: number,
  config: PlantsConfig = plantsDefaults
): number {
  return size * fullRateUnits(species) * config.tissuePerSize;
}

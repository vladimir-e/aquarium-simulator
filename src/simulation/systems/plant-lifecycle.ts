/**
 * Plant lifecycle — what low condition costs a plant, and a bloom. Each sheds a
 * share of itself every hour that grows with the square of its condition
 * deficit, and condition 0 kills it, as it does a fish; shed and dead tissue
 * leave as waste, so a melting planting fouls the water.
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

/** The plant after the hour's losses — none where condition 0 killed it — and the grams of waste each loss left. */
export interface PlantLoss {
  plant: Plant | null;
  shed: number;
  died: number;
}

/** Low condition sheds a plant, and condition 0 kills what is left. */
export function losePlant(plant: Plant, config: PlantsConfig = plantsDefaults): PlantLoss {
  const lost = shedShare(plant.condition, config) * plant.size;
  const kept = { ...plant, size: plant.size - lost };
  const shed = tissueMass(plant.species, lost, config);
  if (plant.condition > 0) return { plant: kept, shed, died: 0 };
  return { plant: null, shed, died: tissueMass(plant.species, kept.size, config) };
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

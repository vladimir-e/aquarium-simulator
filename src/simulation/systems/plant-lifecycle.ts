/**
 * Plant lifecycle — shedding, death, and death-waste production.
 *
 * - Shedding is what low condition does to a plant: it drops a share of
 *   itself every hour that grows with the square of its condition deficit,
 *   and the tissue leaves as waste — melting plants foul the water.
 * - Death comes at condition 0, as it does for a fish.
 */

import type { Plant } from '../state.js';
import type { PlantsConfig } from '../config/plants.js';
import { plantsDefaults } from '../config/plants.js';
import { fullRateUnits } from '../plants/canopy.js';

/** Tissue a plant drops this tick, and the waste it makes doing it. */
export function calculateShedding(
  plant: Plant,
  config: PlantsConfig = plantsDefaults
): { sizeReduction: number; wasteProduced: number } {
  const deficit = Math.max(0, Math.min(1, 1 - plant.condition / 100));
  const sizeReduction = config.maxSheddingRate * deficit * deficit * plant.size;

  return {
    sizeReduction,
    wasteProduced: tissueWaste(plant, sizeReduction, config),
  };
}

/** Grams of waste a dying plant leaves: all of what is left of it. */
export function calculateDeathWaste(
  plant: Plant,
  config: PlantsConfig = plantsDefaults
): number {
  return tissueWaste(plant, plant.size, config);
}

function tissueWaste(plant: Plant, size: number, config: PlantsConfig): number {
  return size * fullRateUnits(plant.species) * config.wastePerSize;
}

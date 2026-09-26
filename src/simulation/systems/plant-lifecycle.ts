/**
 * Plant lifecycle — shedding, death, and death-waste production.
 *
 * - Shedding is what low condition does to a plant: it drops a share of
 *   itself every hour that grows with the square of its condition deficit,
 *   and the tissue leaves as waste — melting plants foul the water.
 * - Death comes at condition 0, as it does for a fish, or once shedding has
 *   left less than `deathSizeThreshold` of the plant.
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
    wasteProduced: sizeReduction * fullRateUnits(plant.species) * config.wastePerShedSize,
  };
}

export function shouldPlantDie(plant: Plant, config: PlantsConfig = plantsDefaults): boolean {
  return plant.condition <= 0 || plant.size < config.deathSizeThreshold;
}

/** A size a keeper can plant or trim to: no bigger than a full unit, and none the next tick retires. */
export function isPlantableSize(size: number, config: PlantsConfig): boolean {
  return size > 0 && size >= config.deathSizeThreshold && size <= 100;
}

/** Grams of waste a dying plant leaves: all of what is left of it. */
export function calculateDeathWaste(
  plant: Plant,
  config: PlantsConfig = plantsDefaults
): number {
  return plant.size * fullRateUnits(plant.species) * config.wastePerPlantDeath;
}

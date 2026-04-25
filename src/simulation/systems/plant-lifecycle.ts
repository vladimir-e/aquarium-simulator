/**
 * Plant lifecycle — shedding, death, and death-waste production.
 *
 * Downstream of the vitality engine: condition is set by
 * {@link computePlantVitality}, and this module decides what happens
 * once condition crosses the configured shedding / death thresholds.
 *
 * - Shedding is a "negative growth" path that fires only when condition
 *   is low: a stressed plant loses size proportional to how far below
 *   the shedding threshold it has fallen, releasing waste in the
 *   process.
 * - Death is a hard cutoff: condition or size below their respective
 *   thresholds removes the plant from the tank. The remaining biomass
 *   is converted to waste.
 *
 * All knobs live on `PlantsConfig` alongside the rest of the plant-
 * lifecycle calibration (vitality severities, growth, biomass cap).
 */

import type { Plant } from '../state.js';
import type { PlantsConfig } from '../config/plants.js';
import { plantsDefaults } from '../config/plants.js';

/**
 * Calculate shedding for a plant with low condition.
 *
 * @param plant - Current plant state
 * @param config - Plants configuration
 * @returns Object with size reduction and waste produced
 */
export function calculateShedding(
  plant: Plant,
  config: PlantsConfig = plantsDefaults
): { sizeReduction: number; wasteProduced: number } {
  if (plant.condition >= config.sheddingConditionThreshold) {
    return { sizeReduction: 0, wasteProduced: 0 };
  }

  // Shedding rate scales with how low the condition is.
  // At condition 0: rate = maxSheddingRate.
  // At sheddingConditionThreshold: rate = 0.
  const sheddingIntensity =
    (config.sheddingConditionThreshold - plant.condition) / config.sheddingConditionThreshold;
  const sheddingRate = sheddingIntensity * config.maxSheddingRate;

  const sizeReduction = plant.size * sheddingRate;
  const wasteProduced = sizeReduction * config.wastePerShedSize;

  return { sizeReduction, wasteProduced };
}

/**
 * Check if a plant should die based on condition and size.
 *
 * @param plant - Current plant state
 * @param config - Plants configuration
 * @returns Whether the plant dies
 */
export function shouldPlantDie(
  plant: Plant,
  config: PlantsConfig = plantsDefaults
): boolean {
  return (
    plant.condition < config.deathConditionThreshold ||
    plant.size < config.deathSizeThreshold
  );
}

/**
 * Calculate waste produced when a plant dies.
 *
 * @param plant - Dying plant
 * @param config - Plants configuration
 * @returns Waste produced in grams
 */
export function calculateDeathWaste(
  plant: Plant,
  config: PlantsConfig = plantsDefaults
): number {
  return plant.size * config.wastePerPlantDeath;
}

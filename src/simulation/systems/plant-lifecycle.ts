/**
 * Plant lifecycle — shedding, death, and death-waste production.
 *
 * Downstream of the vitality engine: {@link computePlantVitality} settles
 * both ledgers, and this module spends what the energy one could not pay.
 *
 * - Shedding is the outlet for an unpayable upkeep bill. A plant that
 *   earns and banks nothing drops a share of itself every hour, and the
 *   tissue leaves as waste rather than as fuel — melting plants foul the
 *   water, which is why `wastePerShedSize` exists at all. Between full
 *   payment and none the rate is the share of the bill left standing:
 *   a rate reading a rate, with no threshold anywhere in it.
 * - Death is a hard cutoff: condition or size below their respective
 *   thresholds removes the plant from the tank. Shedding down past
 *   `deathSizeThreshold` is the honest end of a starved plant — nothing
 *   left of it — while condition carries the plants that were damaged
 *   rather than starved.
 *
 * All knobs live on `PlantsConfig` alongside the rest of the plant-
 * lifecycle calibration (vitality severities, growth, biomass cap).
 */

import type { Plant } from '../state.js';
import type { PlantsConfig } from '../config/plants.js';
import { plantsDefaults } from '../config/plants.js';

/**
 * Tissue a plant drops this tick, and the waste it makes doing it.
 *
 * @param plant - Current plant state
 * @param starved - Share of its upkeep (0–1) neither income nor the bank
 *   covered, off `VitalityBreakdown.starved`
 * @param config - Plants configuration
 */
export function calculateShedding(
  plant: Plant,
  starved: number,
  config: PlantsConfig = plantsDefaults
): { sizeReduction: number; wasteProduced: number } {
  const sizeReduction = plant.size * starved * config.maxSheddingRate;

  return { sizeReduction, wasteProduced: sizeReduction * config.wastePerShedSize };
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

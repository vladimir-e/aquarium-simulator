/**
 * Plant respiration calculations.
 *
 * Respiration occurs 24/7 (day and night):
 * - Consumes oxygen
 * - Produces CO2
 * - Rate scales with temperature (Q10 = 2)
 *
 * During day: photosynthesis > respiration = net O2 production
 * During night: respiration only = net O2 consumption
 *
 * Stoichiometry (reverse of photosynthesis):
 * C6H12O6 + 6O2 → 6CO2 + 6H2O + energy
 */

import type { PlantsConfig } from '../config/plants.js';
import { plantsDefaults } from '../config/plants.js';

export interface RespirationResult {
  /** Oxygen consumed (mg/L, negative) */
  oxygenDelta: number;
  /** CO2 produced (mg/L) */
  co2Delta: number;
}

/**
 * Calculate temperature factor for respiration using Q10 coefficient.
 * Rate doubles every 10C above reference, halves every 10C below.
 */
export function getRespirationTemperatureFactor(
  temperature: number,
  config: PlantsConfig = plantsDefaults
): number {
  const tempDiff = temperature - config.respirationReferenceTemp;
  return Math.pow(config.respirationQ10, tempDiff / 10.0);
}

/**
 * Calculate plant respiration rate and resource changes.
 *
 * @param totalPlantSize - Sum of all plant sizes (%)
 * @param temperature - Current water temperature (C)
 * @param config - Plants configuration
 * @returns Respiration result with O2 and CO2 deltas
 */
export function calculateRespiration(
  totalPlantSize: number,
  temperature: number,
  config: PlantsConfig = plantsDefaults
): RespirationResult {
  // No respiration without plants
  if (totalPlantSize <= 0) {
    return {
      oxygenDelta: 0,
      co2Delta: 0,
    };
  }

  // Calculate respiration rate
  // Rate scales with total plant size (100% = 1.0) and temperature
  const plantSizeFactor = totalPlantSize / 100;
  const tempFactor = getRespirationTemperatureFactor(temperature, config);
  const respirationRate = config.baseRespirationRate * plantSizeFactor * tempFactor;

  // Calculate resource changes (respiration consumes O2, produces CO2)
  const oxygenDelta = -respirationRate * config.o2PerRespiration;
  const co2Delta = respirationRate * config.co2PerRespiration;

  return {
    oxygenDelta,
    co2Delta,
  };
}

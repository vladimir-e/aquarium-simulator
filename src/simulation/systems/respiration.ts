/**
 * Plant respiration calculations.
 *
 * Respiration occurs 24/7 (day and night):
 * - Consumes oxygen
 * - Produces CO2
 * - Both are masses in mg; the caller converts through the water volume
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
import { q10Factor } from '../core/kinetics.js';
import { CO2_TO_O2_MASS_RATIO } from '../core/chemistry.js';

export interface RespirationResult {
  /** Oxygen consumed (mg, absolute — caller divides by water volume for mg/L delta) */
  oxygenConsumedMg: number;
  /** CO2 produced (mg, absolute — caller divides by water volume for mg/L delta) */
  co2ProducedMg: number;
}

/**
 * Calculate temperature factor for respiration using Q10 coefficient.
 * Rate doubles every 10C above reference, halves every 10C below.
 */
export function getRespirationTemperatureFactor(
  temperature: number,
  config: PlantsConfig = plantsDefaults
): number {
  return q10Factor(temperature, config.respirationQ10, config.respirationReferenceTemp);
}

/**
 * Calculate plant respiration rate and the gas masses it moves.
 *
 * Burning sugar back to CO2 is photosynthesis run backwards, so the oxygen
 * consumed comes off the carbon released at the same molar ratio.
 *
 * @param totalPlantSize - Sum of all plant sizes (%)
 * @param temperature - Current water temperature (C)
 * @param config - Plants configuration
 */
export function calculateRespiration(
  totalPlantSize: number,
  temperature: number,
  config: PlantsConfig = plantsDefaults
): RespirationResult {
  if (totalPlantSize <= 0) {
    return {
      oxygenConsumedMg: 0,
      co2ProducedMg: 0,
    };
  }

  const plantSizeFactor = totalPlantSize / 100;
  const tempFactor = getRespirationTemperatureFactor(temperature, config);
  const respirationRate = config.baseRespirationRate * plantSizeFactor * tempFactor;

  const co2ProducedMg = respirationRate * config.co2PerRateUnit;

  return {
    oxygenConsumedMg: co2ProducedMg * CO2_TO_O2_MASS_RATIO,
    co2ProducedMg,
  };
}

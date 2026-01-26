/**
 * Photosynthesis calculations for plants.
 *
 * Photosynthesis occurs when lights are on:
 * - Consumes CO2, light (implicit), and nitrate
 * - Produces oxygen and biomass
 * - Rate limited by Liebig's Law (minimum limiting factor)
 *
 * Stoichiometry based on:
 * 6CO2 + 6H2O + light → C6H12O6 + 6O2
 */

import type { PlantsConfig } from '../config/plants.js';
import { plantsDefaults } from '../config/plants.js';

export interface PhotosynthesisResult {
  /** Oxygen produced (mg/L) */
  oxygenDelta: number;
  /** CO2 consumed (mg/L, negative) */
  co2Delta: number;
  /** Nitrate consumed (mg, negative) */
  nitrateDelta: number;
  /** Biomass produced for plant growth distribution */
  biomassProduced: number;
  /** The limiting factor that constrained photosynthesis (0-1) */
  limitingFactor: number;
}

/**
 * Calculate CO2 limiting factor for photosynthesis.
 * Returns 0-1 where 1 = optimal conditions.
 */
export function calculateCo2Factor(
  co2: number,
  config: PlantsConfig = plantsDefaults
): number {
  if (co2 <= 0) return 0;
  return Math.min(1, co2 / config.optimalCo2);
}

/**
 * Calculate nitrate limiting factor for photosynthesis.
 * Converts nitrate mass to ppm for comparison with optimal.
 */
export function calculateNitrateFactor(
  nitrateMass: number,
  waterVolume: number,
  config: PlantsConfig = plantsDefaults
): number {
  if (nitrateMass <= 0 || waterVolume <= 0) return 0;
  const nitratePpm = nitrateMass / waterVolume;
  return Math.min(1, nitratePpm / config.optimalNitrate);
}

/**
 * Calculate photosynthesis rate and resource changes.
 *
 * @param totalPlantSize - Sum of all plant sizes (%)
 * @param light - Current light output (watts, 0 when off)
 * @param co2 - Current CO2 concentration (mg/L)
 * @param nitrateMass - Current nitrate mass (mg)
 * @param waterVolume - Tank water volume (L)
 * @param config - Plants configuration
 * @returns Photosynthesis result with resource deltas and biomass
 */
export function calculatePhotosynthesis(
  totalPlantSize: number,
  light: number,
  co2: number,
  nitrateMass: number,
  waterVolume: number,
  config: PlantsConfig = plantsDefaults
): PhotosynthesisResult {
  // No photosynthesis without light or plants
  if (light <= 0 || totalPlantSize <= 0 || waterVolume <= 0) {
    return {
      oxygenDelta: 0,
      co2Delta: 0,
      nitrateDelta: 0,
      biomassProduced: 0,
      limitingFactor: 0,
    };
  }

  // Calculate limiting factors (Liebig's Law)
  const co2Factor = calculateCo2Factor(co2, config);
  const nitrateFactor = calculateNitrateFactor(nitrateMass, waterVolume, config);
  const limitingFactor = Math.min(co2Factor, nitrateFactor);

  // Calculate actual photosynthesis rate
  // Rate scales with total plant size (100% = 1.0)
  const plantSizeFactor = totalPlantSize / 100;
  const baseRate = config.basePhotosynthesisRate * plantSizeFactor;
  const actualRate = baseRate * limitingFactor;

  // Calculate resource changes
  const oxygenDelta = actualRate * config.o2PerPhotosynthesis;
  const co2Delta = -actualRate * config.co2PerPhotosynthesis;

  // Nitrate is consumed as mass (mg), scale by water volume
  const nitrateDelta = -actualRate * config.nitratePerPhotosynthesis * waterVolume;

  // Biomass produced for growth distribution
  const biomassProduced = actualRate * config.biomassPerPhotosynthesis;

  return {
    oxygenDelta,
    co2Delta,
    nitrateDelta,
    biomassProduced,
    limitingFactor,
  };
}

/**
 * Get total plant size from an array of plants.
 */
export function getTotalPlantSize(
  plants: readonly { size: number }[]
): number {
  return plants.reduce((sum, plant) => sum + plant.size, 0);
}

/**
 * Algae growth system - grows algae based on light intensity per liter.
 * Runs in PASSIVE tier.
 *
 * Growth Formula (Michaelis-Menten saturation curve):
 *   growth_per_hour = MAX_GROWTH_RATE * wpl / (HALF_SATURATION + wpl)
 *   where wpl = watts / liters
 *
 * This provides:
 * - Linear-ish growth at normal light levels (0.1-1 W/L)
 * - Diminishing returns at high light levels (>1 W/L)
 * - Asymptotic maximum preventing instant blooms at extreme values
 *
 * Key metric is watts per liter (W/L):
 * - Standard lighting (1 W/gal ≈ 0.26 W/L): ~16/day growth
 * - High light (2 W/gal ≈ 0.52 W/L): ~27/day growth
 * - Extreme light (10 W/gal ≈ 2.6 W/L): ~64/day growth (capped by saturation)
 * - Very extreme (200W in 5gal): ~85/day max (with 10hr lights = ~36/day)
 */

import type { Effect } from '../core/effects.js';
import type { SimulationState, Resources } from '../state.js';
import type { System } from './types.js';
import type { TunableConfig } from '../config/index.js';
import { type AlgaeConfig, algaeDefaults } from '../config/algae.js';
import { plantsDefaults } from '../config/plants.js';
import { nutrientsDefaults, type NutrientsConfig } from '../config/nutrients.js';
import { getTotalPlantSize } from './photosynthesis.js';
import { getPpm } from '../resources/index.js';

/**
 * Calculate algae growth for one tick (hour) based on light intensity.
 * Uses Michaelis-Menten saturation curve for realistic diminishing returns.
 *
 * @param lightWatts - Current light output in watts (0 when lights off)
 * @param tankCapacity - Tank volume in liters
 * @returns Growth amount per hour
 */
export function calculateAlgaeGrowth(
  lightWatts: number,
  tankCapacity: number,
  config: AlgaeConfig = algaeDefaults
): number {
  // No growth if light is off or tank is empty (edge case)
  if (lightWatts <= 0 || tankCapacity <= 0) {
    return 0;
  }

  const wattsPerLiter = lightWatts / tankCapacity;

  // Michaelis-Menten saturation curve: growth approaches maxGrowthRate asymptotically
  // At low W/L: approximately linear (growth ≈ maxGrowthRate * wpl / halfSaturation)
  // At high W/L: approaches maxGrowthRate (diminishing returns)
  return (config.maxGrowthRate * wattsPerLiter) / (config.halfSaturation + wattsPerLiter);
}

/**
 * Calculate watts per gallon from watts and liters.
 * Useful for UI display and calibration reference.
 *
 * @param lightWatts - Light output in watts
 * @param tankCapacity - Tank volume in liters
 * @returns Watts per gallon
 */
export function getWattsPerGallon(
  lightWatts: number,
  tankCapacity: number
): number {
  const gallons = tankCapacity / 3.785;
  return lightWatts / gallons;
}

/**
 * Calculate plant competition factor for algae growth.
 * Plants compete with algae for resources (light, CO2, nitrate).
 * Calibrated so 200% total plant size halves algae growth.
 *
 * @param totalPlantSize - Sum of all plant sizes (%)
 * @param competitionScale - Scale factor (default from plants config)
 * @returns Competition factor (0-1, lower = more competition)
 */
export function calculatePlantCompetitionFactor(
  totalPlantSize: number,
  competitionScale: number = plantsDefaults.competitionScale
): number {
  if (totalPlantSize <= 0) return 1;
  return 1 / (1 + totalPlantSize / competitionScale);
}

/**
 * Calculate nutrient boost factor for algae growth.
 * Excess nutrients (above optimal) boost algae growth.
 * Uses nitrate and phosphate (K and Fe less relevant for algae).
 *
 * Calibration:
 * - At optimal levels: factor = 1.0 (no boost)
 * - At 2x optimal: factor ≈ 1.5 (50% boost)
 * - At 3x optimal: factor ≈ 2.0 (100% boost)
 *
 * @param resources - Current resource state
 * @param waterVolume - Current water volume in liters
 * @param nutrientsConfig - Nutrients configuration
 * @returns Nutrient boost factor (≥ 1.0)
 */
export function calculateNutrientBoostFactor(
  resources: Resources,
  waterVolume: number,
  nutrientsConfig: NutrientsConfig = nutrientsDefaults
): number {
  if (waterVolume <= 0) return 1;

  const nitratePpm = getPpm(resources.nitrate, waterVolume);
  const phosphatePpm = getPpm(resources.phosphate, waterVolume);

  const optimalNitrate = nutrientsConfig.optimalNitratePpm;
  const optimalPhosphate = nutrientsConfig.optimalPhosphatePpm;

  // Calculate how much above optimal each nutrient is (min 1.0)
  const nitrateRatio = optimalNitrate > 0 ? Math.max(1, nitratePpm / optimalNitrate) : 1;
  const phosphateRatio = optimalPhosphate > 0 ? Math.max(1, phosphatePpm / optimalPhosphate) : 1;

  // Take the minimum of the two - limiting factor for algae
  // This means both nutrients need to be elevated for significant boost
  const nutrientFactor = Math.min(nitrateRatio, phosphateRatio);

  // Apply diminishing returns to prevent extreme boosts
  // sqrt scales: 2x nutrients = 1.41x boost, 4x nutrients = 2x boost
  return Math.sqrt(nutrientFactor);
}

export const algaeSystem: System = {
  id: 'algae',
  tier: 'passive',

  update(state: SimulationState, config: TunableConfig): Effect[] {
    const effects: Effect[] = [];

    // Get light from resources (already accounts for schedule)
    const lightWatts = state.resources.light;

    // Calculate base growth based on light intensity per liter
    let growth = calculateAlgaeGrowth(lightWatts, state.tank.capacity, config.algae);

    // Apply plant competition factor (plants reduce algae growth)
    if (growth > 0 && state.plants.length > 0) {
      const totalPlantSize = getTotalPlantSize(state.plants);
      const competitionScale = config.plants?.competitionScale ?? plantsDefaults.competitionScale;
      const competitionFactor = calculatePlantCompetitionFactor(totalPlantSize, competitionScale);
      growth *= competitionFactor;
    }

    // Apply nutrient boost factor (excess nutrients boost algae growth)
    if (growth > 0) {
      const nutrientsConfig = config.nutrients ?? nutrientsDefaults;
      const nutrientBoost = calculateNutrientBoostFactor(
        state.resources,
        state.resources.water,
        nutrientsConfig
      );
      growth *= nutrientBoost;
    }

    if (growth > 0) {
      effects.push({
        tier: 'passive',
        resource: 'algae',
        delta: growth,
        source: 'algae',
      });
    }

    return effects;
  },
};

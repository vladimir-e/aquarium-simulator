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
import type { SimulationState } from '../state.js';
import type { System } from './types.js';
import type { TunableConfig } from '../config/index.js';
import { type AlgaeConfig, algaeDefaults } from '../config/algae.js';

/** Maximum growth rate per hour (asymptotic limit) */
export const MAX_GROWTH_RATE = algaeDefaults.maxGrowthRate;

/** Half-saturation constant (W/L at which growth is 50% of max) */
export const HALF_SATURATION = algaeDefaults.halfSaturation;

/** Maximum algae level (relative scale) */
export const ALGAE_CAP = algaeDefaults.algaeCap;

/**
 * @deprecated Use MAX_GROWTH_RATE and HALF_SATURATION instead.
 * Kept for backward compatibility with tests expecting linear formula.
 */
export const BASE_GROWTH_RATE = 2.5;

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

export const algaeSystem: System = {
  id: 'algae',
  tier: 'passive',

  update(state: SimulationState, config: TunableConfig): Effect[] {
    const effects: Effect[] = [];

    // Get light from resources (already accounts for schedule)
    const lightWatts = state.resources.light;

    // Calculate growth based on light intensity per liter
    const growth = calculateAlgaeGrowth(lightWatts, state.tank.capacity, config.algae);

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

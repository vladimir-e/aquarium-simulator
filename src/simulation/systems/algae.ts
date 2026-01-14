/**
 * Algae growth system - grows algae based on light intensity per liter.
 * Runs in PASSIVE tier.
 *
 * Growth Formula: growth_per_hour = BASE_GROWTH_RATE * (light_watts / tank_liters)
 *
 * Key metric is watts per liter (W/L):
 * - Same W/L ratio produces same growth rate regardless of tank size
 * - Standard lighting (1 W/gal ≈ 0.26 W/L): ~16/day growth
 * - High light (2+ W/gal): Rapid blooms, requires active scrubbing
 * - Low light (<0.5 W/gal): Slow growth, manageable algae
 */

import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import type { System } from './types.js';

/** Base growth rate per liter (calibrated for ~16/day at 1 W/gal) */
export const BASE_GROWTH_RATE = 2.5;

/** Maximum algae level (relative scale) */
export const ALGAE_CAP = 100;

/**
 * Calculate algae growth for one tick (hour) based on light intensity.
 * Returns growth amount per hour.
 *
 * @param lightWatts - Current light output in watts (0 when lights off)
 * @param tankCapacity - Tank volume in liters
 * @returns Growth amount per hour
 */
export function calculateAlgaeGrowth(
  lightWatts: number,
  tankCapacity: number
): number {
  // No growth if light is off or tank is empty (edge case)
  if (lightWatts <= 0 || tankCapacity <= 0) {
    return 0;
  }

  const wattsPerLiter = lightWatts / tankCapacity;
  return BASE_GROWTH_RATE * wattsPerLiter;
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

  update(state: SimulationState): Effect[] {
    const effects: Effect[] = [];

    // Get light from passive resources (already accounts for schedule)
    const lightWatts = state.passiveResources.light;

    // Calculate growth based on light intensity per liter
    const growth = calculateAlgaeGrowth(lightWatts, state.tank.capacity);

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

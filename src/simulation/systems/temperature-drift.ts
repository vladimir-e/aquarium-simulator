/**
 * Temperature drift system - Newton's Law of Cooling.
 *
 * Heat loss is proportional to temperature differential.
 * Smaller tanks change temperature faster due to higher surface-area-to-volume ratio.
 */

import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import type { System } from './types.js';

/**
 * Cooling coefficient: °C/hr per °C differential at reference volume.
 *
 * Calibration basis: A 100L uncovered glass tank loses ~0.8°C over 6 hours
 * when 6°C above room temp, giving 0.8/(6*6) ≈ 0.022/hr per °C.
 * Adjusted to 0.132 for simulation balance with heater equilibrium at 1.3 W/L.
 */
export const COOLING_COEFFICIENT = 0.132;

/**
 * Reference volume in liters for scaling calculations.
 * At this volume, volumeScale = 1.0 (no adjustment).
 */
export const REFERENCE_VOLUME = 100;

/**
 * Volume scaling exponent derived from surface-area-to-volume ratio.
 *
 * Physics: Heat transfer scales with surface area (A ∝ V^(2/3)),
 * while heat capacity scales with volume (V). Net effect: smaller tanks
 * change temperature faster by factor (V_ref/V)^(1/3).
 */
export const VOLUME_EXPONENT = 1 / 3;

/**
 * Calculates the temperature drift toward room temperature for one tick (1 hour).
 */
export function calculateTemperatureDrift(
  waterTemp: number,
  roomTemp: number,
  waterVolume: number
): number {
  const deltaT = waterTemp - roomTemp;

  if (deltaT === 0) {
    return 0;
  }

  const volumeScale = Math.pow(REFERENCE_VOLUME / waterVolume, VOLUME_EXPONENT);
  const coolingRate = COOLING_COEFFICIENT * Math.abs(deltaT) * volumeScale;

  // Drift toward room temp, but don't overshoot
  const drift = -Math.sign(deltaT) * Math.min(Math.abs(deltaT), coolingRate);

  return drift;
}

export const temperatureDriftSystem: System = {
  id: 'temperature-drift',
  tier: 'immediate',

  update(state: SimulationState): Effect[] {
    const waterTemp = state.resources.temperature;
    const roomTemp = state.environment.roomTemperature;
    const waterVolume = state.resources.water;

    const drift = calculateTemperatureDrift(waterTemp, roomTemp, waterVolume);

    if (drift === 0) {
      return [];
    }

    return [
      {
        tier: 'immediate',
        resource: 'temperature',
        delta: drift,
        source: 'temperature-drift',
      },
    ];
  },
};

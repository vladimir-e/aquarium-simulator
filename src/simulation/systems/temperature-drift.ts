/**
 * Temperature drift system - Newton's Law of Cooling.
 *
 * Heat loss is proportional to temperature differential.
 * Smaller tanks change temperature faster due to higher surface-area-to-volume ratio.
 */

import type { Effect } from '../effects.js';
import type { SimulationState } from '../state.js';
import type { System } from './types.js';

/** °C/hr per °C differential at reference volume */
export const COOLING_COEFFICIENT = 0.132;

/** Reference volume in liters (baseline for volumeScale = 1.0) */
export const REFERENCE_VOLUME = 100;

/** Surface-area-to-volume scaling exponent (A proportional to V^(2/3)) */
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
  tier: 'passive',

  update(state: SimulationState): Effect[] {
    const waterTemp = state.resources.temperature;
    const roomTemp = state.environment.roomTemperature;
    const waterVolume = state.tank.waterLevel;

    const drift = calculateTemperatureDrift(waterTemp, roomTemp, waterVolume);

    if (drift === 0) {
      return [];
    }

    return [
      {
        tier: 'passive',
        resource: 'temperature',
        delta: drift,
        source: 'temperature-drift',
      },
    ];
  },
};

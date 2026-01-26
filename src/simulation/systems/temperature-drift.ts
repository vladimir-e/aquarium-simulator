/**
 * Temperature drift system - Newton's Law of Cooling.
 *
 * Heat loss is proportional to temperature differential.
 * Smaller tanks change temperature faster due to higher surface-area-to-volume ratio.
 */

import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import type { System } from './types.js';
import type { TunableConfig } from '../config/index.js';
import { type TemperatureConfig, temperatureDefaults } from '../config/temperature.js';

/**
 * Calculates the temperature drift toward room temperature for one tick (1 hour).
 */
export function calculateTemperatureDrift(
  waterTemp: number,
  roomTemp: number,
  waterVolume: number,
  config: TemperatureConfig = temperatureDefaults
): number {
  const deltaT = waterTemp - roomTemp;

  if (deltaT === 0) {
    return 0;
  }

  const volumeScale = Math.pow(config.referenceVolume / waterVolume, config.volumeExponent);
  const coolingRate = config.coolingCoefficient * Math.abs(deltaT) * volumeScale;

  // Drift toward room temp, but don't overshoot
  const drift = -Math.sign(deltaT) * Math.min(Math.abs(deltaT), coolingRate);

  return drift;
}

export const temperatureDriftSystem: System = {
  id: 'temperature-drift',
  tier: 'immediate',

  update(state: SimulationState, config: TunableConfig): Effect[] {
    const waterTemp = state.resources.temperature;
    const roomTemp = state.environment.roomTemperature;
    const waterVolume = state.resources.water;

    const drift = calculateTemperatureDrift(waterTemp, roomTemp, waterVolume, config.temperature);

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

/**
 * Temperature drift system - Newton's Law of Cooling.
 *
 * Heat loss is proportional to temperature differential.
 * Smaller tanks change temperature faster due to higher surface-area-to-volume ratio.
 * The water drifts toward the room as it stands this hour, plus what a lit
 * fixture puts into the surface.
 */

import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import type { System } from './types.js';
import type { TunableConfig } from '../config/index.js';
import { type TemperatureConfig, temperatureDefaults } from '../config/temperature.js';
import { getLightOutput } from '../equipment/light.js';
import { getHourOfDay } from '../core/clock.js';

const WARMEST_HOUR = 17;

/** The temperature the water is drifting toward this hour. */
export function ambientTemperature(
  state: SimulationState,
  config: TemperatureConfig = temperatureDefaults
): number {
  const hour = getHourOfDay(state);
  const room =
    state.environment.roomTemperature +
    config.roomDailySwing * Math.cos((2 * Math.PI * (hour - WARMEST_HOUR)) / 24);
  return room + config.lightWarmingPerPar * getLightOutput(state.equipment.light, hour);
}

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
    const drift = calculateTemperatureDrift(
      state.resources.temperature,
      ambientTemperature(state, config.temperature),
      state.resources.water,
      config.temperature
    );

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

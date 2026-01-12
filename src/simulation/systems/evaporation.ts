/**
 * Evaporation system - water loss due to evaporation.
 *
 * Evaporation rate scales exponentially with temperature differential.
 * Higher temperature above room temp = faster evaporation.
 */

import type { Effect } from '../effects.js';
import type { SimulationState } from '../state.js';
import type { System } from './types.js';

/** Base evaporation rate: 1% per day at equilibrium (no lid, medium flow) */
export const BASE_RATE_PER_DAY = 0.01;

/** Temperature doubling interval in °C (every 5.56°C diff doubles evaporation) */
export const TEMP_DOUBLING_INTERVAL = 5.56;

/**
 * Calculates the water evaporation amount for one tick (1 hour).
 */
export function calculateEvaporation(
  waterLevel: number,
  waterTemp: number,
  roomTemp: number
): number {
  if (waterLevel <= 0) {
    return 0;
  }

  const tempDelta = Math.abs(waterTemp - roomTemp);
  const tempMultiplier = Math.pow(2, tempDelta / TEMP_DOUBLING_INTERVAL);
  const dailyRate = BASE_RATE_PER_DAY * tempMultiplier;
  const hourlyRate = dailyRate / 24;
  const evapAmount = waterLevel * hourlyRate;

  return evapAmount;
}

export const evaporationSystem: System = {
  id: 'evaporation',
  tier: 'passive',

  update(state: SimulationState): Effect[] {
    const waterLevel = state.tank.waterLevel;
    const waterTemp = state.resources.temperature;
    const roomTemp = state.environment.roomTemperature;

    const evapAmount = calculateEvaporation(waterLevel, waterTemp, roomTemp);

    if (evapAmount === 0) {
      return [];
    }

    return [
      {
        tier: 'passive',
        resource: 'waterLevel',
        delta: -evapAmount,
        source: 'evaporation',
      },
    ];
  },
};

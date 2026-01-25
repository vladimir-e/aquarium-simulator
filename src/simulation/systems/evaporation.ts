/**
 * Evaporation system - water loss due to evaporation.
 *
 * Evaporation rate scales exponentially with temperature differential.
 * Higher temperature above room temp = faster evaporation.
 * Lid type affects evaporation rate via multiplier.
 */

import type { Effect } from '../core/effects.js';
import type { SimulationState, LidType } from '../state.js';
import type { System } from './types.js';
import type { TunableConfig } from '../config/index.js';
import { type EvaporationConfig, evaporationDefaults } from '../config/evaporation.js';

/**
 * Base evaporation rate: 1% of water volume per day at thermal equilibrium.
 *
 * Calibration basis: Open-top aquariums typically lose 1-2% per day depending
 * on humidity and airflow. We use 1% as baseline for still air, no lid.
 * Lid and flow modifiers can be added as multipliers in future.
 */
export const BASE_RATE_PER_DAY = evaporationDefaults.baseRatePerDay;

/**
 * Temperature doubling interval for evaporation rate.
 *
 * Physics: Clausius-Clapeyron equation shows vapor pressure doubles roughly
 * every 10°C. However, aquarium evaporation also depends on the water-air
 * temperature differential driving convection. Empirically, a 5-6°C increase
 * in water temp above room temp roughly doubles evaporation rate.
 * Value of 5.56°C = 10°F, a common aquarist rule of thumb.
 */
export const TEMP_DOUBLING_INTERVAL = evaporationDefaults.tempDoublingInterval;

/**
 * Evaporation multipliers based on lid type.
 * Controls how much the lid reduces evaporation.
 */
export const LID_MULTIPLIERS: Record<LidType, number> = {
  none: 1.0, // Full evaporation (100%)
  mesh: 0.75, // Reduced evaporation (75%)
  full: 0.25, // Minimal evaporation (25%)
  sealed: 0.0, // No evaporation (0%)
};

/**
 * Gets the evaporation multiplier for a given lid type.
 */
export function getLidMultiplier(lidType: LidType): number {
  return LID_MULTIPLIERS[lidType];
}

/**
 * Calculates the daily evaporation rate as a percentage.
 * Used for UI display purposes.
 */
export function calculateEvaporationRatePerDay(
  waterTemp: number,
  roomTemp: number,
  lidType: LidType = 'none',
  config: EvaporationConfig = evaporationDefaults
): number {
  const lidMultiplier = getLidMultiplier(lidType);
  if (lidMultiplier === 0) {
    return 0;
  }

  const tempDelta = Math.abs(waterTemp - roomTemp);
  const tempMultiplier = Math.pow(2, tempDelta / config.tempDoublingInterval);
  const dailyRate = config.baseRatePerDay * tempMultiplier * lidMultiplier;

  return dailyRate * 100; // Return as percentage
}

/**
 * Calculates the water evaporation amount for one tick (1 hour).
 * @param lidType - Optional lid type to apply multiplier (defaults to 'none')
 */
export function calculateEvaporation(
  waterLevel: number,
  waterTemp: number,
  roomTemp: number,
  lidType: LidType = 'none',
  config: EvaporationConfig = evaporationDefaults
): number {
  if (waterLevel <= 0) {
    return 0;
  }

  const lidMultiplier = getLidMultiplier(lidType);
  if (lidMultiplier === 0) {
    return 0;
  }

  const tempDelta = Math.abs(waterTemp - roomTemp);
  const tempMultiplier = Math.pow(2, tempDelta / config.tempDoublingInterval);
  const dailyRate = config.baseRatePerDay * tempMultiplier;
  const hourlyRate = dailyRate / 24;
  const evapAmount = waterLevel * hourlyRate * lidMultiplier;

  return evapAmount;
}

export const evaporationSystem: System = {
  id: 'evaporation',
  tier: 'immediate',

  update(state: SimulationState, config: TunableConfig): Effect[] {
    const waterLevel = state.resources.water;
    const waterTemp = state.resources.temperature;
    const roomTemp = state.environment.roomTemperature;
    const lidType = state.equipment.lid.type;

    const evapAmount = calculateEvaporation(
      waterLevel,
      waterTemp,
      roomTemp,
      lidType,
      config.evaporation
    );

    if (evapAmount === 0) {
      return [];
    }

    return [
      {
        tier: 'immediate',
        resource: 'water',
        delta: -evapAmount,
        source: 'evaporation',
      },
    ];
  },
};

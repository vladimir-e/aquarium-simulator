/**
 * Gas Exchange System - equilibrates dissolved O2 and CO2 with atmosphere.
 * Runs in PASSIVE tier.
 *
 * - O2 equilibrates toward temperature-dependent saturation (colder = more O2)
 * - CO2 equilibrates toward atmospheric level (~4 mg/L)
 * - Exchange rate scales with water flow (more flow = faster equilibration)
 */

import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import type { System } from './types.js';
import type { TunableConfig } from '../config/index.js';
import { type GasExchangeConfig, gasExchangeDefaults } from '../config/gas-exchange.js';

/**
 * Calculate O2 saturation based on temperature.
 * Colder water holds more dissolved oxygen (Henry's Law).
 *
 * @param temperature - Water temperature in °C
 * @returns O2 saturation concentration in mg/L
 */
export function calculateO2Saturation(
  temperature: number,
  config: GasExchangeConfig = gasExchangeDefaults
): number {
  const saturation =
    config.o2SaturationBase + config.o2SaturationSlope * (temperature - config.o2ReferenceTemp);
  // Floor at 4 mg/L even at extreme temperatures
  return Math.max(saturation, 4.0);
}

/**
 * Calculate flow factor for gas exchange.
 * More flow = faster equilibration, with diminishing returns.
 *
 * @param flow - Water flow in L/h
 * @param tankCapacity - Tank capacity in L
 * @returns Flow factor between 0 and 1
 */
export function calculateFlowFactor(
  flow: number,
  tankCapacity: number,
  config: GasExchangeConfig = gasExchangeDefaults
): number {
  if (tankCapacity <= 0) return 0;
  const turnovers = flow / tankCapacity;
  // Approaches 1.0 asymptotically as flow increases
  return Math.min(1.0, turnovers / config.optimalFlowTurnover);
}

/**
 * Calculate gas exchange toward equilibrium.
 * Uses exponential decay: delta = rate * (target - current)
 *
 * @param current - Current gas concentration (mg/L)
 * @param target - Target equilibrium concentration (mg/L)
 * @param baseRate - Base exchange rate per tick
 * @param flowFactor - Flow factor (0-1)
 * @returns Change in concentration (positive or negative)
 */
export function calculateGasExchange(
  current: number,
  target: number,
  baseRate: number,
  flowFactor: number
): number {
  const effectiveRate = baseRate * flowFactor;
  return effectiveRate * (target - current);
}

// ============================================================================
// System Implementation
// ============================================================================

export const gasExchangeSystem: System = {
  id: 'gas-exchange',
  tier: 'passive',

  update(state: SimulationState, config: TunableConfig): Effect[] {
    const effects: Effect[] = [];
    const { resources, tank } = state;
    const geConfig = config.gasExchange;

    // Calculate temperature-dependent O2 saturation
    const o2Saturation = calculateO2Saturation(resources.temperature, geConfig);

    // Calculate flow factor (0-1 based on tank turnovers)
    const flowFactor = calculateFlowFactor(resources.flow, tank.capacity, geConfig);

    // O2 exchange: move toward saturation
    const o2Delta = calculateGasExchange(
      resources.oxygen,
      o2Saturation,
      geConfig.baseExchangeRate,
      flowFactor
    );

    if (Math.abs(o2Delta) > 0.001) {
      effects.push({
        tier: 'passive',
        resource: 'oxygen',
        delta: o2Delta,
        source: 'gas-exchange-o2',
      });
    }

    // CO2 exchange: move toward atmospheric equilibrium
    const co2Delta = calculateGasExchange(
      resources.co2,
      geConfig.atmosphericCo2,
      geConfig.baseExchangeRate,
      flowFactor
    );

    if (Math.abs(co2Delta) > 0.001) {
      effects.push({
        tier: 'passive',
        resource: 'co2',
        delta: co2Delta,
        source: 'gas-exchange-co2',
      });
    }

    return effects;
  },
};

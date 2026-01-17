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

// ============================================================================
// Constants
// ============================================================================

/** Atmospheric CO2 equilibrium concentration (mg/L) */
export const ATMOSPHERIC_CO2 = 4.0;

/**
 * O2 saturation formula coefficients (simplified Henry's Law).
 * Saturation decreases with temperature as gases are less soluble in warmer water.
 */
/** Base O2 saturation at reference temperature (mg/L at 15°C) */
export const O2_SATURATION_BASE = 8.5;
/** Change in saturation per °C (negative = less O2 as temp increases) */
export const O2_SATURATION_SLOPE = -0.05;
/** Reference temperature for saturation calculation (°C) */
export const O2_REFERENCE_TEMP = 15;

/**
 * Exchange rate constants.
 * Gas exchange uses exponential decay toward equilibrium each tick.
 */
/** Fraction of difference moved toward equilibrium per tick at optimal flow */
export const BASE_EXCHANGE_RATE = 0.1;
/** Tank turnovers per hour needed for maximum exchange rate */
export const OPTIMAL_FLOW_TURNOVER = 10;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate O2 saturation based on temperature.
 * Colder water holds more dissolved oxygen (Henry's Law).
 *
 * @param temperature - Water temperature in °C
 * @returns O2 saturation concentration in mg/L
 */
export function calculateO2Saturation(temperature: number): number {
  const saturation =
    O2_SATURATION_BASE + O2_SATURATION_SLOPE * (temperature - O2_REFERENCE_TEMP);
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
export function calculateFlowFactor(flow: number, tankCapacity: number): number {
  if (tankCapacity <= 0) return 0;
  const turnovers = flow / tankCapacity;
  // Approaches 1.0 asymptotically as flow increases
  return Math.min(1.0, turnovers / OPTIMAL_FLOW_TURNOVER);
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

  update(state: SimulationState): Effect[] {
    const effects: Effect[] = [];
    const { resources, tank } = state;

    // Calculate temperature-dependent O2 saturation
    const o2Saturation = calculateO2Saturation(resources.temperature);

    // Calculate flow factor (0-1 based on tank turnovers)
    const flowFactor = calculateFlowFactor(resources.flow, tank.capacity);

    // O2 exchange: move toward saturation
    const o2Delta = calculateGasExchange(
      resources.oxygen,
      o2Saturation,
      BASE_EXCHANGE_RATE,
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
      ATMOSPHERIC_CO2,
      BASE_EXCHANGE_RATE,
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

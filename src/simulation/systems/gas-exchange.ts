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
 * A configured floor (`minFlowFactor`) models passive air/water surface
 * diffusion: a still tank still equilibrates with the atmosphere, just
 * slowly. Degenerate tanks (capacity <= 0) still return 0 — no water,
 * no surface.
 *
 * @param flow - Water flow in L/h
 * @param tankCapacity - Tank capacity in L
 * @returns Flow factor between minFlowFactor and 1
 */
export function calculateFlowFactor(
  flow: number,
  tankCapacity: number,
  config: GasExchangeConfig = gasExchangeDefaults
): number {
  if (tankCapacity <= 0) return 0;
  const turnovers = flow / tankCapacity;
  const flowDriven = Math.min(1.0, turnovers / config.optimalFlowTurnover);
  // Floor at minFlowFactor for baseline passive surface diffusion.
  return Math.max(flowDriven, config.minFlowFactor);
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

/**
 * Calculate aeration factor for gas exchange boost.
 * When aeration is active, multiply the exchange rate.
 *
 * @param aeration - Whether aeration is active
 * @param multiplier - Aeration exchange multiplier from config
 * @returns Factor to multiply exchange rate (1.0 if no aeration)
 */
export function calculateAerationFactor(aeration: boolean, multiplier: number): number {
  return aeration ? multiplier : 1.0;
}

interface SurfaceFactors {
  aeration: number;
  flow: number;
}

function surfaceFactors({ resources, tank }: SimulationState, config: GasExchangeConfig): SurfaceFactors {
  return {
    aeration: calculateAerationFactor(resources.aeration, config.aerationExchangeMultiplier),
    flow: calculateFlowFactor(resources.flow, tank.capacity, config),
  };
}

/**
 * mg/L of O2 the air gives the water over the hour on water the hour leaves at
 * `oxygen` mg/L: across the surface toward saturation, and out of the bubbles
 * while aerating, which never carry it past saturation.
 */
function oxygenGiven(
  { resources }: SimulationState,
  oxygen: number,
  config: GasExchangeConfig,
  factors: SurfaceFactors
): { surface: number; bubbles: number } {
  const saturation = calculateO2Saturation(resources.temperature, config);
  return {
    surface: calculateGasExchange(oxygen, saturation, config.baseExchangeRate * factors.aeration, factors.flow),
    bubbles: resources.aeration ? Math.min(config.aerationDirectO2, Math.max(0, saturation - oxygen)) : 0,
  };
}

export const gasExchangeSystem = {
  id: 'gas-exchange',
  tier: 'passive',

  oxygenDraw(state: SimulationState, oxygen: number, config: TunableConfig): number {
    const geConfig = config.gasExchange;
    const { surface, bubbles } = oxygenGiven(state, oxygen, geConfig, surfaceFactors(state, geConfig));
    return -(surface + bubbles);
  },

  update(state: SimulationState, config: TunableConfig, oxygen: number): Effect[] {
    const effects: Effect[] = [];
    const { resources } = state;
    const geConfig = config.gasExchange;
    const factors = surfaceFactors(state, geConfig);

    const { surface, bubbles } = oxygenGiven(state, oxygen, geConfig, factors);
    if (surface !== 0) {
      effects.push({ tier: 'passive', resource: 'oxygen', delta: surface, source: 'gas-exchange-o2' });
    }
    if (bubbles !== 0) {
      effects.push({ tier: 'passive', resource: 'oxygen', delta: bubbles, source: 'aeration-direct-o2' });
    }

    // CO2 exchange: move toward atmospheric equilibrium
    // Aeration increases CO2 off-gassing (bad for planted tanks!)
    const co2AerationFactor = resources.aeration
      ? factors.aeration * geConfig.aerationCo2OffgasMultiplier
      : 1.0;

    const co2Delta = calculateGasExchange(
      resources.co2,
      geConfig.atmosphericCo2,
      geConfig.baseExchangeRate * co2AerationFactor,
      factors.flow
    );

    if (co2Delta !== 0) {
      effects.push({
        tier: 'passive',
        resource: 'co2',
        delta: co2Delta,
        source: 'gas-exchange-co2',
      });
    }

    return effects;
  },
} satisfies System;

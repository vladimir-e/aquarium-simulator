/**
 * Decay system - converts food to waste with temperature scaling.
 * Runs in PASSIVE tier.
 */

import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import type { System } from './types.js';

/** Q10 temperature coefficient (rate doubles every 10°C) */
export const Q10 = 2.0;

/** Reference temperature for decay rate (°C) */
export const REFERENCE_TEMP = 25.0;

/** Base decay rate at reference temperature (fraction per hour) */
export const BASE_DECAY_RATE = 0.05; // 5% per hour at 25°C

/**
 * Fraction of decaying food that becomes solid waste.
 * The remaining fraction (60%) is oxidized by aerobic bacteria,
 * releasing CO2 and consuming O2.
 */
export const WASTE_CONVERSION_RATIO = 0.4;

/**
 * Gas exchange per gram of organic matter oxidized (mg per gram).
 *
 * Based on aerobic decomposition: C6H12O6 + 6O2 → 6CO2 + 6H2O
 * - Food is ~40% carbon by mass
 * - CO2 is 3.67x heavier than carbon (44/12)
 * - 1g food × 0.6 (oxidized) × 0.4 (carbon) × 3.67 ≈ 0.88g CO2
 * - Simplified to 1g (1000mg) per gram oxidized for both CO2 produced and O2 consumed
 *
 * This creates realistic feedback: overfeeding → decay → CO2↑ O2↓ → fish stress
 */
export const GAS_EXCHANGE_PER_GRAM_DECAY = 1000; // mg per gram oxidized

/**
 * Calculate temperature factor for decay rate using Q10 coefficient.
 * Rate doubles every 10°C above reference, halves every 10°C below.
 */
export function getTemperatureFactor(temperature: number): number {
  const tempDiff = temperature - REFERENCE_TEMP;
  return Math.pow(Q10, tempDiff / 10.0);
}

/**
 * Calculate amount of food that decays to waste this tick.
 * Returns decay amount in grams.
 */
export function calculateDecay(food: number, temperature: number): number {
  if (food <= 0) return 0;

  const tempFactor = getTemperatureFactor(temperature);
  const decayAmount = food * BASE_DECAY_RATE * tempFactor;

  // Can't decay more than available food
  return Math.min(decayAmount, food);
}

export const decaySystem: System = {
  id: 'decay',
  tier: 'passive',

  update(state: SimulationState): Effect[] {
    const effects: Effect[] = [];

    // Decay food → waste + CO2 + O2 consumption
    if (state.resources.food > 0) {
      const decayAmount = calculateDecay(
        state.resources.food,
        state.resources.temperature
      );

      if (decayAmount > 0) {
        // Food is consumed
        effects.push({
          tier: 'passive',
          resource: 'food',
          delta: -decayAmount,
          source: 'decay',
        });

        // Only a fraction becomes solid waste (rest is oxidized)
        const wasteAmount = decayAmount * WASTE_CONVERSION_RATIO;
        effects.push({
          tier: 'passive',
          resource: 'waste',
          delta: wasteAmount,
          source: 'decay',
        });

        // Oxidized portion produces CO2 and consumes O2
        // CO2/O2 are concentrations (mg/L), so divide by water volume
        const oxidizedAmount = decayAmount * (1 - WASTE_CONVERSION_RATIO);
        const waterVolume = state.resources.water;

        if (waterVolume > 0) {
          const gasExchangeMgPerL =
            (oxidizedAmount * GAS_EXCHANGE_PER_GRAM_DECAY) / waterVolume;

          // CO2 produced by aerobic decomposition
          effects.push({
            tier: 'passive',
            resource: 'co2',
            delta: gasExchangeMgPerL,
            source: 'decay',
          });

          // O2 consumed by bacteria respiration
          effects.push({
            tier: 'passive',
            resource: 'oxygen',
            delta: -gasExchangeMgPerL,
            source: 'decay',
          });
        }
      }
    }

    // Ambient waste from environment (constant small amount)
    // Note: ambient waste is too small to matter for gas exchange
    effects.push({
      tier: 'passive',
      resource: 'waste',
      delta: state.environment.ambientWaste,
      source: 'environment',
    });

    return effects;
  },
};

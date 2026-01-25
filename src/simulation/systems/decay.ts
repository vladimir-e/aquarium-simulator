/**
 * Decay system - converts food to waste with temperature scaling.
 * Runs in PASSIVE tier.
 */

import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import type { System } from './types.js';
import type { TunableConfig } from '../config/index.js';
import { type DecayConfig, decayDefaults } from '../config/decay.js';

/** Q10 temperature coefficient (rate doubles every 10°C) */
export const Q10 = decayDefaults.q10;

/** Reference temperature for decay rate (°C) */
export const REFERENCE_TEMP = decayDefaults.referenceTemp;

/** Base decay rate at reference temperature (fraction per hour) */
export const BASE_DECAY_RATE = decayDefaults.baseDecayRate;

/**
 * Fraction of decaying food that becomes solid waste.
 * The remaining fraction (60%) is oxidized by aerobic bacteria,
 * releasing CO2 and consuming O2.
 */
export const WASTE_CONVERSION_RATIO = decayDefaults.wasteConversionRatio;

/**
 * Gas exchange per gram of organic matter oxidized (mg per gram).
 *
 * Theoretical maximum based on aerobic decomposition chemistry:
 * - C6H12O6 + 6O2 → 6CO2 + 6H2O
 * - Food ~40% carbon, CO2 is 3.67x heavier than C
 * - Full oxidation would yield ~1500 mg CO2 per gram
 *
 * We use 250 mg/g (~17% of theoretical) because:
 * - Bacteria need time to colonize and multiply
 * - CO2/O2 exchange happens gradually over the decay period
 * - Not all carbon is immediately bioavailable
 *
 * This creates noticeable effects from overfeeding without instant crashes.
 */
export const GAS_EXCHANGE_PER_GRAM_DECAY = decayDefaults.gasExchangePerGramDecay;

/**
 * Calculate temperature factor for decay rate using Q10 coefficient.
 * Rate doubles every 10°C above reference, halves every 10°C below.
 */
export function getTemperatureFactor(
  temperature: number,
  config: DecayConfig = decayDefaults
): number {
  const tempDiff = temperature - config.referenceTemp;
  return Math.pow(config.q10, tempDiff / 10.0);
}

/**
 * Calculate amount of food that decays to waste this tick.
 * Returns decay amount in grams.
 */
export function calculateDecay(
  food: number,
  temperature: number,
  config: DecayConfig = decayDefaults
): number {
  if (food <= 0) return 0;

  const tempFactor = getTemperatureFactor(temperature, config);
  const decayAmount = food * config.baseDecayRate * tempFactor;

  // Can't decay more than available food
  return Math.min(decayAmount, food);
}

export const decaySystem: System = {
  id: 'decay',
  tier: 'passive',

  update(state: SimulationState, config: TunableConfig): Effect[] {
    const effects: Effect[] = [];
    const decayConfig = config.decay;

    // Decay food → waste + CO2 + O2 consumption
    if (state.resources.food > 0) {
      const decayAmount = calculateDecay(
        state.resources.food,
        state.resources.temperature,
        decayConfig
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
        const wasteAmount = decayAmount * decayConfig.wasteConversionRatio;
        effects.push({
          tier: 'passive',
          resource: 'waste',
          delta: wasteAmount,
          source: 'decay',
        });

        // Oxidized portion produces CO2 and consumes O2
        // CO2/O2 are concentrations (mg/L), so divide by water volume
        const oxidizedAmount = decayAmount * (1 - decayConfig.wasteConversionRatio);
        const waterVolume = state.resources.water;

        if (waterVolume > 0) {
          const gasExchangeMgPerL =
            (oxidizedAmount * decayConfig.gasExchangePerGramDecay) / waterVolume;

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

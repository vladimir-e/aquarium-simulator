/**
 * Decay system - converts food to waste with temperature scaling.
 * Runs in PASSIVE tier.
 */

import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import type { System } from './types.js';
import type { TunableConfig } from '../config/index.js';
import { type DecayConfig, decayDefaults } from '../config/decay.js';

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
      delta: decayConfig.ambientWaste,
      source: 'environment',
    });

    return effects;
  },
};

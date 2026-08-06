/**
 * Decay system - converts food to waste with temperature scaling.
 * Runs in PASSIVE tier.
 */

import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import type { System } from './types.js';
import type { TunableConfig } from '../config/index.js';
import { type DecayConfig, decayDefaults } from '../config/decay.js';
import { nutrientsDefaults } from '../config/nutrients.js';
import { monodFactor, q10Factor } from '../core/kinetics.js';
import { O2_TO_CO2_MASS_RATIO } from '../core/chemistry.js';
import { getPpm } from '../resources/index.js';

/**
 * Calculate temperature factor for decay rate using Q10 coefficient.
 * Rate doubles every 10°C above reference, halves every 10°C below.
 */
export function getTemperatureFactor(
  temperature: number,
  config: DecayConfig = decayDefaults
): number {
  return q10Factor(temperature, config.q10, config.referenceTemp);
}

/**
 * Calculate amount of food that decays to waste this tick.
 * Returns decay amount in grams.
 *
 * Aerobic decomposition is oxygen-limited as a whole process, not only on its
 * gas side: an anoxic tank builds sludge rather than mineralising it, and the
 * nitrogen bound in that sludge stays bound.
 */
export function calculateDecay(
  food: number,
  temperature: number,
  oxygen: number,
  config: DecayConfig = decayDefaults
): number {
  if (food <= 0) return 0;

  const tempFactor = getTemperatureFactor(temperature, config);
  const oxygenFactor = monodFactor(oxygen, config.oxygenHalfSaturation);
  const decayAmount = food * config.baseDecayRate * tempFactor * oxygenFactor;

  // Can't decay more than available food
  return Math.min(decayAmount, food);
}

export const decaySystem: System = {
  id: 'decay',
  tier: 'passive',

  update(state: SimulationState, config: TunableConfig): Effect[] {
    const effects: Effect[] = [];
    const decayConfig = config.decay;
    const nutrientsConfig = config.nutrients ?? nutrientsDefaults;

    // Decay food → waste + CO2 + O2 consumption + trace phosphate
    if (state.resources.food > 0) {
      const decayAmount = calculateDecay(
        state.resources.food,
        state.resources.temperature,
        state.resources.oxygen,
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

        // Phosphate released from decaying organic matter (mg per gram)
        // Links fish bioload to partial plant nutrition
        const phosphateProduced = decayAmount * nutrientsConfig.phosphatePerDecay;
        effects.push({
          tier: 'passive',
          resource: 'phosphate',
          delta: phosphateProduced,
          source: 'decay',
        });

        const oxidizedAmount = decayAmount * (1 - decayConfig.wasteConversionRatio);
        const oxygenDemandMgPerL = getPpm(
          oxidizedAmount * decayConfig.gasExchangePerGramDecay,
          state.resources.water
        );

        if (oxygenDemandMgPerL > 0) {
          effects.push({
            tier: 'passive',
            resource: 'co2',
            delta: oxygenDemandMgPerL * O2_TO_CO2_MASS_RATIO,
            source: 'decay',
          });

          effects.push({
            tier: 'passive',
            resource: 'oxygen',
            delta: -oxygenDemandMgPerL,
            source: 'decay',
          });
        }
      }
    }

    return effects;
  },
};

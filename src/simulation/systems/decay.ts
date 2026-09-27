/**
 * Decay system - converts food to waste with temperature scaling.
 * Runs in PASSIVE tier.
 *
 * The oxidised share leaves no solid behind, so its nitrogen and minerals go
 * straight to the water: N as NH3, and phosphate, potassium and iron at the
 * food's `foodMineralContent`.
 */

import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import type { System } from './types.js';
import type { TunableConfig } from '../config/index.js';
import { type DecayConfig, decayDefaults } from '../config/decay.js';
import { monodFactor, q10Factor } from '../core/kinetics.js';
import { CACO3_PER_NH3_MINERALIZED, O2_TO_CO2_MASS_RATIO } from '../core/chemistry.js';
import { ammoniaPerGramOfFood } from '../config/livestock.js';
import { WASTE_NUTRIENTS } from '../config/nutrients.js';
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
 * The share of standing food that decays in one hour at this temperature and
 * this dissolved oxygen.
 *
 * Aerobic decomposition is oxygen-limited as a whole process, not only on its
 * gas side: an anoxic tank builds sludge rather than mineralising it, and the
 * nitrogen bound in that sludge stays bound.
 */
export function decayFraction(
  temperature: number,
  oxygen: number,
  config: DecayConfig = decayDefaults
): number {
  return (
    config.baseDecayRate *
    getTemperatureFactor(temperature, config) *
    monodFactor(oxygen, config.oxygenHalfSaturation)
  );
}

/** Grams of food that decay to waste this tick, never more than there is. */
export function calculateDecay(
  food: number,
  temperature: number,
  oxygen: number,
  config: DecayConfig = decayDefaults
): number {
  if (food <= 0) return 0;
  return Math.min(food * decayFraction(temperature, oxygen, config), food);
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
        state.resources.oxygen,
        decayConfig
      );

      if (decayAmount > 0) {
        effects.push({
          tier: 'passive',
          resource: 'food',
          delta: -decayAmount,
          source: 'decay',
        });

        const wasteAmount = decayAmount * decayConfig.wasteConversionRatio;
        effects.push({
          tier: 'passive',
          resource: 'waste',
          delta: wasteAmount,
          source: 'decay',
        });

        const oxidizedAmount = decayAmount * (1 - decayConfig.wasteConversionRatio);
        const ammonia = oxidizedAmount * ammoniaPerGramOfFood(config.livestock);
        effects.push({
          tier: 'passive',
          resource: 'ammonia',
          delta: ammonia,
          source: 'decay',
        });
        effects.push({
          tier: 'passive',
          resource: 'kh',
          delta: ammonia * CACO3_PER_NH3_MINERALIZED,
          source: 'decay',
        });
        for (const nutrient of WASTE_NUTRIENTS) {
          effects.push({
            tier: 'passive',
            resource: nutrient,
            delta: oxidizedAmount * config.nutrients.foodMineralContent[nutrient],
            source: 'decay',
          });
        }

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

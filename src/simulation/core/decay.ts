/**
 * Decay system - converts food to waste with temperature scaling.
 * Runs in PASSIVE tier.
 */

import type { SimulationState } from '../state.js';
import type { Effect } from '../effects.js';

/** Q10 temperature coefficient (rate doubles every 10°C) */
export const Q10 = 2.0;

/** Reference temperature for decay rate (°C) */
export const REFERENCE_TEMP = 25.0;

/** Base decay rate at reference temperature (fraction per hour) */
export const BASE_DECAY_RATE = 0.05; // 5% per hour at 25°C

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

/**
 * Collect decay effects (PASSIVE tier).
 * - Food decays to waste (temperature-scaled)
 * - Ambient waste from environment
 */
export function collectDecayEffects(state: SimulationState): Effect[] {
  const effects: Effect[] = [];

  // Decay food → waste
  if (state.resources.food > 0) {
    const decayAmount = calculateDecay(
      state.resources.food,
      state.resources.temperature
    );

    if (decayAmount > 0) {
      effects.push({
        tier: 'passive',
        resource: 'food',
        delta: -decayAmount,
        source: 'decay',
      });

      effects.push({
        tier: 'passive',
        resource: 'waste',
        delta: decayAmount,
        source: 'decay',
      });
    }
  }

  // Ambient waste from environment (constant small amount)
  effects.push({
    tier: 'passive',
    resource: 'waste',
    delta: state.environment.ambientWaste,
    source: 'environment',
  });

  return effects;
}

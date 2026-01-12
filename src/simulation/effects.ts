/**
 * Effect system for resource modifications.
 */

import { produce } from 'immer';
import type { SimulationState } from './state.js';

export type EffectTier = 'immediate' | 'active' | 'passive';

export type ResourceKey = 'temperature' | 'waterLevel';

export interface Effect {
  /** Processing tier determines when this effect is applied */
  tier: EffectTier;
  /** Which resource to modify */
  resource: ResourceKey;
  /** Change amount (positive = increase, negative = decrease) */
  delta: number;
  /** What produced this effect (for debugging/logging) */
  source: string;
}

/** Temperature bounds in °C */
const MIN_TEMPERATURE = 0;
const MAX_TEMPERATURE = 50;

/**
 * Clamps a value between min and max (inclusive).
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Applies a list of effects to the simulation state.
 * Returns a new state object (immutable).
 */
export function applyEffects(
  state: SimulationState,
  effects: Effect[]
): SimulationState {
  if (effects.length === 0) {
    return state;
  }

  return produce(state, (draft) => {
    for (const effect of effects) {
      switch (effect.resource) {
        case 'temperature':
          draft.resources.temperature = clamp(
            draft.resources.temperature + effect.delta,
            MIN_TEMPERATURE,
            MAX_TEMPERATURE
          );
          break;
        case 'waterLevel':
          draft.tank.waterLevel = clamp(
            draft.tank.waterLevel + effect.delta,
            0,
            draft.tank.capacity
          );
          break;
      }
    }
  });
}

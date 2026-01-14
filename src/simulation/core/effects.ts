/**
 * Effect system for resource modifications.
 */

import { produce } from 'immer';
import type { SimulationState } from '../state.js';
import { ResourceRegistry, type ResourceKey } from '../resources/index.js';

export type EffectTier = 'immediate' | 'active' | 'passive';
export type { ResourceKey };

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
      const resource = ResourceRegistry[effect.resource];

      switch (effect.resource) {
        case 'temperature':
          draft.resources.temperature = clamp(
            draft.resources.temperature + effect.delta,
            resource.bounds.min,
            resource.bounds.max
          );
          break;
        case 'waterLevel':
          draft.tank.waterLevel = clamp(
            draft.tank.waterLevel + effect.delta,
            resource.bounds.min,
            draft.tank.capacity
          );
          break;
        case 'food':
          draft.resources.food = clamp(
            draft.resources.food + effect.delta,
            resource.bounds.min,
            resource.bounds.max
          );
          break;
        case 'waste':
          draft.resources.waste = clamp(
            draft.resources.waste + effect.delta,
            resource.bounds.min,
            resource.bounds.max
          );
          break;
        case 'algae':
          draft.resources.algae = clamp(
            draft.resources.algae + effect.delta,
            resource.bounds.min,
            resource.bounds.max
          );
          break;
      }
    }
  });
}

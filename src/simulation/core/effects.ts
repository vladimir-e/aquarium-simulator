/**
 * Effect system for resource modifications.
 *
 * Effects modify resources during tick processing. Bounds are fetched from
 * ResourceRegistry for consistency. Water has dynamic bounds (0 to tank.capacity).
 */

import { produce } from 'immer';
import type { SimulationState } from '../state.js';
import { ResourceRegistry, type ResourceKey } from '../resources/index.js';

// Re-export ResourceKey for convenience
export type { ResourceKey };

export type EffectTier = 'immediate' | 'active' | 'passive';

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
        case 'water':
          draft.resources.water = clamp(
            draft.resources.water + effect.delta,
            resource.bounds.min,
            draft.tank.capacity
          );
          break;
        case 'temperature':
          draft.resources.temperature = clamp(
            draft.resources.temperature + effect.delta,
            resource.bounds.min,
            resource.bounds.max
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
        case 'ammonia':
          draft.resources.ammonia = clamp(
            draft.resources.ammonia + effect.delta,
            resource.bounds.min,
            resource.bounds.max
          );
          break;
        case 'nitrite':
          draft.resources.nitrite = clamp(
            draft.resources.nitrite + effect.delta,
            resource.bounds.min,
            resource.bounds.max
          );
          break;
        case 'nitrate':
          draft.resources.nitrate = clamp(
            draft.resources.nitrate + effect.delta,
            resource.bounds.min,
            resource.bounds.max
          );
          break;
        case 'oxygen':
          draft.resources.oxygen = clamp(
            draft.resources.oxygen + effect.delta,
            resource.bounds.min,
            resource.bounds.max
          );
          break;
        case 'co2':
          draft.resources.co2 = clamp(
            draft.resources.co2 + effect.delta,
            resource.bounds.min,
            resource.bounds.max
          );
          break;
        case 'aob':
          draft.resources.aob = clamp(
            draft.resources.aob + effect.delta,
            resource.bounds.min,
            resource.bounds.max
          );
          break;
        case 'nob':
          draft.resources.nob = clamp(
            draft.resources.nob + effect.delta,
            resource.bounds.min,
            resource.bounds.max
          );
          break;
      }
    }
  });
}

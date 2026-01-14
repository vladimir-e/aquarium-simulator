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
      const location = draft[resource.location] as Record<string, number>;
      const currentValue = location[resource.property] as number;

      // Special case: waterLevel max is tank capacity (dynamic bound)
      const maxBound =
        effect.resource === 'waterLevel' ? draft.tank.capacity : resource.bounds.max;

      const newValue = currentValue + effect.delta;
      const clampedValue = Math.max(resource.bounds.min, Math.min(maxBound, newValue));

      location[resource.property] = clampedValue;
    }
  });
}

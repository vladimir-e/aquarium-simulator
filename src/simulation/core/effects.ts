/**
 * Effect system for resource modifications.
 */

import { produce } from 'immer';
import type { SimulationState } from '../state.js';

export type EffectTier = 'immediate' | 'active' | 'passive';

export type ResourceKey =
  | 'temperature'
  | 'waterLevel'
  | 'food'
  | 'waste'
  | 'algae'
  | 'ammonia'
  | 'nitrite'
  | 'nitrate'
  | 'aob'
  | 'nob';

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

/** Food/Waste bounds in grams */
const MIN_RESOURCE = 0;
const MAX_RESOURCE = 1000; // Reasonable upper limit

/** Algae bounds (0-100 relative scale) */
const MIN_ALGAE = 0;
const MAX_ALGAE = 100;

/** Nitrogen compound bounds in grams */
const MIN_NITROGEN = 0;
const MAX_NITROGEN = 1000; // Reasonable upper limit in grams

/** Bacteria population bounds (absolute units, capped by surface area in nitrogen cycle) */
const MIN_BACTERIA = 0;
const MAX_BACTERIA = 100; // Reasonable upper limit for absolute bacteria count

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
        case 'food':
          draft.resources.food = clamp(
            draft.resources.food + effect.delta,
            MIN_RESOURCE,
            MAX_RESOURCE
          );
          break;
        case 'waste':
          draft.resources.waste = clamp(
            draft.resources.waste + effect.delta,
            MIN_RESOURCE,
            MAX_RESOURCE
          );
          break;
        case 'algae':
          draft.resources.algae = clamp(
            draft.resources.algae + effect.delta,
            MIN_ALGAE,
            MAX_ALGAE
          );
          break;
        case 'ammonia':
          draft.resources.ammonia = clamp(
            draft.resources.ammonia + effect.delta,
            MIN_NITROGEN,
            MAX_NITROGEN
          );
          break;
        case 'nitrite':
          draft.resources.nitrite = clamp(
            draft.resources.nitrite + effect.delta,
            MIN_NITROGEN,
            MAX_NITROGEN
          );
          break;
        case 'nitrate':
          draft.resources.nitrate = clamp(
            draft.resources.nitrate + effect.delta,
            MIN_NITROGEN,
            MAX_NITROGEN
          );
          break;
        case 'aob':
          draft.resources.aob = clamp(
            draft.resources.aob + effect.delta,
            MIN_BACTERIA,
            MAX_BACTERIA
          );
          break;
        case 'nob':
          draft.resources.nob = clamp(
            draft.resources.nob + effect.delta,
            MIN_BACTERIA,
            MAX_BACTERIA
          );
          break;
      }
    }
  });
}

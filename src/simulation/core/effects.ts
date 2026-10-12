/**
 * Effect system for resource modifications.
 *
 * Effects modify resources during tick processing. Bounds are fetched from
 * ResourceRegistry for consistency. Water has dynamic bounds (0 to tank.capacity).
 */

import { produce } from 'immer';
import type { SimulationState } from '../state.js';
import { isOrganicPool, ResourceRegistry, type OrganicResourceKey, type ResourceKey } from '../resources/index.js';
import type { TunableConfig } from '../config/index.js';
import { addOrganics, type Organics } from './organics.js';

// Re-export ResourceKey for convenience
export type { ResourceKey };

export type EffectTier = 'immediate' | 'active' | 'passive';

interface EffectOn<R extends ResourceKey, D> {
  /** Processing tier determines when this effect is applied */
  tier: EffectTier;
  /** Which resource to modify */
  resource: R;
  /** Change amount (positive = increase, negative = decrease) */
  delta: D;
  /** What produced this effect (for debugging/logging) */
  source: string;
}

type OrganicEffect = EffectOn<OrganicResourceKey, Organics>;

export type Effect = EffectOn<Exclude<ResourceKey, OrganicResourceKey>, number> | OrganicEffect;

const isOrganicEffect = (effect: Effect): effect is OrganicEffect => isOrganicPool(effect.resource);

/**
 * Clamps a value between min and max (inclusive).
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Adds organics to a pool where the tank holds it: food and waste in the water, mulm in the bed. */
function addToPool(draft: SimulationState, pool: OrganicResourceKey, delta: Organics): void {
  if (pool === 'mulm') {
    const bed = draft.equipment.substrate;
    bed.organicReserve = addOrganics(bed.organicReserve, delta);
  } else {
    draft.resources[pool] = addOrganics(draft.resources[pool], delta);
  }
}

/**
 * Applies a list of effects to the simulation state.
 * Returns a new state object (immutable).
 *
 * @param state - Current simulation state
 * @param effects - Effects to apply
 * @param config - Optional tunable config (reserved for future
 *   resource-specific bounds; currently only the static
 *   `ResourceRegistry` bounds are consulted).
 */
export function applyEffects(
  state: SimulationState,
  effects: Effect[],
  _config?: TunableConfig
): SimulationState {
  if (effects.length === 0) {
    return state;
  }

  return produce(state, (draft) => {
    for (const effect of effects) {
      if (isOrganicEffect(effect)) {
        addToPool(draft, effect.resource, effect.delta);
        continue;
      }
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
        case 'kh':
          draft.resources.kh = clamp(
            draft.resources.kh + effect.delta,
            resource.bounds.min,
            resource.bounds.max
          );
          break;
        case 'gh':
          draft.resources.gh = clamp(
            draft.resources.gh + effect.delta,
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
        case 'phosphate':
          draft.resources.phosphate = clamp(
            draft.resources.phosphate + effect.delta,
            resource.bounds.min,
            resource.bounds.max
          );
          break;
        case 'potassium':
          draft.resources.potassium = clamp(
            draft.resources.potassium + effect.delta,
            resource.bounds.min,
            resource.bounds.max
          );
          break;
        case 'iron':
          draft.resources.iron = clamp(
            draft.resources.iron + effect.delta,
            resource.bounds.min,
            resource.bounds.max
          );
          break;
      }
    }
  });
}

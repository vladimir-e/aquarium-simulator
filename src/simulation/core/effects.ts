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

type ScalarResourceKey = Exclude<ResourceKey, OrganicResourceKey>;

type ScalarEffect = EffectOn<ScalarResourceKey, number>;

type OrganicEffect = EffectOn<OrganicResourceKey, Organics>;

export type Effect = ScalarEffect | OrganicEffect;

const isOrganicEffect = (effect: Effect): effect is OrganicEffect => isOrganicPool(effect.resource);

const isScalarEffect = (effect: Effect): effect is ScalarEffect => !isOrganicEffect(effect);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function bounds(tank: SimulationState, resource: ScalarResourceKey): { min: number; max: number } {
  const { min, max } = ResourceRegistry[resource].bounds;
  return { min, max: resource === 'water' ? tank.tank.capacity : max };
}

function byResource<R extends ResourceKey, D>(effects: readonly EffectOn<R, D>[]): Map<R, D[]> {
  const deltas = new Map<R, D[]>();
  for (const { resource, delta } of effects) {
    const held = deltas.get(resource);
    if (held) held.push(delta);
    else deltas.set(resource, [delta]);
  }
  return deltas;
}

/** A pool where the tank holds it: food and waste in the water, mulm in the bed. */
export function organicPool(
  tank: Pick<SimulationState, 'resources' | 'equipment'>,
  pool: OrganicResourceKey
): Organics {
  return pool === 'mulm' ? tank.equipment.substrate.organicReserve : tank.resources[pool];
}

function addToPool(draft: SimulationState, pool: OrganicResourceKey, deltas: readonly Organics[]): void {
  const added = addOrganics(organicPool(draft, pool), ...deltas);
  if (pool === 'mulm') draft.equipment.substrate.organicReserve = added;
  else draft.resources[pool] = added;
}

/**
 * Applies a batch of effects, each resource's deltas netted across the batch
 * before its bounds hold it, so no effect's place in the batch decides what the
 * stock ends at. Returns a new state object (immutable).
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
    for (const [pool, deltas] of byResource(effects.filter(isOrganicEffect))) {
      addToPool(draft, pool, deltas);
    }
    for (const [resource, deltas] of byResource(effects.filter(isScalarEffect))) {
      const { min, max } = bounds(draft, resource);
      const netted = deltas.reduce((value, delta) => value + delta, draft.resources[resource]);
      draft.resources[resource] = clamp(netted, min, max);
    }
  });
}

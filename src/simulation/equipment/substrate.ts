/**
 * Substrate equipment for bacteria colonization and plant rooting.
 */

import { produce } from 'immer';
import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import { type DecayConfig, decayDefaults } from '../config/decay.js';

export type SubstrateType = 'none' | 'sand' | 'gravel' | 'aqua_soil';

export interface Substrate {
  /** Substrate type affects surface area and plant rooting */
  type: SubstrateType;
  /** Organic matter left in the bed, grams — leaches into the water and never refills */
  organicReserve: number;
}

export const DEFAULT_SUBSTRATE: Substrate = {
  type: 'none',
  organicReserve: 0,
};

/** Substrate bacteria surface per liter of tank (cm²/L) */
export const SUBSTRATE_SURFACE_PER_LITER: Record<SubstrateType, number> = {
  none: 0,
  sand: 400,
  gravel: 800,
  aqua_soil: 1200,
};

/**
 * Organic matter a fresh bed holds per liter of tank (g/L).
 *
 * Distinct from `SUBSTRATE_SURFACE_PER_LITER`: surface is the colony
 * ceiling, this is the ammonia source.
 */
export const SUBSTRATE_ORGANIC_PER_LITER: Record<SubstrateType, number> = {
  none: 0,
  sand: 0.011,
  gravel: 0.013,
  aqua_soil: 0.05,
};

/**
 * Gets the bacteria surface area for a substrate type (cm²).
 * Surface scales with tank capacity.
 */
export function getSubstrateSurface(type: SubstrateType, tankCapacity: number): number {
  return SUBSTRATE_SURFACE_PER_LITER[type] * tankCapacity;
}

/**
 * Gets the organic reserve a fresh bed of this type starts with (g).
 * Scales with tank capacity, so concentration is volume-independent.
 */
export function getSubstrateOrganicReserve(type: SubstrateType, tankCapacity: number): number {
  return SUBSTRATE_ORGANIC_PER_LITER[type] * tankCapacity;
}

/**
 * Swaps the bed for one of a different type, which is the only way a tank
 * gets its organic reserve back: the new bag of soil is new material.
 *
 * Returns the *same object* when the type is unchanged, and callers depend
 * on that identity: `useSimulation` decides whether a rescape happened —
 * whether to log it and recalculate surface — by comparing references.
 */
export function replaceSubstrate(
  substrate: Substrate,
  type: SubstrateType,
  tankCapacity: number
): Substrate {
  if (type === substrate.type) return substrate;
  return { type, organicReserve: getSubstrateOrganicReserve(type, tankCapacity) };
}

/**
 * Grams of organics the bed releases this tick — a fixed fraction of
 * what is left, so the source tapers as the bed is spent.
 */
export function calculateSubstrateLeach(
  organicReserve: number,
  config: DecayConfig = decayDefaults
): number {
  if (organicReserve <= 0) return 0;
  return organicReserve * config.substrateLeachRate;
}

export interface SubstrateUpdateResult {
  state: SimulationState;
  effects: Effect[];
}

/**
 * The leach lands in the waste pool, where mineralization turns it into
 * ammonia like any other organic matter.
 */
export function substrateUpdate(
  state: SimulationState,
  config: DecayConfig = decayDefaults
): SubstrateUpdateResult {
  const leached = calculateSubstrateLeach(state.equipment.substrate.organicReserve, config);

  if (leached <= 0) {
    return { state, effects: [] };
  }

  return {
    state: produce(state, (draft) => {
      draft.equipment.substrate.organicReserve -= leached;
    }),
    effects: [
      {
        tier: 'immediate',
        resource: 'waste',
        delta: leached,
        source: 'substrate-leach',
      },
    ],
  };
}

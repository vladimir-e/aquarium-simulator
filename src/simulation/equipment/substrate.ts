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
 * ceiling, this is the ammonia source. Aqua soil is packed with
 * mineralizing organics — the reason a fresh soil tank is unstockable
 * for weeks and the reason the dark-start method works. Gravel and sand
 * carry only what clings to them from the bag; a bare bottom has no
 * source at all, so an unfed bare tank never cycles.
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
 * Draws this tick's leach out of the bed and into the waste pool, where
 * mineralization turns it into ammonia like any other organic matter.
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

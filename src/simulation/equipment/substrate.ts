/**
 * Substrate equipment for bacteria colonization and plant rooting.
 */

import { produce } from 'immer';
import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import { type DecayConfig, decayDefaults } from '../config/decay.js';
import { type WaterChemistryConfig, waterChemistryDefaults } from '../config/water-chemistry.js';

export type SubstrateType = 'none' | 'sand' | 'gravel' | 'aqua_soil';

export interface Substrate {
  /** Substrate type affects surface area and plant rooting */
  type: SubstrateType;
  /** Organic matter left in the bed, grams — leaches into the water and never refills */
  organicReserve: number;
  /** Alkalinity the bed can still take up, mg of CaCO3 — spent as it buffers and never refills */
  khReserve: number;
}

export const DEFAULT_SUBSTRATE: Substrate = {
  type: 'none',
  organicReserve: 0,
  khReserve: 0,
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
 * Alkalinity a fresh bed can take up per liter of tank (mg CaCO3/L). Only
 * aqua soil buffers; inert beds leave KH alone.
 */
export const SUBSTRATE_KH_RESERVE_PER_LITER: Record<SubstrateType, number> = {
  none: 0,
  sand: 0,
  gravel: 0,
  aqua_soil: 700,
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

/** Gets the alkalinity a fresh bed of this type can take up (mg CaCO3). */
export function getSubstrateKhReserve(type: SubstrateType, tankCapacity: number): number {
  return SUBSTRATE_KH_RESERVE_PER_LITER[type] * tankCapacity;
}

/** A bed of this type straight out of the bag. */
export function freshSubstrate(type: SubstrateType, tankCapacity: number): Substrate {
  return {
    type,
    organicReserve: getSubstrateOrganicReserve(type, tankCapacity),
    khReserve: getSubstrateKhReserve(type, tankCapacity),
  };
}

/**
 * Swaps the bed for one of a different type, which is the only way a tank
 * gets its reserves back: the new bag of soil is new material.
 *
 * The bed alone — everything a swap costs the rest of the tank is `rescape`.
 * Returns the *same object* when the type is unchanged, which is how that
 * caller tells a rescape from a no-op.
 */
export function replaceSubstrate(
  substrate: Substrate,
  type: SubstrateType,
  tankCapacity: number
): Substrate {
  if (type === substrate.type) return substrate;
  return freshSubstrate(type, tankCapacity);
}

/**
 * Grams of organics the bed releases this tick — a fixed fraction of
 * what is left, so the source tapers as the bed is spent. Never more than
 * the bed still holds: the rate is a tunable a debug session can push past
 * 1, and a bed cannot release mass it does not have.
 */
export function calculateSubstrateLeach(
  organicReserve: number,
  config: DecayConfig = decayDefaults
): number {
  if (organicReserve <= 0) return 0;
  return Math.min(organicReserve, organicReserve * config.substrateLeachRate);
}

/**
 * mg of CaCO3 the bed takes out of the water this tick: `aquaSoilKhUptake` of
 * the tank's KH while fresh, scaled by the share of its reserve still left, so
 * the bed's grip loosens as it is spent. Never more than it can still hold.
 */
export function calculateSubstrateKhUptake(
  kh: number,
  substrate: Substrate,
  tankCapacity: number,
  config: WaterChemistryConfig = waterChemistryDefaults
): number {
  const fresh = getSubstrateKhReserve(substrate.type, tankCapacity);
  if (fresh <= 0 || substrate.khReserve <= 0) return 0;
  const uptake = kh * config.aquaSoilKhUptake * (substrate.khReserve / fresh);
  return Math.min(substrate.khReserve, uptake);
}

export interface SubstrateUpdateResult {
  state: SimulationState;
  effects: Effect[];
}

/**
 * The leach lands in the waste pool, where mineralization turns it into
 * ammonia like any other organic matter. The bed buffers by cation exchange:
 * it holds on to Ca²⁺ and Mg²⁺ and gives back H⁺, which spends carbonate —
 * so every mg it takes up leaves the water as KH and as GH alike, and never
 * more than the water has of either. Both come out of the bed's reserves.
 */
export function substrateUpdate(
  state: SimulationState,
  decay: DecayConfig = decayDefaults,
  chemistry: WaterChemistryConfig = waterChemistryDefaults
): SubstrateUpdateResult {
  const { substrate } = state.equipment;
  const leached = calculateSubstrateLeach(substrate.organicReserve, decay);
  const uptake =
    state.resources.water > 0
      ? Math.min(
          calculateSubstrateKhUptake(state.resources.kh, substrate, state.tank.capacity, chemistry),
          state.resources.gh
        )
      : 0;

  if (leached <= 0 && uptake <= 0) {
    return { state, effects: [] };
  }

  const effects: Effect[] = [];
  if (leached > 0) {
    effects.push({ tier: 'immediate', resource: 'waste', delta: leached, source: 'substrate-leach' });
  }
  if (uptake > 0) {
    effects.push(
      { tier: 'immediate', resource: 'kh', delta: -uptake, source: 'substrate-buffer' },
      { tier: 'immediate', resource: 'gh', delta: -uptake, source: 'substrate-buffer' }
    );
  }

  return {
    state: produce(state, (draft) => {
      draft.equipment.substrate.organicReserve -= leached;
      draft.equipment.substrate.khReserve -= uptake;
    }),
    effects,
  };
}

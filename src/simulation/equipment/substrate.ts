/**
 * Substrate equipment for bacteria colonization and plant rooting, and the
 * store of nutrients a root feeder draws on.
 */

import { produce } from 'immer';
import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import { type DecayConfig, decayDefaults } from '../config/decay.js';
import { type WaterChemistryConfig, waterChemistryDefaults } from '../config/water-chemistry.js';
import {
  mapNutrients,
  NUTRIENTS,
  nutrientsDefaults,
  ZERO_NUTRIENTS,
  type NutrientsConfig,
  type NutrientVector,
} from '../config/nutrients.js';

export type SubstrateType = 'none' | 'sand' | 'gravel' | 'aqua_soil';

export interface Substrate {
  /** Substrate type affects surface area and plant rooting */
  type: SubstrateType;
  /** Organic matter held in the bed, grams — filled by settling waste, drained by leaching */
  organicReserve: number;
  /** Alkalinity the bed can still take up, mg of CaCO3 — spent as it buffers and never refills */
  khReserve: number;
  /** mg of each nutrient the bed holds — filled by root tabs, drained by roots and the leak */
  nutrients: NutrientVector;
}

export const DEFAULT_SUBSTRATE: Substrate = {
  type: 'none',
  organicReserve: 0,
  khReserve: 0,
  nutrients: ZERO_NUTRIENTS,
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
 * Nutrients a fresh bed holds per liter of tank (mg/L). Aqua soil comes
 * charged — enough to carry a sword for months untabbed; inert beds hold none.
 */
export const SUBSTRATE_NUTRIENTS_PER_LITER: Record<SubstrateType, NutrientVector> = {
  none: ZERO_NUTRIENTS,
  sand: ZERO_NUTRIENTS,
  gravel: ZERO_NUTRIENTS,
  aqua_soil: { nitrate: 50, phosphate: 5, potassium: 20, iron: 1 },
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

/** mg of each nutrient a fresh bed of this type holds. */
export function getSubstrateNutrients(type: SubstrateType, tankCapacity: number): NutrientVector {
  const perLiter = SUBSTRATE_NUTRIENTS_PER_LITER[type];
  return mapNutrients((n) => perLiter[n] * tankCapacity);
}

/** A bed of this type straight out of the bag. */
export function freshSubstrate(type: SubstrateType, tankCapacity: number): Substrate {
  return {
    type,
    organicReserve: getSubstrateOrganicReserve(type, tankCapacity),
    khReserve: getSubstrateKhReserve(type, tankCapacity),
    nutrients: getSubstrateNutrients(type, tankCapacity),
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

/** mg of each nutrient the bed leaks into the water this tick — a share of what it holds. */
export function calculateBedLeak(
  nutrients: NutrientVector,
  config: NutrientsConfig = nutrientsDefaults
): NutrientVector {
  return mapNutrients((n) => nutrients[n] * config.bedLeakRate);
}

/**
 * Share of standing waste that settles into the bed this hour. Flow keeps
 * particles in suspension, so the share halves at `settlingHalfTurnover` tank
 * turnovers an hour. Nothing settles without a bed, or without water.
 */
export function wasteSettlingShare(
  state: Pick<SimulationState, 'resources' | 'equipment'>,
  config: DecayConfig = decayDefaults
): number {
  const { water, flow } = state.resources;
  if (state.equipment.substrate.type === 'none' || water <= 0) return 0;
  return config.wasteSettlingRate / (1 + flow / water / config.settlingHalfTurnover);
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
 * The bed trades organics with the waste pool both ways: a share of standing
 * waste settles into it as mulm, and the reserve leaches back out, where
 * mineralization turns it into ammonia like any other organic matter. The bed buffers by cation exchange:
 * it holds on to Ca²⁺ and Mg²⁺ and gives back H⁺, which spends carbonate —
 * so every mg it takes up leaves the water as KH and as GH alike, and never
 * more than the water has of either. Both come out of the bed's reserves.
 * Its nutrient store leaks into the water.
 */
export function substrateUpdate(
  state: SimulationState,
  decay: DecayConfig = decayDefaults,
  chemistry: WaterChemistryConfig = waterChemistryDefaults,
  nutrients: NutrientsConfig = nutrientsDefaults
): SubstrateUpdateResult {
  const { substrate } = state.equipment;
  const leaked = calculateBedLeak(substrate.nutrients, nutrients);
  const leached = calculateSubstrateLeach(substrate.organicReserve, decay);
  const settled = state.resources.waste * wasteSettlingShare(state, decay);
  const uptake =
    state.resources.water > 0
      ? Math.min(
          calculateSubstrateKhUptake(state.resources.kh, substrate, state.tank.capacity, chemistry),
          state.resources.gh
        )
      : 0;

  const leaking = NUTRIENTS.filter((n) => leaked[n] > 0);
  if (leached <= 0 && settled <= 0 && uptake <= 0 && leaking.length === 0) {
    return { state, effects: [] };
  }

  const effects: Effect[] = leaking.map((n) => ({
    tier: 'immediate',
    resource: n,
    delta: leaked[n],
    source: 'substrate-leak',
  }));
  if (leached > 0) {
    effects.push({ tier: 'immediate', resource: 'waste', delta: leached, source: 'substrate-leach' });
  }
  if (settled > 0) {
    effects.push({ tier: 'immediate', resource: 'waste', delta: -settled, source: 'substrate-settling' });
  }
  if (uptake > 0) {
    effects.push(
      { tier: 'immediate', resource: 'kh', delta: -uptake, source: 'substrate-buffer' },
      { tier: 'immediate', resource: 'gh', delta: -uptake, source: 'substrate-buffer' }
    );
  }

  return {
    state: produce(state, (draft) => {
      draft.equipment.substrate.organicReserve += settled - leached;
      draft.equipment.substrate.khReserve -= uptake;
      for (const n of leaking) draft.equipment.substrate.nutrients[n] -= leaked[n];
    }),
    effects,
  };
}

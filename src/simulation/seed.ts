/**
 * A seed sets initial stock values and nothing else: no new dynamics, no
 * gates, no catch-up. Whatever it writes, the tick loop takes from there.
 */

import type { Resources, SimulationState } from './state.js';
import type { FishLifeStage, FishSex, FishSpecies } from './livestock/species.js';
import type { PlantSpecies } from './plants/species.js';
import {
  getSubstrateOrganicReserve,
  type Substrate,
  type SubstrateType,
} from './equipment/substrate.js';
import { createFish } from './livestock/create-fish.js';
import { createPlant } from './plants/create-plant.js';

const SEEDABLE_BACTERIA = ['aob', 'nob'] as const;

const SEEDABLE_SUBSTRATE = ['organicReserve'] as const;

const SEEDABLE_RESOURCES = [
  'ammonia',
  'nitrite',
  'nitrate',
  'phosphate',
  'potassium',
  'iron',
  'oxygen',
  'co2',
] as const;

export type SeedColony = Partial<Pick<Resources, (typeof SEEDABLE_BACTERIA)[number]>>;

/**
 * A colony as absolute stock, or `'cycled'` — a tank that has been running a
 * month, which is a claim about the whole tank and not only its biofilter: it
 * carries the bed that month left as well as the colony. Both are resolved
 * against the tank when the seed is applied, so a preset resized or rescaped
 * at the door still gets a filter and a bed that fit it.
 */
export type SeedBacteria = 'cycled' | SeedColony;

/** The bed's stocks. Its *type* is configuration, not state — see `SimulationConfig`. */
export type SeedSubstrate = Partial<Pick<Substrate, (typeof SEEDABLE_SUBSTRATE)[number]>>;

/**
 * Chemistry stocks a seed may set, in the units `Resources` stores them
 * in: nitrogen compounds and nutrients as mass in mg (`getMassFromPpm`
 * converts from a test-kit reading), dissolved gases as mg/L.
 */
export type SeedResources = Partial<Pick<Resources, (typeof SEEDABLE_RESOURCES)[number]>>;

export interface SeedFishGroup {
  species: FishSpecies;
  /** Defaults to 1. */
  count?: number;
  /** Age in ticks. Defaults to 0. */
  age?: number;
  sex?: FishSex;
  /**
   * Defaults to `adult`. Independent of `age`, so both a newly-stocked
   * grown fish and a months-old juvenile are expressible.
   */
  stage?: FishLifeStage;
}

export interface SeedPlantGroup {
  species: PlantSpecies;
  /** Defaults to 1. */
  count?: number;
  /** Size %, same scale as `Plant.size`. */
  size?: number;
}

/** Nothing here is validated or clamped — see `docs/1-DESIGN.md` § Starting State. */
export interface PresetSeed {
  bacteria?: SeedBacteria;
  substrate?: SeedSubstrate;
  resources?: SeedResources;
  fish?: SeedFishGroup[];
  plants?: SeedPlantGroup[];
}

/**
 * AOB units per litre a tank that cycled itself carries. A fishless soil
 * tank measured from 10 L to 1000 L rests at ~261 once cycled; rounding up
 * means a scenario that says "cycled" is never handed a weaker biofilter
 * than one that waited three weeks for it. That soil tank sits at ~2 % of
 * its surface ceiling once seeded, so the cap stays out of the way; a bare
 * 300 L with no filter has so little surface that the same figure fills 40 %
 * of it.
 */
const CYCLED_AOB_PER_LITER = 300;

/** NOB units per litre, off the same measurement (~181) and rounded the same way. */
const CYCLED_NOB_PER_LITER = 200;

/**
 * Share of a fresh bed's organic reserve still in it on day 30 — the same tank
 * age the colony figures above were read at.
 *
 * The leach is a flat fraction of what is left with no substrate term, so this
 * is one curve every bed follows: gravel, aqua soil and sand all sit at 0.115
 * there, and only the grams differ. Rounded down for the reason the colony is
 * rounded up — a scenario that says "cycled" should never be handed a bed
 * still leaching harder than one that waited.
 */
const CYCLED_RESERVE_FRACTION = 0.1;

/**
 * The colony a cycled tank of `capacity` litres carries.
 *
 * Per litre rather than per cm² of surface for the reason the inoculum is:
 * a colony is sized by its ammonia supply, which scales with the water,
 * while surface is only a ceiling.
 */
export function cycledColony(capacity: number): { aob: number; nob: number } {
  return {
    aob: capacity * CYCLED_AOB_PER_LITER,
    nob: capacity * CYCLED_NOB_PER_LITER,
  };
}

/** Grams a bed of this type and capacity still holds once cycled. */
export function cycledReserve(type: SubstrateType, capacity: number): number {
  return getSubstrateOrganicReserve(type, capacity) * CYCLED_RESERVE_FRACTION;
}

function writeStocks<T, K extends keyof T>(
  target: T,
  keys: readonly K[],
  values: Partial<Pick<T, K>> | undefined
): void {
  if (values === undefined) return;
  for (const key of keys) {
    const value = values[key];
    if (value !== undefined) target[key] = value;
  }
}

export function applySeed(
  state: SimulationState,
  seed: PresetSeed,
  rng: () => number = Math.random
): void {
  const { capacity } = state.tank;
  const bacteria = seed.bacteria === 'cycled' ? cycledColony(capacity) : seed.bacteria;
  const cycledBed =
    seed.bacteria === 'cycled'
      ? { organicReserve: cycledReserve(state.equipment.substrate.type, capacity) }
      : undefined;

  writeStocks(state.resources, SEEDABLE_BACTERIA, bacteria);
  writeStocks(state.equipment.substrate, SEEDABLE_SUBSTRATE, seed.substrate ?? cycledBed);
  writeStocks(state.resources, SEEDABLE_RESOURCES, seed.resources);

  for (const group of seed.fish ?? []) {
    for (let i = 0; i < (group.count ?? 1); i++) {
      state.fish.push(
        createFish({
          species: group.species,
          age: group.age ?? 0,
          stage: group.stage ?? 'adult',
          sex: group.sex,
          rng,
        })
      );
    }
  }

  for (const group of seed.plants ?? []) {
    for (let i = 0; i < (group.count ?? 1); i++) {
      state.plants.push(createPlant({ species: group.species, size: group.size }));
    }
  }
}

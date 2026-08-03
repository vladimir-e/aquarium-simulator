/**
 * A seed sets initial stock values and nothing else: no new dynamics, no
 * gates, no catch-up. Whatever it writes, the tick loop takes from there.
 */

import type { Resources, SimulationState } from './state.js';
import type { FishLifeStage, FishSex, FishSpecies } from './livestock/species.js';
import type { PlantSpecies } from './plants/species.js';
import { createFish } from './livestock/create-fish.js';
import { createPlant } from './plants/create-plant.js';

const SEEDABLE_BACTERIA = ['aob', 'nob'] as const;

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
 * A colony as absolute stock, or `'cycled'` — the colony this tank's own
 * volume carries, resolved against its capacity when the seed is applied so
 * a preset resized at the door still gets a biofilter that fits it.
 */
export type SeedBacteria = 'cycled' | SeedColony;

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

/**
 * Nothing here is validated or clamped. A seed may describe a tank no
 * keeper could have reached — a colony with no ammonia history, a fish
 * past its `maxAge`, a plant in a substrate that would refuse it —
 * because constructing extreme states deliberately is what a scenario is
 * for, and rejecting them would defeat the surface.
 */
export interface PresetSeed {
  bacteria?: SeedBacteria;
  resources?: SeedResources;
  fish?: SeedFishGroup[];
  plants?: SeedPlantGroup[];
}

/**
 * AOB units per litre a tank that cycled itself carries. A fishless soil
 * tank measured from 10 L to 1000 L rests at ~261 once cycled; rounding up
 * means a scenario that says "cycled" is never handed a weaker biofilter
 * than one that waited three weeks for it. Still ~2 % of the surface
 * ceiling, so the cap stays where it belongs — out of the way.
 */
const CYCLED_AOB_PER_LITER = 300;

/** NOB units per litre, off the same measurement (~181) and rounded the same way. */
const CYCLED_NOB_PER_LITER = 200;

/**
 * The colony a cycled tank of `capacity` litres carries.
 *
 * Per litre rather than per cm² of surface for the reason the inoculum is:
 * a colony is sized by its ammonia supply, which scales with the water,
 * while surface is only a ceiling.
 */
export function cycledColony(capacity: number): SeedColony {
  return {
    aob: capacity * CYCLED_AOB_PER_LITER,
    nob: capacity * CYCLED_NOB_PER_LITER,
  };
}

function writeStocks<K extends keyof Resources>(
  resources: Resources,
  keys: readonly K[],
  values: Partial<Pick<Resources, K>> | undefined
): void {
  if (values === undefined) return;
  for (const key of keys) {
    const value = values[key];
    if (value !== undefined) resources[key] = value;
  }
}

export function applySeed(
  state: SimulationState,
  seed: PresetSeed,
  rng: () => number = Math.random
): void {
  const bacteria = seed.bacteria === 'cycled' ? cycledColony(state.tank.capacity) : seed.bacteria;

  writeStocks(state.resources, SEEDABLE_BACTERIA, bacteria);
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

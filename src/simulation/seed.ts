/**
 * A seed sets initial stock values and nothing else: no new dynamics, no
 * gates, no catch-up. Whatever it writes, the tick loop takes from there.
 */

import type { Resources, SimulationState } from './state.js';
import type { FishLifeStage, FishSex, FishSpecies } from './livestock/species.js';
import type { PlantSpecies } from './plants/species.js';
import {
  getSubstrateKhReserve,
  getSubstrateOrganicReserve,
  type Substrate,
  type SubstrateType,
} from './equipment/substrate.js';
import { nitrogenCycleDefaults } from './config/nitrogen-cycle.js';
import { plantsDefaults } from './config/plants.js';
import { NH3_TO_NO2_MASS_RATIO, NO2_TO_NO3_MASS_RATIO } from './core/chemistry.js';
import { getGhMass, getKhMass } from './resources/helpers.js';
import { createFish } from './livestock/create-fish.js';
import { createPlant } from './plants/create-plant.js';

const SEEDABLE_BACTERIA = ['aob', 'nob'] as const;

const SEEDABLE_SUBSTRATE = ['organicReserve', 'khReserve'] as const;

const SEEDABLE_RESOURCES = [
  'ammonia',
  'nitrite',
  'nitrate',
  'phosphate',
  'potassium',
  'iron',
  'oxygen',
  'co2',
  'kh',
  'gh',
] as const;

export type SeedColony = Partial<Pick<Resources, (typeof SEEDABLE_BACTERIA)[number]>>;

/**
 * A colony as absolute stock, or `'cycled'` — a tank that has been running a
 * month, which is a claim about the whole tank and not only its biofilter: it
 * carries the bed that month left, the nitrate that month made and the
 * hardness the bed let it keep, as well as the colony. Every one of them is
 * resolved against the tank when the seed is applied, so a preset resized or
 * rebuilt at the door still gets a filter, a bed and readings that fit it.
 * Hardscape starts as bought.
 */
export type SeedBacteria = 'cycled' | SeedColony;

/** The bed's stocks. Its *type* is configuration, not state — see `SimulationConfig`. */
export type SeedSubstrate = Partial<Pick<Substrate, (typeof SEEDABLE_SUBSTRATE)[number]>>;

/**
 * Chemistry stocks a seed may set, in the units `Resources` stores them
 * in: nitrogen compounds and nutrients as mass in mg (`getMassFromPpm`
 * converts from a test-kit reading), both hardnesses as mg of CaCO3
 * (`getKhMass` and `getGhMass` convert from degrees), dissolved gases as mg/L.
 */
export type SeedResources = Partial<Pick<Resources, (typeof SEEDABLE_RESOURCES)[number]>>;

export interface SeedFishGroup {
  species: FishSpecies;
  /** Defaults to 1. */
  count?: number;
  /**
   * Age in ticks. Defaults to the age its stage starts at — `maturityAge`
   * for an adult, 0 for a fry — so a roster that names no age means grown
   * fish. Only an age the author wrote stands as written.
   */
  age?: number;
  sex?: FishSex;
  /**
   * Defaults to `adult`. Independent of `age`, so both a months-old
   * juvenile and an adult too young to breed are expressible.
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
 * The stocks a tank starts at, as distinct from what lives in it. The state
 * keeps it, so an hour-zero tank can be filled again the way it was first.
 */
export interface TankSeed {
  bacteria?: SeedBacteria;
  substrate?: SeedSubstrate;
  resources?: SeedResources;
}

/** Nothing here is validated or clamped — see the docs portal, State & persistence § Starting state. */
export interface PresetSeed extends TankSeed {
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

/**
 * Share of a fresh aqua soil bed's KH reserve left on day 30 under weekly 25 %
 * changes — read off a fresh high-tech soil tank on that keeper, rounded.
 */
const CYCLED_SOIL_KH_RESERVE_FRACTION = 0.8;

/** mg of CaCO3 a bed of this type and capacity can still take up once cycled. */
export function cycledKhReserve(type: SubstrateType, capacity: number): number {
  return getSubstrateKhReserve(type, capacity) * CYCLED_SOIL_KH_RESERVE_FRACTION;
}

/**
 * mg of nitrate a gram of the bed's organics ends up as, once mineralised to
 * ammonia and oxidised the two steps to nitrate — each one keeping the
 * nitrogen and picking up the mass of the oxygen it gains.
 */
const NITRATE_PER_GRAM_LEACHED =
  nitrogenCycleDefaults.wasteToAmmoniaRatio * NH3_TO_NO2_MASS_RATIO * NO2_TO_NO3_MASS_RATIO;

/**
 * Share of that nitrate still in the water. Nothing in a fishless tank
 * consumes nitrate, so a month of leaching left alone reads 9.7 ppm over aqua
 * soil — but a keeper changes water: the same month measures 0.37 of it under
 * a weekly 30 % change and 0.17 under a weekly 50 %. A quarter sits between
 * them, rounded to the low side because nitrate is a stressor and the tank a
 * keeper hands over has just been changed, not left to load.
 */
const CYCLED_NITRATE_RETAINED = 0.25;

/** mg of nitrate a cycled tank of this bed and capacity carries. */
export function cycledNitrate(type: SubstrateType, capacity: number): number {
  const leached = getSubstrateOrganicReserve(type, capacity) - cycledReserve(type, capacity);
  return leached * NITRATE_PER_GRAM_LEACHED * CYCLED_NITRATE_RETAINED;
}

/**
 * Share of the tap's KH an aqua soil tank still holds after a month of weekly
 * 25 % changes: the bed strips each change back down before the next, and the
 * week averages out near 0.15 of the tap. Inert beds keep the tap's KH.
 */
const CYCLED_SOIL_KH_RETAINED = 0.15;

/**
 * mg of CaCO3 of KH and GH a cycled tank of this bed, tap and capacity carries.
 * The bed takes both out in equal measure and stops when either runs dry, so
 * soft tap water caps what it takes at the tap's GH.
 */
export function cycledHardness(
  type: SubstrateType,
  tapKh: number,
  tapGh: number,
  capacity: number
): { kh: number; gh: number } {
  const taken =
    type === 'aqua_soil' ? Math.min(tapKh * (1 - CYCLED_SOIL_KH_RETAINED), tapGh) : 0;
  return {
    kh: getKhMass(tapKh - taken, capacity),
    gh: getGhMass(tapGh - taken, capacity),
  };
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

/** The hardness an hour-zero tank carries, filled from its tap and seeded as the state records. */
export function startingHardness(state: SimulationState): { kh: number; gh: number } {
  const { capacity } = state.tank;
  const { type } = state.equipment.substrate;
  const { tapKh, tapGh } = state.environment;
  const { seed } = state;
  const filled =
    seed?.bacteria === 'cycled'
      ? cycledHardness(type, tapKh, tapGh, capacity)
      : { kh: getKhMass(tapKh, capacity), gh: getGhMass(tapGh, capacity) };

  return {
    kh: seed?.resources?.kh ?? filled.kh,
    gh: seed?.resources?.gh ?? filled.gh,
  };
}

function seedTank(state: SimulationState, seed: TankSeed): void {
  const { capacity } = state.tank;
  const { type } = state.equipment.substrate;
  state.seed = seed;

  if (seed.bacteria === 'cycled') {
    writeStocks(state.resources, SEEDABLE_BACTERIA, cycledColony(capacity));
    writeStocks(state.equipment.substrate, SEEDABLE_SUBSTRATE, {
      organicReserve: cycledReserve(type, capacity),
      khReserve: cycledKhReserve(type, capacity),
    });
    state.resources.nitrate = cycledNitrate(type, capacity);
  } else {
    writeStocks(state.resources, SEEDABLE_BACTERIA, seed.bacteria);
  }

  writeStocks(state.equipment.substrate, SEEDABLE_SUBSTRATE, seed.substrate);
  writeStocks(state.resources, SEEDABLE_RESOURCES, seed.resources);
  Object.assign(state.resources, startingHardness(state));
}

export function applySeed(state: SimulationState, seed: PresetSeed): void {
  const { fish, plants, ...tank } = seed;
  seedTank(state, tank);

  for (const group of fish ?? []) {
    for (let i = 0; i < (group.count ?? 1); i++) {
      state.fish.push(
        createFish({
          species: group.species,
          age: group.age,
          stage: group.stage ?? 'adult',
          sex: group.sex,
          rng: state.rng,
        })
      );
    }
  }

  for (const group of plants ?? []) {
    for (let i = 0; i < (group.count ?? 1); i++) {
      state.plants.push(
        createPlant({
          species: group.species,
          size: group.size,
          // Tunables bind to the tick, not to `createSimulation` — a seeded
          // tank is built before there is a live config to read.
          plantsConfig: plantsDefaults,
          rng: state.rng,
        })
      );
    }
  }
}

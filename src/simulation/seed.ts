/**
 * A seed sets initial stock values and nothing else: no new dynamics, no
 * gates, no catch-up. Whatever it writes, the tick loop takes from there.
 */

import type { Resources, SimulationState } from './state.js';
import type { FishSex, FishSpecies } from './livestock/species.js';
import type { PlantSpecies } from './plants/species.js';
import {
  calculateSubstrateLeach,
  getSubstrateKhReserve,
  getSubstrateNutrients,
  getSubstrateOrganicReserve,
  type Substrate,
  type SubstrateType,
} from './equipment/substrate.js';
import { nitrogenCycleDefaults } from './config/nitrogen-cycle.js';
import { calculateMaxBacteria, restingColony } from './systems/nitrogen-cycle.js';
import { excretion, metabolicFactorOf } from './systems/metabolism.js';
import { dailyMaintenance } from './systems/digestion.js';
import { ammoniaPerGramOfFood, livestockDefaults } from './config/livestock.js';
import { decayDefaults } from './config/decay.js';
import { mapNutrients, nutrientsDefaults, type NutrientVector } from './config/nutrients.js';
import { organicNutrients } from './systems/nutrients.js';
import { alkalinityMoved, MW_NO3, NH3_TO_NO2_MASS_RATIO, PROTONS_PER_N } from './core/chemistry.js';
import { getGhMass, getKhMass } from './resources/helpers.js';
import { KhResource } from './resources/kh.js';
import { createFish, STOCKED_FISH_SIZE } from './livestock/create-fish.js';
import { createPlant } from './plants/create-plant.js';

const SEEDABLE_BACTERIA = ['aob', 'nob'] as const;

const SEEDABLE_SUBSTRATE = ['organicReserve', 'khReserve', 'nutrients'] as const;

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
  /** % of adult mass, as stocking takes it. Defaults to grown. */
  size?: number;
  /** Ticks already lived, as `Fish.age`. Defaults to 0. */
  age?: number;
  sex?: FishSex;
}

export interface SeedPlantGroup {
  species: PlantSpecies;
  /** Defaults to 1. */
  count?: number;
  /** % of one full unit, as `Plant.size`: `MIN_PLANTABLE_SIZE` to 100 (`isPlantableSize`). */
  size?: number;
  /** Ticks it has already stood in the tank, as `Plant.age`. Defaults to 0. */
  age?: number;
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
 * The least share of its surface ceiling a cycled colony covers, read off
 * fishless soil tanks on day 30 and rounded up, so a scenario that says
 * "cycled" is never handed a weaker biofilter than one that waited for it.
 */
const CYCLED_AOB_COVERAGE = 0.02;
const CYCLED_NOB_COVERAGE = 0.01;

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

type StockedTank = Pick<SimulationState, 'fish' | 'resources' | 'equipment'>;

/**
 * mg of ammonia a tick the tank's stock and bed put into the water at rest:
 * every fish digesting its maintenance ration in the water it is in, building
 * none of it into its body, and the bed leaching what it holds. All the waste
 * either one makes is mineralised in the end, whether or not it settles on the
 * way. Food fed past maintenance is left out — the engine has no ration to
 * size it by — so under a keeper who feeds more the colony errs small and
 * grows on from the seed.
 */
function restingAmmoniaSupply(state: StockedTank): number {
  const factor = metabolicFactorOf(state.resources, livestockDefaults);
  const digested = dailyMaintenance(state.fish, factor, livestockDefaults) / 24;
  const { ammonia, waste } = excretion(digested, 0, livestockDefaults);
  const leached = calculateSubstrateLeach(state.equipment.substrate.organicReserve, decayDefaults);
  return ammonia + (waste + leached) * ammoniaPerGramOfFood(livestockDefaults);
}

/**
 * The colony a cycled tank carries: grown into the load its stock and bed put
 * on it at rest, and never less than a month-old fishless colony's share of
 * the surface ceiling the filter and the bed give it.
 */
export function cycledColony(state: StockedTank): { aob: number; nob: number } {
  const { surface, temperature } = state.resources;
  const ceiling = calculateMaxBacteria(surface, nitrogenCycleDefaults);
  const ammonia = restingAmmoniaSupply(state);
  const resting = (stage: 'aob' | 'nob', supply: number): number =>
    restingColony(stage, supply, temperature, ceiling, nitrogenCycleDefaults);
  return {
    aob: Math.max(ceiling * CYCLED_AOB_COVERAGE, resting('aob', ammonia)),
    nob: Math.max(ceiling * CYCLED_NOB_COVERAGE, resting('nob', ammonia * NH3_TO_NO2_MASS_RATIO)),
  };
}

/** Grams a bed of this type and capacity still holds once cycled. */
export function cycledReserve(type: SubstrateType, capacity: number): number {
  return getSubstrateOrganicReserve(type, capacity) * CYCLED_RESERVE_FRACTION;
}

/**
 * Share of a fresh bed's nutrient store still in it on day 30: a plantless
 * month of the leak leaves 0.866, rounded down so a scenario that says
 * "cycled" is never handed a richer bed than one that waited.
 */
const CYCLED_BED_NUTRIENT_FRACTION = 0.85;

/** mg of each nutrient a bed of this type and capacity still holds once cycled. */
export function cycledBedNutrients(type: SubstrateType, capacity: number): NutrientVector {
  const fresh = getSubstrateNutrients(type, capacity);
  return mapNutrients((n) => fresh[n] * CYCLED_BED_NUTRIENT_FRACTION);
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
 * Share of what a cycled bed released that is still in the water. Nothing in
 * a plantless, fishless tank consumes nitrate, phosphate, potassium or iron,
 * so a month of release left alone puts 17.5 ppm of nitrate in the water over
 * aqua soil — 10 from the leached organics, 7.5 from the store's leak — but a
 * keeper changes water: a fresh soil tank's month keeps 0.28–0.32 of each
 * nutrient under a weekly 30 % change and 0.15–0.19 under a weekly 50 %. A
 * quarter sits between them, rounded to the low side because nitrate is a
 * stressor and the tank a keeper hands over has just been changed, not left
 * to load.
 */
const CYCLED_WATER_RETAINED = 0.25;

/** mg of each nutrient the organics a cycled bed leached left in the water, rotted at the recipe. */
function cycledRot(type: SubstrateType, capacity: number): NutrientVector {
  const leached = getSubstrateOrganicReserve(type, capacity) - cycledReserve(type, capacity);
  const recipe = organicNutrients(livestockDefaults, nutrientsDefaults);
  return mapNutrients((n) => leached * recipe[n] * CYCLED_WATER_RETAINED);
}

/**
 * mg of each nutrient a cycled tank of this bed and capacity carries: the
 * organics its bed leached and what its nutrient store leaked, at the share
 * the keeper's changes left.
 */
export function cycledWaterNutrients(type: SubstrateType, capacity: number): NutrientVector {
  const rot = cycledRot(type, capacity);
  const fresh = getSubstrateNutrients(type, capacity);
  const kept = cycledBedNutrients(type, capacity);
  return mapNutrients((n) => rot[n] + (fresh[n] - kept[n]) * CYCLED_WATER_RETAINED);
}

/**
 * Share of the tap's KH an aqua soil tank still holds after a month of weekly
 * 25 % changes: the bed strips each change back down before the next, and the
 * week averages out near 0.15 of the tap. Inert beds take none.
 */
const CYCLED_SOIL_KH_RETAINED = 0.15;

/**
 * mg of CaCO3 of KH and GH a cycled tank of this bed, tap and capacity carries.
 * The bed takes both out in equal measure and stops when either runs dry, so
 * soft tap water caps what it takes at the tap's GH. KH alone also pays for
 * the nitrate the leached organics left, minted and nitrified.
 */
export function cycledHardness(
  type: SubstrateType,
  tapKh: number,
  tapGh: number,
  capacity: number
): { kh: number; gh: number } {
  const taken =
    type === 'aqua_soil' ? Math.min(tapKh * (1 - CYCLED_SOIL_KH_RETAINED), tapGh) : 0;
  const rotNitrogen = cycledRot(type, capacity).nitrate / MW_NO3;
  const nitrified = alkalinityMoved(rotNitrogen, PROTONS_PER_N.mint + PROTONS_PER_N.nitrify);
  return {
    kh: Math.max(KhResource.bounds.min, getKhMass(tapKh - taken, capacity) + nitrified),
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
    writeStocks(state.equipment.substrate, SEEDABLE_SUBSTRATE, {
      organicReserve: cycledReserve(type, capacity),
      khReserve: cycledKhReserve(type, capacity),
      nutrients: cycledBedNutrients(type, capacity),
    });
    Object.assign(state.resources, cycledWaterNutrients(type, capacity));
  }

  writeStocks(state.equipment.substrate, SEEDABLE_SUBSTRATE, seed.substrate);
  writeStocks(state.resources, SEEDABLE_RESOURCES, seed.resources);
  Object.assign(state.resources, startingHardness(state));
  writeStocks(
    state.resources,
    SEEDABLE_BACTERIA,
    seed.bacteria === 'cycled' ? cycledColony(state) : seed.bacteria
  );
}

export function applySeed(state: SimulationState, seed: PresetSeed): void {
  const { fish, plants, ...tank } = seed;

  for (const group of fish ?? []) {
    for (let i = 0; i < (group.count ?? 1); i++) {
      state.fish.push(
        createFish({
          species: group.species,
          size: group.size ?? STOCKED_FISH_SIZE,
          age: group.age,
          sex: group.sex,
          rng: state.rng,
          config: livestockDefaults,
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
          age: group.age,
          rng: state.rng,
        })
      );
    }
  }

  seedTank(state, tank);
}

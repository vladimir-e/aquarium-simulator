/**
 * What a fish's energy budget reads as: its weight, its size against its
 * species' grown length, the organics it holds and what they are made of, and
 * its life stage.
 */

import type { Fish } from '../state.js';
import type { FishLifeStage, FishSpecies } from '../livestock/species.js';
import { debParams } from '../livestock/species.js';
import {
  MG_PER_G,
  MW_PO4,
  MW_RESERVE,
  N_TO_NO3_MASS_RATIO,
  RESERVE_TO_C_MASS_RATIO,
  RESERVE_TO_N_MASS_RATIO,
} from '../core/chemistry.js';
import type { Organics, RecipeConfig } from '../core/organics.js';
import { hatchling, mature, organics, size, wetMass, type DebParams } from './deb.js';

type Body = Pick<Fish, 'species' | 'budget'>;

export const fishParams = (fish: Pick<Fish, 'species'>): Readonly<DebParams> => debParams(fish.species);

export const fishMass = (fish: Body): number => wetMass(fish.budget, fishParams(fish));

/** Structural length in % of what its species reaches grown. */
export const fishSize = (fish: Body): number => size(fish.budget, fishParams(fish));

/** Grams of organic matter its body holds: structure, reserve and brood buffer. */
export const fishOrganics = (fish: Body): number => organics(fish.budget, fishParams(fish));

/**
 * Moles of phosphorus a C-mole of reserve carries: N:P 15, soft tissue's. A
 * whole fish runs 2.5–3 % P dry, most of it in a skeleton the reserve does not
 * build.
 */
const RESERVE_P_PER_C = 0.01;

/**
 * What a gram of a fish, its eggs and its brood is made of, one composition
 * for every species: its reserve's carbon, nitrogen and phosphorus, and food's
 * potassium and iron.
 */
export function fishComposition({ nutrients }: Pick<RecipeConfig, 'nutrients'>): Organics {
  return {
    grams: 1,
    carbon: RESERVE_TO_C_MASS_RATIO,
    nutrients: {
      nitrate: RESERVE_TO_N_MASS_RATIO * N_TO_NO3_MASS_RATIO * MG_PER_G,
      phosphate: (RESERVE_P_PER_C * MW_PO4 * MG_PER_G) / MW_RESERVE,
      potassium: nutrients.foodMineralContent.potassium,
      iron: nutrients.foodMineralContent.iron,
    },
  };
}

/** Grams of organic matter an egg is laid with: E_0. */
export const eggOrganics = (species: FishSpecies): number => debParams(species).E0;

/** Grams an egg weighs: its hatchling's. */
export function eggMass(species: FishSpecies): number {
  const p = debParams(species);
  return wetMass(hatchling(p), p);
}

/** The size a fry hatches at. */
export function frySize(species: FishSpecies): number {
  const p = debParams(species);
  return size(hatchling(p), p);
}

/** The size, in % of grown length, under which a fish short of puberty reads as fry. */
export const FRY_UNTIL_SIZE = 50;

export function fishLifeStage(fish: Body): FishLifeStage {
  const p = fishParams(fish);
  if (mature(fish.budget, p)) return 'adult';
  return size(fish.budget, p) < FRY_UNTIL_SIZE ? 'fry' : 'juvenile';
}

export function countFry(fish: readonly Body[]): number {
  return fish.filter((f) => fishLifeStage(f) === 'fry').length;
}

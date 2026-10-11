/**
 * What a fish's energy budget reads as: its weight, its size against its
 * species' grown length, the organics it holds and what they are made of, and
 * its life stage.
 */

import type { Fish } from '../state.js';
import type { FishLifeStage, FishSpecies } from '../livestock/species.js';
import { debParams } from '../livestock/species.js';
import { RESERVE_TO_C_MASS_RATIO } from '../core/chemistry.js';
import { foodRecipe, type Composition, type RecipeConfig } from '../core/organics.js';
import { hatchling, mature, organics, size, wetMass, type DebParams } from './deb.js';

type Body = Pick<Fish, 'species' | 'budget'>;

export const fishParams = (fish: Pick<Fish, 'species'>): Readonly<DebParams> => debParams(fish.species);

export const fishMass = (fish: Body): number => wetMass(fish.budget, fishParams(fish));

/** Structural length in % of what its species reaches grown. */
export const fishSize = (fish: Body): number => size(fish.budget, fishParams(fish));

/** Grams of organic matter its body holds: structure, reserve and brood buffer. */
export const fishOrganics = (fish: Body): number => organics(fish.budget, fishParams(fish));

/** What a gram of a fish, its eggs and its brood is made of: the carbon of its reserve, and the nutrients of the food it ate. */
export function fishComposition(config: RecipeConfig): Composition {
  return { carbon: RESERVE_TO_C_MASS_RATIO, nutrients: foodRecipe(config).nutrients };
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

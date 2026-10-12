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
  N_TO_NO3_MASS_RATIO,
  P_TO_PO4_MASS_RATIO,
  RESERVE_TO_C_MASS_RATIO,
  RESERVE_TO_N_MASS_RATIO,
  RESERVE_TO_P_MASS_RATIO,
} from '../core/chemistry.js';
import type { Organics } from '../core/organics.js';
import { hatchling, mature, organics, size, wetMass, type DebParams } from './deb.js';

type Body = Pick<Fish, 'species' | 'budget'>;

export const fishParams = (fish: Pick<Fish, 'species'>): Readonly<DebParams> => debParams(fish.species);

export const fishMass = (fish: Body): number => wetMass(fish.budget, fishParams(fish));

/** Structural length in % of what its species reaches grown. */
export const fishSize = (fish: Body): number => size(fish.budget, fishParams(fish));

/** Grams of organic matter its body holds: structure, reserve and brood buffer. */
export const fishOrganics = (fish: Body): number => organics(fish.budget, fishParams(fish));

/**
 * What a gram of a fish, its eggs and its brood is made of, one composition
 * for every species: its reserve's carbon, nitrogen and phosphorus, and its
 * potassium and iron carried along at the default flake's ratio — a whole fish
 * runs higher in K, but that isn't what limits a fed fish.
 */
export const FISH_COMPOSITION: Organics = {
  grams: 1,
  carbon: RESERVE_TO_C_MASS_RATIO,
  nutrients: {
    nitrate: RESERVE_TO_N_MASS_RATIO * N_TO_NO3_MASS_RATIO * MG_PER_G,
    phosphate: RESERVE_TO_P_MASS_RATIO * P_TO_PO4_MASS_RATIO * MG_PER_G,
    potassium: 8,
    iron: 0.2,
  },
};

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

/**
 * Fish growth and broods — the bank buys mass, and a full bank buys a brood.
 *
 * A fish's size is its mass in % of its species' adult mass, and it splits
 * the bank: `size / 100` of it is the brood share, the rest goes to growth.
 * Every hour the bank draws `1 − e^−growthDrawRate` of itself toward growth
 * through the growth share, so a fry spends nearly all of its draw on mass and
 * a fish near adult size almost none, and size approaches 100 without a clamp.
 * What growth leaves banks; a female whose bank is full lays the eggs her
 * brood share buys, and the males of her species pay their share of them from
 * their own brood shares.
 */

import type { Clutch, Fish } from '../state.js';
import type { FishLifeStage, FishSpecies } from '../livestock/species.js';
import { FISH_SPECIES_DATA } from '../livestock/species.js';
import type { LivestockConfig } from '../config/livestock.js';
import { bankFull } from './vitality.js';
import { hourlyDraw } from '../core/kinetics.js';

/** The size past which a fish reads as an adult: where its brood share passes its growth share. */
export const ADULT_SIZE = 50;

type Sized = Pick<Fish, 'species' | 'mass'>;

export function fishSize(fish: Sized): number {
  return (100 * fish.mass) / FISH_SPECIES_DATA[fish.species].adultMass;
}

export function massAtSize(species: FishSpecies, size: number): number {
  return (size / 100) * FISH_SPECIES_DATA[species].adultMass;
}

/** The size a fry is born or hatches at. */
export function frySize(species: FishSpecies): number {
  return 100 * FISH_SPECIES_DATA[species].breeding.fryMassFraction;
}

export function fishLifeStage(fish: Sized): FishLifeStage {
  return fishSize(fish) < ADULT_SIZE ? 'fry' : 'adult';
}

/** Share of the bank a fish of this size holds toward broods; the rest it spends on growth. */
export function broodShare(size: number): number {
  return Math.min(1, Math.max(0, size / 100));
}

/** The hour's growth: the bank's draw through the growth share, bought as mass. */
export function growFish(fish: Fish, config: LivestockConfig): Fish {
  const drawn =
    Math.max(0, fish.surplus) * hourlyDraw(config.growthDrawRate) * (1 - broodShare(fishSize(fish)));
  if (drawn <= 0) return fish;

  const { growthRate } = FISH_SPECIES_DATA[fish.species];
  return {
    ...fish,
    mass: fish.mass + massAtSize(fish.species, drawn * growthRate * config.sizePerSurplus),
    surplus: fish.surplus - drawn,
  };
}

/** Offspring one bank point buys this parent: `broodCost` buys a brood of its own weight. */
function offspringPerPoint(fish: Fish, config: LivestockConfig): number {
  const fryMass = massAtSize(fish.species, frySize(fish.species));
  return fish.mass / (config.broodCost * fryMass);
}

/** The bank a fish's brood share holds. */
function broodBank(fish: Fish): number {
  return broodShare(fishSize(fish)) * Math.max(0, fish.surplus);
}

/** Eggs the brood share of a female's bank buys. */
export function eggsLaid(female: Fish, config: LivestockConfig): number {
  return broodBank(female) * offspringPerPoint(female, config);
}

/** Offspring the brood share of a male's bank can father, at his species' share of the cost. */
export function offspringFathered(male: Fish, config: LivestockConfig): number {
  return (
    (broodBank(male) * offspringPerPoint(male, config)) /
    FISH_SPECIES_DATA[male.species].breeding.maleShare
  );
}

/** Whether a female broods this hour: she carries no brood, and her full bank buys at least one whole egg. */
export function readyToBrood(fish: Fish, clutches: readonly Clutch[], config: LivestockConfig): boolean {
  return (
    fish.sex === 'female' &&
    !clutches.some((clutch) => clutch.motherId === fish.id) &&
    bankFull(fish.surplus, config.surplusCap) &&
    Math.floor(eggsLaid(fish, config)) >= 1
  );
}

/** Whether a male has a brood bank to pay his share of a brood from. */
export function paysTowardBrood(male: Fish): boolean {
  return male.sex === 'male' && broodBank(male) > 0;
}

export interface Brood {
  offspring: number[];
  females: Fish[];
  males: Fish[];
}

const sum = (values: readonly number[]): number => values.reduce((total, n) => total + n, 0);

/**
 * Whole offspring for each female: `fathered` shared in proportion to her
 * eggs, the floors topped up by largest remainder, ties broken by id.
 */
function apportion(females: readonly Fish[], eggs: readonly number[], fathered: number): number[] {
  const laid = sum(eggs);
  const quotas = eggs.map((n) => (laid > 0 ? (n * fathered) / laid : 0));
  const shares = quotas.map(Math.floor);
  const remainder = (i: number): number => quotas[i] - shares[i];
  const order = females
    .map((_, i) => i)
    .sort((a, b) => remainder(b) - remainder(a) || females[a].id.localeCompare(females[b].id));
  for (const i of order.slice(0, Math.max(0, Math.floor(fathered) - sum(shares)))) shares[i]++;
  return shares;
}

/**
 * The ready females of one species brood together. Each lays the whole eggs
 * her brood share buys and pays for exactly those; the males father as many
 * as their brood shares pay for between them, shared back to each female in
 * proportion to her eggs, each male paying the same share of what his could.
 * Eggs nobody fathers are lost with what she paid for them.
 */
export function brood(females: readonly Fish[], males: readonly Fish[], config: LivestockConfig): Brood {
  const eggs = females.map((female) => Math.floor(eggsLaid(female, config)));
  const fathering = sum(males.map((male) => offspringFathered(male, config)));
  const offspring = apportion(females, eggs, Math.min(sum(eggs), fathering));
  const paid = fathering > 0 ? sum(offspring) / fathering : 0;

  return {
    offspring,
    females: females.map((female, i) => ({
      ...female,
      surplus: female.surplus - Math.min(broodBank(female), eggs[i] / offspringPerPoint(female, config)),
    })),
    males: males.map((male) => ({ ...male, surplus: male.surplus - paid * broodBank(male) })),
  };
}

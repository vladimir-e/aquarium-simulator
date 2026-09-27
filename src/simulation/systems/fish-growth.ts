/**
 * Fish growth and broods — the bank buys mass, and a full bank buys a brood.
 *
 * A fish's size is its mass in % of its species' adult mass, and it splits
 * the bank: `size / 100` of it is the brood share, the rest goes to growth.
 * Every hour the bank draws `1 − e^−growthDrawRate` of itself toward growth
 * through the growth share, so a fry spends nearly all of its draw on mass and
 * a fish near adult size almost none, and size approaches 100 without a clamp.
 * What growth leaves banks; a female whose bank is full lays the brood its
 * brood share buys, and the males of her species pay their share of it from
 * their own brood shares.
 */

import type { Fish } from '../state.js';
import type { FishLifeStage, FishSpecies } from '../livestock/species.js';
import { FISH_SPECIES_DATA } from '../livestock/species.js';
import type { LivestockConfig } from '../config/livestock.js';
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
  return size / 100;
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

/** Eggs the brood share of a female's bank lays. */
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

/** Whether a fish's bank is full, the moment it buys a brood. Never at a cap of 0, where every bank reads full. */
export function bankFull(fish: Fish, config: LivestockConfig): boolean {
  return config.surplusCap > 0 && fish.surplus >= config.surplusCap;
}

export interface Brood {
  offspring: number;
  female: Fish;
  males: Fish[];
}

/**
 * A female spends her brood share on eggs; the males father as many as their
 * brood shares pay for between them, each paying the same share of what his
 * could, and eggs nobody fathers are lost.
 */
export function brood(female: Fish, males: readonly Fish[], config: LivestockConfig): Brood {
  const reach = males.map((male) => offspringFathered(male, config));
  const fathering = reach.reduce((sum, n) => sum + n, 0);
  const offspring = Math.floor(Math.min(eggsLaid(female, config), fathering));
  const paid = fathering > 0 ? offspring / fathering : 0;

  return {
    offspring,
    female: { ...female, surplus: female.surplus - broodBank(female) },
    males: males.map((male) => ({ ...male, surplus: male.surplus - paid * broodBank(male) })),
  };
}

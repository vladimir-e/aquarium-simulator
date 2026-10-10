/**
 * Broods from the brood buffer. A female spawns once a whole egg is ready, a
 * livebearer only while she carries no brood; she draws every egg her buffer
 * readies. The males of her species father up to what their own buffers pay
 * at their species' share of an egg's cost; fathered eggs become her clutch,
 * the rest she resorbs, and resorbed eggs and every overhead are burned.
 */

import type { Clutch, Fish } from '../state.js';
import { FISH_SPECIES_DATA } from '../livestock/species.js';
import { sum } from '../core/sum.js';
import { drawBroodBuffer, eggsReady, layEggs, type DebState } from './deb.js';
import { fishParams } from './fish-body.js';

type Parent = Pick<Fish, 'id' | 'species' | 'sex' | 'deb'>;

/** Whether a female spawns this hour: a whole egg ready, and no brood of hers carried. */
export function readyToBrood(fish: Parent, clutches: readonly Pick<Clutch, 'motherId'>[]): boolean {
  return (
    fish.sex === 'female' &&
    eggsReady(fish.deb, fishParams(fish)) >= 1 &&
    !clutches.some((clutch) => clutch.motherId === fish.id)
  );
}

/** Grams of brood buffer a male pays for each egg he fathers. */
function fatheringCost(male: Pick<Fish, 'species'>): number {
  const p = fishParams(male);
  return (FISH_SPECIES_DATA[male.species].breeding.maleShare * p.E0) / p.kappaR;
}

/** Eggs a male's buffer can father. */
export function offspringFathered(male: Pick<Fish, 'species' | 'deb'>): number {
  return male.deb.broodBuffer / fatheringCost(male);
}

/** Whether a male has a buffer to pay his share of a brood from. */
export function paysTowardBrood(male: Pick<Fish, 'sex' | 'species' | 'deb'>): boolean {
  return male.sex === 'male' && offspringFathered(male) > 0;
}

export interface Brood {
  /** Fathered eggs each female lays as a clutch. */
  offspring: number[];
  females: DebState[];
  males: DebState[];
  /** Grams the brood burned: the females' overhead and resorbed eggs, and what the males paid. */
  burned: number;
}

/**
 * Whole offspring for each female: `fathered` shared in proportion to her
 * eggs, the floors topped up by largest remainder, ties broken by id.
 */
function apportion(females: readonly Parent[], eggs: readonly number[], fathered: number): number[] {
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
 * The ready females of one species spawn together. Each draws every egg her
 * buffer readies; the males father as many as their buffers pay for between
 * them, shared back to each female in proportion to her eggs, each male paying
 * the same share of what his could.
 */
export function brood(females: readonly Parent[], males: readonly Parent[]): Brood {
  const spawns = females.map((female) => {
    const p = fishParams(female);
    return layEggs(female.deb, p, eggsReady(female.deb, p));
  });
  const eggs = spawns.map((spawn) => spawn.eggs);
  const fathering = sum(males.map(offspringFathered));
  const offspring = apportion(females, eggs, Math.min(sum(eggs), fathering));
  const paidShare = fathering > 0 ? sum(offspring) / fathering : 0;
  const paid = males.map((male) => drawBroodBuffer(male.deb, paidShare * male.deb.broodBuffer));
  const resorbed = spawns.map((spawn, i) => (spawn.eggs - offspring[i]) * fishParams(females[i]).E0);

  return {
    offspring,
    females: spawns.map((spawn) => spawn.state),
    males: paid.map((payment) => payment.state),
    burned:
      sum(spawns.map((spawn) => spawn.overhead)) + sum(resorbed) + sum(paid.map((payment) => payment.drawn)),
  };
}

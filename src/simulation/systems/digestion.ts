/**
 * The gut — a fish's one hunger stock. Food fills it, it digests first order
 * on the fish's metabolic factor — slower cold and short of oxygen — and what
 * it digests is the fish's income: its vitality earns on it and its waste
 * comes out of it. The ration it must digest to hold condition runs on the
 * same factor.
 *
 * What a gut holds, what a fish needs and what it breathes scale with its
 * metabolic mass, not its mass: per gram, each runs on mass to the −¼
 * against a grown fish of its species, so a fry eats, digests and burns
 * more for its size than its parents do.
 */

import type { Fish } from '../state.js';
import type { LivestockConfig } from '../config/livestock.js';
import { hourlyDraw, monodFactor } from '../core/kinetics.js';
import { sum } from '../core/sum.js';
import { FISH_SPECIES_DATA } from '../livestock/species.js';

type Sized = Pick<Fish, 'species' | 'mass'>;

/**
 * Grams of grown fish of its species whose metabolism matches this fish's:
 * per gram, a fish runs at its mass over its adult mass to `massScalingExponent`.
 */
export function metabolicMass(fish: Sized, config: LivestockConfig): number {
  const { adultMass } = FISH_SPECIES_DATA[fish.species];
  return adultMass * (fish.mass / adultMass) ** (1 + config.massScalingExponent);
}

/** A day's maintenance ration: what a fish arrives with in its gut, from the shop or its egg. */
export function arrivalGut(fish: Sized, config: LivestockConfig): number {
  return dailyMaintenance([fish], 1, config);
}

/** Grams of food a full gut holds. */
export function gutCapacity(fish: Sized, config: LivestockConfig): number {
  return metabolicMass(fish, config) * config.gutCapacity;
}

/** Grams it would eat this hour: the room left in its gut. */
export function appetite(fish: Sized & Pick<Fish, 'gut'>, config: LivestockConfig): number {
  return Math.max(0, gutCapacity(fish, config) - fish.gut);
}

export interface Shared {
  /** Grams each takes. */
  taken: number[];
  /** Grams no cap had room for. */
  overflow: number;
}

/** `amount` shared by weight; all of it overflows when nobody weighs in. */
export function shareOut(weights: readonly number[], amount: number): Shared {
  const total = sum(weights);
  if (amount <= 0 || total <= 0) return { taken: weights.map(() => 0), overflow: Math.max(0, amount) };
  return { taken: weights.map((w) => (w > 0 ? (amount * w) / total : 0)), overflow: 0 };
}

function capped(shares: readonly number[], caps: readonly number[]): Shared {
  const taken = shares.map((share, i) => Math.min(caps[i], share));
  return { taken, overflow: sum(shares.map((share, i) => share - taken[i])) };
}

/** `amount` shared by weight, each share capped by its pair in `caps`. */
export function shareCapped(weights: readonly number[], caps: readonly number[], amount: number): Shared {
  const shared = shareOut(weights, amount);
  const { taken, overflow } = capped(shared.taken, caps);
  return { taken, overflow: shared.overflow + overflow };
}

/** What each gut swallows of its share of prey, up to the room left in it, and the grams that overflow. */
export function swallow(
  eaters: readonly (Sized & Pick<Fish, 'gut'>)[],
  shares: readonly number[],
  config: LivestockConfig
): Shared {
  return capped(
    shares,
    eaters.map((eater) => appetite(eater, config))
  );
}

/** Grams a gut digests over the hour, its metabolism running at `factor`. */
export function digest(gut: number, factor: number, config: LivestockConfig): number {
  return Math.max(0, gut) * hourlyDraw(config.digestionRate * factor);
}

/** Grams a day a roster must digest to hold its condition, its metabolism running at `factor`. */
export function dailyMaintenance(fish: readonly Sized[], factor: number, config: LivestockConfig): number {
  return sum(fish.map((f) => metabolicMass(f, config))) * config.maintenanceRation * factor;
}

/** Grams an hour a fish must digest to hold its condition, its metabolism running at `factor`. */
export function maintenance(fish: Sized, factor: number, config: LivestockConfig): number {
  return dailyMaintenance([fish], factor, config) / 24;
}

/** Share of its benefits a fish earns on what it digested: half at its maintenance ration. */
export function nourishment(digested: number, need: number): number {
  return monodFactor(digested, need);
}

/**
 * Share of a full gut under which a fish digests less than its maintenance,
 * its metabolism running at `factor`, and hunger starts to harm it.
 */
export function hungerLine(factor: number, config: LivestockConfig): number {
  if (factor <= 0) return 0;
  return (config.maintenanceRation * factor) / 24 / digest(config.gutCapacity, factor, config);
}

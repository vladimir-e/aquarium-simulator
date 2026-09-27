/**
 * The gut — a fish's one hunger stock. Food fills it, it digests first order
 * on the fish's metabolic factor — slower cold and short of oxygen — and what
 * it digests is the fish's income: its vitality earns on it and its waste
 * comes out of it. The ration it must digest to hold condition runs on the
 * same factor.
 */

import type { Fish } from '../state.js';
import type { LivestockConfig } from '../config/livestock.js';
import { hourlyDraw, monodFactor } from '../core/kinetics.js';

type Sized = Pick<Fish, 'mass'>;

/** Grams of food a full gut holds. */
export function gutCapacity(fish: Sized, config: LivestockConfig): number {
  return fish.mass * config.gutCapacity;
}

/** Grams it would eat this hour: the room left in its gut. */
export function appetite(fish: Sized & Pick<Fish, 'gut'>, config: LivestockConfig): number {
  return Math.max(0, gutCapacity(fish, config) - fish.gut);
}

export interface Swallowed {
  /** Grams each eater takes. */
  taken: number[];
  /** Grams no gut had room for. */
  overflow: number;
}

/** Prey shared among its eaters by weight, each gut taking its share up to the room left in it. */
export function swallow(
  eaters: readonly (Sized & Pick<Fish, 'gut'>)[],
  weights: readonly number[],
  grams: number,
  config: LivestockConfig
): Swallowed {
  if (grams <= 0) return { taken: eaters.map(() => 0), overflow: 0 };
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return { taken: eaters.map(() => 0), overflow: grams };
  const shares = weights.map((w) => (grams * w) / total);
  const taken = eaters.map((eater, i) => Math.min(appetite(eater, config), shares[i]));
  return { taken, overflow: shares.reduce((sum, share, i) => sum + share - taken[i], 0) };
}

/**
 * Grams each eater takes: every appetite in full while the food lasts, and
 * the same share of every appetite once it does not.
 */
export function serve(appetites: readonly number[], food: number): number[] {
  const demand = appetites.reduce((sum, a) => sum + a, 0);
  const share = demand > 0 ? Math.min(1, Math.max(0, food) / demand) : 0;
  return appetites.map((a) => a * share);
}

/** Grams a gut digests over the hour, its metabolism running at `factor`. */
export function digest(gut: number, factor: number, config: LivestockConfig): number {
  return Math.max(0, gut) * hourlyDraw(config.digestionRate * factor);
}

/** Grams a day a roster must digest to hold its condition, its metabolism running at `factor`. */
export function dailyMaintenance(fish: readonly Sized[], factor: number, config: LivestockConfig): number {
  return fish.reduce((sum, f) => sum + f.mass, 0) * config.maintenanceRation * factor;
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
  const fish = { mass: 1 };
  return maintenance(fish, factor, config) / digest(gutCapacity(fish, config), factor, config);
}

/**
 * The gut — a fish's one hunger stock. Food fills it, it digests first order
 * at a rate slowed by cold and by low oxygen, and what it digests is the
 * fish's income: its vitality earns on it and its waste comes out of it.
 */

import type { Fish } from '../state.js';
import type { LivestockConfig } from '../config/livestock.js';
import { monodFactor, q10Factor } from '../core/kinetics.js';
import { hourlyDraw } from './vitality.js';

type Sized = Pick<Fish, 'mass'>;

/** Grams of food a full gut holds. */
export function gutCapacity(fish: Sized, config: LivestockConfig): number {
  return fish.mass * config.gutCapacity;
}

/** Grams it would eat this hour: the room left in its gut. */
export function appetite(fish: Sized & Pick<Fish, 'gut'>, config: LivestockConfig): number {
  return Math.max(0, gutCapacity(fish, config) - fish.gut);
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

/**
 * First-order rate a gut digests at, per hour: on its own Q10, and on the
 * oxygen factor the rest of the metabolism runs on.
 */
export function digestionRate(temperature: number, oxygen: number, config: LivestockConfig): number {
  return (
    config.digestionRate *
    q10Factor(temperature, config.digestionQ10, config.digestionReferenceTemp) *
    monodFactor(oxygen, config.respirationOxygenHalfSaturation)
  );
}

/** Grams a gut digests over the hour at `rate`. */
export function digest(gut: number, rate: number): number {
  return Math.max(0, gut) * hourlyDraw(rate);
}

/** Grams an hour a fish must digest to hold its condition. */
export function maintenance(fish: Sized, config: LivestockConfig): number {
  return (fish.mass * config.maintenanceRation) / 24;
}

/** Share of its benefits a fish earns on what it digested: half at its maintenance ration. */
export function nourishment(digested: number, need: number): number {
  return monodFactor(digested, need);
}

/**
 * Share of a full gut under which a fish digests less than its maintenance —
 * at the reference temperature, oxygen aside — and hunger starts to harm it.
 */
export function hungerLine(config: LivestockConfig): number {
  return config.maintenanceRation / 24 / (config.gutCapacity * hourlyDraw(config.digestionRate));
}

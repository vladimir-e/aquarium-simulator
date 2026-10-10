/**
 * The gut — a fish's one hunger stock. Food fills it, it digests first order
 * at its species' pace, and what it digests is offered to the energy budget,
 * which takes up to its assimilation ceiling and hands the rest back.
 *
 * Appetite is that ceiling in food: {p_Am}·L² over κ_X, a surface, so a fry
 * eats more for its weight than its parents. A gut holds a day of it.
 */

import type { Fish } from '../state.js';
import type { LivestockConfig } from '../config/livestock.js';
import { HOURS_PER_DAY } from '../core/clock.js';
import { hourlyDraw } from '../core/kinetics.js';
import { sum } from '../core/sum.js';
import { assimilationCeiling, type DebHour } from './deb.js';
import { fishParams } from './fish-body.js';

/** The pace a fish's budget runs at this hour: τ, ω and the water's stress on it. */
export type Pace = Pick<DebHour, 'tau' | 'omega' | 'stress'>;

type Body = Pick<Fish, 'species' | 'deb'>;

/** Grams of food an hour its budget can take up. */
export function appetite(fish: Body, pace: Pace): number {
  const p = fishParams(fish);
  return assimilationCeiling(fish.deb, p, pace) / p.kappaX;
}

/** Grams of food an hour whose assimilation pays `owed` grams of its upkeep. */
export function ration(fish: Pick<Fish, 'species'>, owed: number): number {
  return owed / fishParams(fish).kappaX;
}

/** Grams of food a full gut holds: a day of its appetite. */
export function gutCapacity(fish: Body, pace: Pace): number {
  return HOURS_PER_DAY * appetite(fish, pace);
}

/** Grams it would eat this hour: the room left in its gut. */
export function gutRoom(fish: Body & Pick<Fish, 'gut'>, pace: Pace): number {
  return Math.max(0, gutCapacity(fish, pace) - fish.gut);
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
  eaters: readonly (Body & Pick<Fish, 'gut'>)[],
  paces: readonly Pace[],
  shares: readonly number[]
): Shared {
  return capped(
    shares,
    eaters.map((eater, i) => gutRoom(eater, paces[i]))
  );
}

/** Share of a full gut under which it digests less in an hour than its budget can take up, at pace τ. */
export function fullPaceLine(tau: number, config: LivestockConfig): number {
  const draw = hourlyDraw(config.digestionRate * tau);
  return draw > 0 ? Math.min(1, 1 / (HOURS_PER_DAY * draw)) : 1;
}

/** Grams a gut digests over the hour at pace τ. */
export function digest(gut: number, tau: number, config: LivestockConfig): number {
  return Math.max(0, gut) * hourlyDraw(config.digestionRate * tau);
}

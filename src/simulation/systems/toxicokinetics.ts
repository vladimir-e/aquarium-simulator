/**
 * Toxicokinetics in GUTS-RED form: a fish's load of a toxin is its scaled
 * internal concentration, in the water's own ppm, and it follows the water's
 * level first order. The rate is the toxin's dominant one, the slower of
 * uptake and repair, at 1 cm of structural length, paced by τ and divided by
 * the fish's length — exchange runs through its surface and dilutes in its
 * volume, so a small fish loads and clears faster.
 * A spike barely loads a big fish; a held level saturates any.
 */

import type { Fish, Resources } from '../state.js';
import { mapToxins, type ToxinVector } from '../config/livestock.js';
import { getPpm } from '../resources/index.js';
import { freeAmmoniaPpm } from './nitrogen-cycle.js';
import { structuralLength } from './deb.js';

/** What the water holds of each toxin, ppm: the unionized share of its ammonia, its nitrite and its nitrate. */
export function waterToxins(
  resources: Pick<Resources, 'ammonia' | 'nitrite' | 'nitrate' | 'water' | 'temperature' | 'co2' | 'kh'>
): ToxinVector {
  return {
    ammonia: freeAmmoniaPpm(resources),
    nitrite: getPpm(resources.nitrite, resources.water),
    nitrate: getPpm(resources.nitrate, resources.water),
  };
}

/** Per hour, the rate a fish `length` cm long at pace τ follows the water at, `rateAt1cm` the toxin's at 1 cm, τ 1. */
export function fishLoadRate(rateAt1cm: number, tau: number, length: number): number {
  return (rateAt1cm * tau) / length;
}

/** A load an hour on: its gap to the level shrinks to `e^−rate` of itself, so it never passes the level either way. */
export function stepLoad(load: number, level: number, rate: number): number {
  return level + (load - level) * Math.exp(-rate);
}

/** A fish an hour on in water holding `levels`, at pace τ, `rates` each toxin's at 1 cm: every load stepped. */
export function loadFish(fish: Fish, levels: ToxinVector, tau: number, rates: ToxinVector): Fish {
  const length = structuralLength(fish.budget);
  return { ...fish, load: mapToxins((t) => stepLoad(fish.load[t], levels[t], fishLoadRate(rates[t], tau, length))) };
}

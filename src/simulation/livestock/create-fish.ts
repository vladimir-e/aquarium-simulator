/**
 * Fish construction — the factory for every fish that enters the tank:
 * stocked by the player (`addFish`), seeded, or hatched. Every path shares the
 * same individual variation (50/50 sex, a per-fish hardiness offset, small
 * health jitter, a survival threshold), so a hatchling and a bought fish
 * differ only in the body they arrive with.
 *
 * A stocked fish was grown in the shop: its budget is the one its species
 * reaches at the named size on unlimited food at its mid-range temperature,
 * its broods spent along the way, and its age, wear and survival are that
 * upbringing's, whatever tank buys it.
 */

import type { Fish } from '../state.js';
import { draw, drawId, type RngState } from '../core/rng.js';
import type { FishSex, FishSpecies } from './species.js';
import { debParams, FISH_SPECIES_DATA, midRangeTemperature, speciesTau } from './species.js';
import { hatchling, size, stepDeb, type DebState } from '../systems/deb.js';
import { appetite } from '../systems/digestion.js';
import { frySize } from '../systems/fish-body.js';

/** Per-fish hardiness offset span as a fraction of species baseline. */
export const HARDINESS_OFFSET_SPAN = 0.15;
/** Initial health jitter span (± points around 100). */
export const HEALTH_JITTER = 5;
/** The size a fish is stocked at when none is named, in % of its grown length. */
export const STOCKED_FISH_SIZE = 80;
/** The largest a shop sells: grown length is an asymptote no fish reaches. */
export const MAX_STOCKED_SIZE = 90;

/** Whether a fish can be stocked at this size: from a hatchling's up to {@link MAX_STOCKED_SIZE}. */
export function isStockableSize(species: FishSpecies, size: number): boolean {
  return Number.isFinite(size) && size >= frySize(species) && size <= MAX_STOCKED_SIZE;
}

export function unstockableSizeMessage(species: FishSpecies): string {
  const from = Number(frySize(species).toPrecision(2));
  return `A ${FISH_SPECIES_DATA[species].name} is stocked from ${from}% to ${MAX_STOCKED_SIZE}% of its grown length`;
}

export interface Upbringing {
  budget: DebState;
  survival: number;
  hours: number;
}

/** A fish fed without limit at `temperatureC` from hatching until it reaches `target` size, its buffer spent every hour. */
export function raise(species: FishSpecies, target: number, temperatureC: number): Upbringing {
  if (!isStockableSize(species, target)) throw new RangeError(unstockableSizeMessage(species));
  const p = debParams(species);
  const pace = { tau: speciesTau(species, temperatureC), omega: 1 };
  let [budget, survival, hours] = [hatchling(p), 1, 0];
  while (size(budget, p) < target) {
    const fromGut = appetite({ species, budget }, pace);
    survival *= Math.exp(-budget.hazard);
    budget = { ...stepDeb(budget, p, { fromGut, ...pace }).state, broodBuffer: 0 };
    hours++;
  }
  return { budget, survival, hours };
}

const shop = new Map<string, Upbringing>();

/**
 * The body a stocked fish arrives with, raised at its species' mid-range temperature to `target` % of its grown
 * length, before any individual variation.
 */
export function stockedBody(species: FishSpecies, target: number): Pick<Fish, 'budget' | 'survival' | 'age'> {
  const key = `${species}:${target}`;
  let raised = shop.get(key);
  if (raised === undefined) {
    raised = raise(species, target, midRangeTemperature(species));
    shop.set(key, raised);
  }
  return { budget: raised.budget, survival: raised.survival, age: raised.hours };
}

interface Individual {
  species: FishSpecies;
  /** Sampled 50/50 when absent: a player doesn't choose it at the shop; a scenario author naming a pair does. */
  sex?: FishSex;
  /** The tank's draw stream — both the variation and the id come off it. */
  rng: RngState;
}

function individual(
  { species, sex, rng }: Individual,
  body: Pick<Fish, 'budget' | 'survival' | 'age'>
): Fish {
  // Drawn even when the caller named a sex: a seed that names one and a seed
  // that doesn't must otherwise hand every later organism a different stream.
  const sampledSex = draw(rng) < 0.5 ? 'male' : 'female';
  const hardinessOffset = (draw(rng) - 0.5) * 2 * HARDINESS_OFFSET_SPAN * FISH_SPECIES_DATA[species].hardiness;
  const health = Math.max(0, Math.min(100, 100 + (draw(rng) - 0.5) * 2 * HEALTH_JITTER));
  const survivalDraw = draw(rng) * body.survival;
  return {
    id: drawId(rng, 'fish'),
    species,
    health,
    age: body.age,
    gut: 0,
    sex: sex ?? sampledSex,
    hardinessOffset,
    budget: body.budget,
    survival: body.survival,
    survivalDraw,
  };
}

/** A fish from the shop at `size` % of its grown length. */
export function stockFish(params: Individual & { size: number }): Fish {
  return individual(params, stockedBody(params.species, params.size));
}

/** A fry out of its egg. */
export function hatchFish(params: Individual): Fish {
  return individual(params, { budget: hatchling(debParams(params.species)), survival: 1, age: 0 });
}

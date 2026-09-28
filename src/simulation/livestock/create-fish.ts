/**
 * Fish construction — the single factory for every fish that enters the
 * tank, whether stocked by the player (`addFish`), seeded, or born from
 * breeding. Every path shares the same individual variation (50/50 sex, a
 * per-fish hardiness offset, small health jitter), so a bred fry and a bought
 * fish differ only in the size they arrive at.
 */

import type { Fish } from '../state.js';
import type { LivestockConfig } from '../config/livestock.js';
import { draw, drawId, type RngState } from '../core/rng.js';
import type { FishSex, FishSpecies } from './species.js';
import { FISH_SPECIES_DATA } from './species.js';
import { frySize, massAtSize } from '../systems/fish-growth.js';
import { arrivalGut } from '../systems/digestion.js';

/** Per-fish hardiness offset span as a fraction of species baseline. */
export const HARDINESS_OFFSET_SPAN = 0.15;
/** Initial health jitter span (± points around 100). */
export const HEALTH_JITTER = 5;
/** The size a fish is stocked at when none is named: grown. */
export const STOCKED_FISH_SIZE = 100;

/** Whether a fish can be stocked at this size: from a fry's up to adult. */
export function isStockableSize(species: FishSpecies, size: number): boolean {
  return Number.isFinite(size) && size >= frySize(species) && size <= 100;
}

export function unstockableSizeMessage(species: FishSpecies): string {
  return `A ${FISH_SPECIES_DATA[species].name} is stocked from ${Number(frySize(species).toPrecision(2))}% to 100% of adult size`;
}

/** How big it arrives: a size in % of adult mass, or its grams outright. */
type FishBody = { size: number; mass?: never } | { mass: number; size?: never };

export type CreateFishParams = FishBody & {
  species: FishSpecies;
  /** Age in ticks; 0 when not named. Wear and healing read it. */
  age?: number;
  /** Grams in its gut on arrival; its {@link arrivalGut} when not named. */
  gut?: number;
  /**
   * Sex, sampled 50/50 when absent. A player doesn't choose it at the
   * shop; a scenario author naming a breeding pair does.
   */
  sex?: FishSex;
  /** The tank's draw stream — both the variation and the id come off it. */
  rng: RngState;
  config: LivestockConfig;
};

/** Build a fish with sampled individual variation. */
export function createFish(params: CreateFishParams): Fish {
  const { species, rng, config } = params;
  const data = FISH_SPECIES_DATA[species];

  // Drawn even when the caller named a sex: a seed that names one and a seed
  // that doesn't must otherwise hand every later organism a different stream.
  const sampledSex = draw(rng) < 0.5 ? 'male' : 'female';
  const sex = params.sex ?? sampledSex;
  const hardinessOffset = (draw(rng) - 0.5) * 2 * HARDINESS_OFFSET_SPAN * data.hardiness;
  const health = Math.max(0, Math.min(100, 100 + (draw(rng) - 0.5) * 2 * HEALTH_JITTER));

  const mass = params.mass ?? massAtSize(species, params.size);

  return {
    id: drawId(rng, 'fish'),
    species,
    mass,
    health,
    age: params.age ?? 0,
    gut: params.gut ?? arrivalGut({ species, mass }, config),
    sex,
    hardinessOffset,
    surplus: 0,
  };
}

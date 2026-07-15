/**
 * Fish construction — the single factory for every fish that enters the
 * tank, whether stocked by the player (`addFish`) or born from breeding.
 *
 * Both paths share the same individual variation (50/50 sex, a
 * per-fish hardiness offset, small health jitter) so a bred fry is
 * indistinguishable in shape from a purchased adult. The only
 * difference is the stage/age/mass triple the caller supplies.
 */

import type { Fish, FishSpecies, FishLifeStage } from '../state.js';
import { FISH_SPECIES_DATA } from '../state.js';

/** Per-fish hardiness offset span as a fraction of species baseline. */
const HARDINESS_OFFSET_SPAN = 0.15;
/** Initial health jitter span (± points around 100). */
const HEALTH_JITTER = 5;
/** Satiation a stocked adult arrives at (peckish — see `addFish`). */
const ADULT_ARRIVAL_SATIATION = 70;
/** Satiation a newborn fry starts at (peckish, no immediate stress). */
const FRY_START_SATIATION = 50;

/** Monotonic sequence guaranteeing unique ids even within one tick. */
let fishSeq = 0;

/** Generate a process-unique fish id (time prefix + counter). */
export function generateFishId(): string {
  return `fish_${Date.now().toString(36)}_${(fishSeq++).toString(36)}`;
}

/**
 * Body mass for a fish of the given stage and age. Adults sit at
 * `adultMass`; fry interpolate linearly from `fryMassFraction × adultMass`
 * at age 0 up to `adultMass` at `maturityAge`, then clamp.
 */
export function fishMassForAge(species: FishSpecies, age: number, stage: FishLifeStage): number {
  const data = FISH_SPECIES_DATA[species];
  if (stage === 'adult') return data.adultMass;
  const fryMass = data.breeding.fryMassFraction * data.adultMass;
  const progress = Math.min(1, Math.max(0, age / data.breeding.maturityAge));
  return fryMass + (data.adultMass - fryMass) * progress;
}

export interface CreateFishParams {
  species: FishSpecies;
  /** Age in ticks. Stocked adults and newborn fry both start at 0. */
  age: number;
  stage: FishLifeStage;
  /** Randomness source for sex / hardiness / health. Defaults to `Math.random`. */
  rng?: () => number;
}

/**
 * Build a fish with sampled individual variation. Mass is derived from
 * `stage` and `age` via {@link fishMassForAge}; a stocked adult is full
 * mass at age 0, a fry starts small and grows.
 */
export function createFish(params: CreateFishParams): Fish {
  const { species, age, stage, rng = Math.random } = params;
  const data = FISH_SPECIES_DATA[species];

  const sex = rng() < 0.5 ? 'male' : 'female';
  const hardinessOffset = (rng() - 0.5) * 2 * HARDINESS_OFFSET_SPAN * data.hardiness;
  const health = Math.max(0, Math.min(100, 100 + (rng() - 0.5) * 2 * HEALTH_JITTER));

  return {
    id: generateFishId(),
    species,
    mass: fishMassForAge(species, age, stage),
    health,
    age,
    satiation: stage === 'adult' ? ADULT_ARRIVAL_SATIATION : FRY_START_SATIATION,
    sex,
    stage,
    hardinessOffset,
    surplus: 0,
  };
}

/**
 * Fish construction — the single factory for every fish that enters the
 * tank, whether stocked by the player (`addFish`) or born from breeding.
 *
 * Both paths share the same individual variation (50/50 sex, a
 * per-fish hardiness offset, small health jitter) so a bred fry is
 * indistinguishable in shape from a purchased adult. The only
 * difference is the stage/age/mass triple the caller supplies.
 */

import type { Fish } from '../state.js';
import { draw, drawId, type RngState } from '../core/rng.js';
import type { FishSex, FishSpecies, FishLifeStage } from './species.js';
import { FISH_SPECIES_DATA } from './species.js';

/** Per-fish hardiness offset span as a fraction of species baseline. */
export const HARDINESS_OFFSET_SPAN = 0.15;
/** Initial health jitter span (± points around 100). */
const HEALTH_JITTER = 5;
/** Satiation a stocked adult arrives at (peckish — see `addFish`). */
const ADULT_ARRIVAL_SATIATION = 70;
/** Satiation a newborn fry starts at (peckish, no immediate stress). */
const FRY_START_SATIATION = 50;

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
  /**
   * Age in ticks. Left out, the fish starts at the youngest age its stage
   * can honestly hold: `maturityAge` for an adult, 0 for a fry. Only an
   * age a caller actually names stands as written.
   */
  age?: number;
  stage: FishLifeStage;
  /**
   * Sex, sampled 50/50 when absent. A player doesn't choose it at the
   * shop; a scenario author naming a breeding pair does.
   */
  sex?: FishSex;
  /** The tank's draw stream — both the variation and the id come off it. */
  rng: RngState;
}

/**
 * Build a fish with sampled individual variation. Mass is derived from
 * `stage` and `age` via {@link fishMassForAge}; an adult is full mass at
 * any age, a fry starts small and grows.
 */
export function createFish(params: CreateFishParams): Fish {
  const { species, stage, rng } = params;
  const data = FISH_SPECIES_DATA[species];
  const age = params.age ?? (stage === 'adult' ? data.breeding.maturityAge : 0);

  // Drawn even when the caller named a sex: a seed that names one and a seed
  // that doesn't must otherwise hand every later organism a different stream.
  const sampledSex = draw(rng) < 0.5 ? 'male' : 'female';
  const sex = params.sex ?? sampledSex;
  const hardinessOffset = (draw(rng) - 0.5) * 2 * HARDINESS_OFFSET_SPAN * data.hardiness;
  const health = Math.max(0, Math.min(100, 100 + (draw(rng) - 0.5) * 2 * HEALTH_JITTER));

  return {
    id: drawId(rng, 'fish'),
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

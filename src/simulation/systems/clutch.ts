/**
 * Harm and predation are competing first-order losses on one stock of eggs,
 * so a bad hour thins a clutch and never empties it.
 */

import type { Clutch, Fish, Resources } from '../state.js';
import type { FishSpecies } from '../livestock/species.js';
import { FISH_SPECIES_DATA, incubation, speciesTau } from '../livestock/species.js';
import type { LivestockConfig, ToxinVector } from '../config/livestock.js';
import { hourlyDraw } from '../core/kinetics.js';
import { sum } from '../core/sum.js';
import { waterStressors } from './fish-health.js';
import { eggMass, eggOrganics } from './fish-body.js';

/** Every laid clutch, and each brood whose mother is among `fish`. */
export function clutchesWithMothers<C extends Pick<Clutch, 'motherId'>>(
  clutches: readonly C[],
  fish: readonly Pick<Fish, 'id'>[]
): C[] {
  const mothers = new Set(fish.map((f) => f.id));
  return clutches.filter((clutch) => clutch.motherId === undefined || mothers.has(clutch.motherId));
}

/** Grams a clutch's eggs weigh. */
export function clutchMass(clutch: Pick<Clutch, 'species' | 'eggs'>): number {
  return clutch.eggs * eggMass(clutch.species);
}

/** Grams of organic matter a clutch's eggs hold. */
export function clutchOrganics(clutch: Pick<Clutch, 'species' | 'eggs'>): number {
  return clutch.eggs * eggOrganics(clutch.species);
}

/**
 * Share of a clutch the water kills an hour, as a first-order rate: the water
 * harm of a fish of this hardiness, `eggSensitivity` times as hard on laid
 * eggs, and as hard as on its mother on a brood she carries. Its toxins are
 * read at `toxins`: the water's for a laid egg, which loads in the fast limit
 * of a fish's law, and its mother's load for a carried brood.
 */
export function eggHarmRate(
  clutch: Pick<Clutch, 'species' | 'motherId'>,
  hardiness: number,
  toxins: ToxinVector,
  resources: Resources,
  waterVolume: number,
  config: LivestockConfig
): number {
  const stressors = waterStressors(clutch.species, hardiness, toxins, resources, waterVolume, config);
  const damage = sum(stressors.map((f) => f.amount));
  const sensitivity = clutch.motherId === undefined ? config.eggSensitivity : 1;
  return (sensitivity * damage) / 100;
}

/**
 * Share of a laid clutch the tank's fish eat an hour, as a first-order rate,
 * `predatorMass` the grams by which they outweigh an egg; a carried brood is
 * out of their reach.
 */
export function eggPredationRate(
  clutch: Pick<Clutch, 'species' | 'motherId'>,
  predatorMass: number,
  waterVolume: number,
  config: LivestockConfig
): number {
  if (clutch.motherId !== undefined || waterVolume <= 0) return 0;
  const { clutchExposure } = FISH_SPECIES_DATA[clutch.species].breeding;
  return (config.eggPredationRate * clutchExposure * predatorMass) / waterVolume;
}

/** Development a clutch gains an hour in water this warm: its species' incubation paced by τ. */
export function developmentRate(species: FishSpecies, temperature: number): number {
  return speciesTau(species, temperature) / incubation(species);
}

export interface ClutchHour {
  clutch: Clutch;
  /** Eggs the fish ate. */
  eaten: number;
  /** Eggs the water killed. */
  spoiled: number;
}

/** One hour of a clutch: harm and predation compete for its eggs, and it develops. */
export function settleClutch(clutch: Clutch, harm: number, predation: number, development: number): ClutchHour {
  const rate = harm + predation;
  const lost = Math.max(0, clutch.eggs) * hourlyDraw(rate);
  const eaten = rate > 0 ? (lost * predation) / rate : 0;
  return {
    clutch: { ...clutch, eggs: Math.max(0, clutch.eggs - lost), development: clutch.development + development },
    eaten,
    spoiled: lost - eaten,
  };
}

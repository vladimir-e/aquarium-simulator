/**
 * Harm and predation are competing first-order losses on one stock of eggs,
 * so a bad hour thins a clutch and never empties it.
 */

import type { Clutch, Resources } from '../state.js';
import type { FishSpecies } from '../livestock/species.js';
import { FISH_SPECIES_DATA } from '../livestock/species.js';
import type { LivestockConfig } from '../config/livestock.js';
import { hourlyDraw } from '../core/kinetics.js';
import { speciesHardiness, waterStressors } from './fish-health.js';

/** Grams a clutch's eggs weigh. */
export function clutchMass(clutch: Pick<Clutch, 'species' | 'eggs'>): number {
  return clutch.eggs * FISH_SPECIES_DATA[clutch.species].breeding.eggMass;
}

/**
 * Share of a clutch the water kills an hour, as a first-order rate: the fish's
 * own water harm, `eggSensitivity` times as hard on laid eggs, and as hard as
 * on its mother on a brood she carries.
 */
export function eggHarmRate(
  clutch: Pick<Clutch, 'species' | 'motherId'>,
  resources: Resources,
  waterVolume: number,
  config: LivestockConfig
): number {
  const { species } = clutch;
  const damage = waterStressors(species, speciesHardiness(species), resources, waterVolume, config).reduce(
    (sum, factor) => sum + factor.amount,
    0
  );
  const sensitivity = clutch.motherId === undefined ? config.eggSensitivity : 1;
  return (sensitivity * damage) / 100;
}

/** Share of a clutch the tank's fish eat an hour, as a first-order rate. */
export function eggPredationRate(
  species: FishSpecies,
  predatorMass: number,
  waterVolume: number,
  config: LivestockConfig
): number {
  if (waterVolume <= 0) return 0;
  const { clutchExposure } = FISH_SPECIES_DATA[species].breeding;
  return (config.eggPredationRate * clutchExposure * predatorMass) / waterVolume;
}

/** Development a clutch gains an hour, its parents' metabolism running at `metabolicFactor`. */
export function developmentRate(species: FishSpecies, metabolicFactor: number): number {
  return metabolicFactor / FISH_SPECIES_DATA[species].breeding.developmentTime;
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

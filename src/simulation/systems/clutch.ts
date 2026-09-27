/**
 * Clutches — eggs as a stock, not individuals. Each hour two rates thin the
 * count and one fills its development:
 *
 * - Harm: the water charges the eggs through the fish's own channel, at the
 *   species' hardiness, `eggSensitivity` times as hard; a %/h of condition is a
 *   share of the eggs lost, since an egg has no buffer to spend.
 * - Predation: every fish in the tank hunts eggs, `eggPredationRate` per gram
 *   of fish per litre, reaching only the clutch's exposure — nothing reaches
 *   a brood its mother carries.
 * - Development: the parents' metabolic factor over the species'
 *   `developmentTime`, so a warm clutch hatches sooner and a hypoxic one later.
 *
 * The two losses compete over the hour, so a bad hour thins a clutch and never
 * empties it.
 */

import type { Clutch, Resources } from '../state.js';
import type { FishSpecies } from '../livestock/species.js';
import { FISH_SPECIES_DATA } from '../livestock/species.js';
import type { LivestockConfig } from '../config/livestock.js';
import { hourlyDraw } from '../core/kinetics.js';
import { speciesHardiness, waterStressors } from './fish-health.js';

/** Share of a clutch the water kills an hour, as a first-order rate. */
export function eggHarmRate(
  species: FishSpecies,
  resources: Resources,
  waterVolume: number,
  config: LivestockConfig
): number {
  const damage = waterStressors(species, speciesHardiness(species), resources, waterVolume, config).reduce(
    (sum, factor) => sum + factor.amount,
    0
  );
  return (config.eggSensitivity * damage) / 100;
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

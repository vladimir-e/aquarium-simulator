/**
 * Livestock grouping for the Run card: fold the flat fish array into species
 * rows and fry batches, and map satiation bands onto the shared status
 * vocabulary. Pure — the card renders whatever these return, so a 5-fish and a
 * 500-fish tank produce the same shapes.
 */

import {
  FISH_SPECIES_DATA,
  classifySatiationBandPosition,
  type Fish,
  type FishSpecies,
  type SatiationBand,
} from '../../simulation/index.js';
import type { LivestockConfig } from '../../simulation/config/livestock.js';
import type { Status } from './status.js';

/** Hungry and starving are the two bands that count toward "N hungry". */
export function isHungryBand(band: SatiationBand): boolean {
  return band === 'hungry' || band === 'starving';
}

export function bandOf(satiation: number, config: LivestockConfig): SatiationBand {
  return classifySatiationBandPosition(satiation, config).band;
}

/** Satiation band → bar/status colour. Overfed and hungry both warn; only
 *  starving is an alert, and peckish is the calm middle. */
export function bandStatus(band: SatiationBand): Status {
  switch (band) {
    case 'wellFed':
      return 'ok';
    case 'peckish':
      return 'neutral';
    case 'overfed':
    case 'hungry':
      return 'warn';
    case 'starving':
      return 'alert';
  }
}

export function countHungry(fish: Fish[], config: LivestockConfig): number {
  return fish.reduce((n, f) => n + (isHungryBand(bandOf(f.satiation, config)) ? 1 : 0), 0);
}

function groupBySpeciesKey(fish: Fish[]): Map<FishSpecies, Fish[]> {
  const groups = new Map<FishSpecies, Fish[]>();
  for (const f of fish) {
    const existing = groups.get(f.species);
    if (existing) existing.push(f);
    else groups.set(f.species, [f]);
  }
  return groups;
}

export interface SpeciesGroup {
  species: FishSpecies;
  name: string;
  count: number;
  avgSatiation: number;
  band: SatiationBand;
  hungryCount: number;
  fish: Fish[];
}

/** Adult fish folded into per-species rows, in first-seen order. */
export function groupBySpecies(fish: Fish[], config: LivestockConfig): SpeciesGroup[] {
  const adults = fish.filter((f) => f.stage === 'adult');
  return [...groupBySpeciesKey(adults)].map(([species, group]) => {
    const avgSatiation = group.reduce((s, f) => s + f.satiation, 0) / group.length;
    return {
      species,
      name: FISH_SPECIES_DATA[species].name,
      count: group.length,
      avgSatiation,
      band: bandOf(avgSatiation, config),
      hungryCount: group.filter((f) => isHungryBand(bandOf(f.satiation, config))).length,
      fish: group,
    };
  });
}

export interface FryBatch {
  species: FishSpecies;
  name: string;
  count: number;
  /** Whole days the batch has aged (from average age). */
  dayNow: number;
  /** Day number at which this species reaches adulthood. */
  graduationDay: number;
  /** Progress toward adult mass, 0–100. */
  growthPct: number;
}

export function groupFryBatches(fish: Fish[]): FryBatch[] {
  const fry = fish.filter((f) => f.stage === 'fry');
  return [...groupBySpeciesKey(fry)].map(([species, group]) => ({
    species,
    name: FISH_SPECIES_DATA[species].name,
    count: group.length,
    ...deriveFryGraduation(
      group.map((f) => f.age),
      FISH_SPECIES_DATA[species].breeding.maturityAge
    ),
  }));
}

/**
 * Batch maturation, derived from the fry's average age against the species
 * maturity age (ticks are hours; a day is 24). `graduationDay` is where the
 * batch flips to adult; `growthPct` is how far along it is now.
 */
export function deriveFryGraduation(
  ages: number[],
  maturityAge: number
): { dayNow: number; graduationDay: number; growthPct: number } {
  const avgAge = ages.length ? ages.reduce((s, a) => s + a, 0) / ages.length : 0;
  return {
    dayNow: Math.floor(avgAge / 24),
    graduationDay: Math.max(1, Math.round(maturityAge / 24)),
    growthPct: maturityAge > 0 ? Math.max(0, Math.min(100, (avgAge / maturityAge) * 100)) : 100,
  };
}

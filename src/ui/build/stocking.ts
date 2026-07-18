/**
 * Stocking column model: fold the flat fish array into per-species adult
 * counts and fry lines, pick a cull victim when a count steps down, and derive
 * the bioload preview. Pure — the column renders these and wires the actions.
 */

import {
  FISH_SPECIES_DATA,
  getMaxFishMass,
  totalFishMass,
  type Fish,
  type FishSpecies,
} from '../../simulation/index.js';
import type { Status } from '../run';

export interface SpeciesCount {
  species: FishSpecies;
  name: string;
  count: number;
}

/** Adult fish folded into per-species counts, in first-seen order. */
export function speciesCounts(fish: Fish[]): SpeciesCount[] {
  const order: FishSpecies[] = [];
  const counts = new Map<FishSpecies, number>();
  for (const f of fish) {
    if (f.stage !== 'adult') continue;
    if (!counts.has(f.species)) order.push(f.species);
    counts.set(f.species, (counts.get(f.species) ?? 0) + 1);
  }
  return order.map((species) => ({
    species,
    name: FISH_SPECIES_DATA[species].name,
    count: counts.get(species) ?? 0,
  }));
}

/**
 * Which fish the − stepper culls: the lowest-health adult of the species, so
 * the weakest goes first (the same logic that staggers natural deaths).
 * Null when the species has no adults left.
 */
export function removalVictimId(fish: Fish[], species: FishSpecies): string | null {
  let victim: Fish | null = null;
  for (const f of fish) {
    if (f.species !== species || f.stage !== 'adult') continue;
    if (!victim || f.health < victim.health) victim = f;
  }
  return victim?.id ?? null;
}

export interface FryLine {
  species: FishSpecies;
  name: string;
  count: number;
}

/** Fry folded into per-species lines, in first-seen order. */
export function fryLines(fish: Fish[]): FryLine[] {
  const order: FishSpecies[] = [];
  const counts = new Map<FishSpecies, number>();
  for (const f of fish) {
    if (f.stage !== 'fry') continue;
    if (!counts.has(f.species)) order.push(f.species);
    counts.set(f.species, (counts.get(f.species) ?? 0) + 1);
  }
  return order.map((species) => ({
    species,
    name: FISH_SPECIES_DATA[species].name,
    count: counts.get(species) ?? 0,
  }));
}

export interface Bioload {
  /** Current total fish body mass (g). */
  massG: number;
  /** Physical stocking ceiling for the tank (g). */
  maxG: number;
  /** massG / maxG — the "×" figure. */
  ratio: number;
  /** Bar fill, ratio clamped to 0–100%. */
  pct: number;
  status: Status;
}

/** Bioload against the tank's physical fish-mass ceiling. */
export function bioload(fish: Fish[], tankCapacity: number): Bioload {
  const massG = totalFishMass(fish);
  const maxG = getMaxFishMass(tankCapacity);
  const ratio = maxG > 0 ? massG / maxG : 0;
  const status: Status = ratio < 0.7 ? 'ok' : ratio < 0.9 ? 'warn' : 'alert';
  return { massG, maxG, ratio, pct: Math.min(100, ratio * 100), status };
}

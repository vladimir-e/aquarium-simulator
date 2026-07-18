/**
 * Stocking column model: fold the flat fish array into per-species adult
 * counts and fry lines, pick a cull victim when a count steps down, and derive
 * the bioload preview. Pure — the column renders these and wires the actions.
 */

import { FISH_SPECIES_DATA, type Fish, type FishSpecies } from '../../simulation/index.js';
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

/**
 * Grams of projected adult fish per litre a well-run planted community tank
 * carries comfortably. This is a husbandry *guideline*, not a physical limit
 * (the tank can hold far more solid fish than water) — the point is to warn at
 * stocking time, before the nitrogen cycle reacts hours later.
 *
 * Anchored to the 150 L "Balanced Community" preset stocked sensibly — a
 * 40-gallon community of ~72 g of adult fish (12 neon tetra 6 g + 8 corydoras
 * 32 g + 4 guppy 4 g + 2 angelfish 30 g). That's 72 g / 150 L = 0.48 g/L, which
 * should read as "well stocked, not maxed" (~0.8×). Solving 0.48 / 0.8 gives
 * the 0.6 g/L guideline capacity below.
 */
export const GUIDELINE_G_PER_L = 0.6;

/**
 * Projected adult mass (g): every stocked fish counted at its species' adult
 * mass, fry included — fry grow up, so they count toward the eventual bioload.
 */
export function projectedAdultMass(fish: Fish[]): number {
  return fish.reduce((sum, f) => sum + FISH_SPECIES_DATA[f.species].adultMass, 0);
}

export interface Bioload {
  /** Projected adult mass of the current stocking (g). */
  massG: number;
  /** Guideline capacity for the tank (g). */
  guidelineG: number;
  /** massG / guidelineG — the "×" figure. */
  ratio: number;
  /** Bar fill, ratio clamped to 0–100%. */
  pct: number;
  status: Status;
}

/**
 * Bioload against the husbandry guideline. Thresholds: under 0.7× reads calm
 * (room to spare); 0.7–1.0× warns (well stocked — approaching the guideline,
 * watch water params); at/over 1.0× alerts (past the guideline — expect
 * ammonia/nitrate pressure).
 */
export function bioload(fish: Fish[], tankLiters: number): Bioload {
  const massG = projectedAdultMass(fish);
  const guidelineG = tankLiters * GUIDELINE_G_PER_L;
  const ratio = guidelineG > 0 ? massG / guidelineG : 0;
  const status: Status = ratio >= 1 ? 'alert' : ratio >= 0.7 ? 'warn' : 'ok';
  return { massG, guidelineG, ratio, pct: Math.min(100, ratio * 100), status };
}

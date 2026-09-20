/**
 * Stocking model: the bioload guideline the roster is read against, and the
 * per-species add options with the consequence of taking one more. Pure — the
 * section renders these and wires the actions.
 */

import { FISH_SPECIES_DATA, type Fish, type FishSpecies } from '../../simulation/index.js';
import type { Status } from '../run';
import { getVolumeUnit, toInternalVolume, type UnitSystem } from '../utils/units.js';

/**
 * Grams of projected adult fish per litre a well-run planted community tank
 * carries comfortably. This is a husbandry *guideline*, not a physical limit
 * (the tank can hold far more solid fish than water) — the point is to warn at
 * stocking time, before the nitrogen cycle reacts hours later.
 *
 * The engine has no stocking-density mechanic to calibrate against, so this is
 * a conventional hobby figure chosen for this UI rather than a measured one.
 * For scale: a 150 L community of ~72 g of adult fish reads 0.48 g/L — 0.8× the
 * guideline, "well stocked, not maxed".
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

/** Fish the tank does not hold yet — what the picker is about to commit to. */
export interface Stocking {
  species: FishSpecies;
  count: number;
}

/**
 * Bioload against the husbandry guideline, for the tank as it stands or as a
 * `stocking` would leave it. Thresholds: under 0.7× reads calm (room to
 * spare); 0.7–1.0× warns (well stocked — approaching the guideline, watch
 * water params); at/over 1.0× alerts (past the guideline — expect
 * ammonia/nitrate pressure).
 */
export function bioload(fish: Fish[], tankLiters: number, stocking?: Stocking): Bioload {
  const adding = stocking ? stocking.count * FISH_SPECIES_DATA[stocking.species].adultMass : 0;
  const massG = projectedAdultMass(fish) + adding;
  const guidelineG = tankLiters * GUIDELINE_G_PER_L;
  const ratio = guidelineG > 0 ? massG / guidelineG : 0;
  const status: Status = ratio >= 1 ? 'alert' : ratio >= 0.7 ? 'warn' : 'ok';
  return { massG, guidelineG, ratio, pct: Math.min(100, ratio * 100), status };
}

/**
 * The arithmetic behind the × figure, spelled out so the bar cannot be read as
 * a cap the engine enforces. The rate is quoted per the reader's own volume
 * unit, which is why it is not simply {@link GUIDELINE_G_PER_L}.
 */
export function bioloadNote(load: Bioload, units: UnitSystem): string {
  const perUnit = GUIDELINE_G_PER_L * toInternalVolume(1, units);
  return (
    `${load.massG.toFixed(1)} g projected adult mass · ` +
    `guideline ${load.guidelineG.toFixed(0)} g at ${perUnit.toFixed(1)} g/${getVolumeUnit(units)}`
  );
}

/**
 * The water-quality edges the alerts fire at, and how far hardiness carries an
 * organism's own edge past one. A fish's edge sits past its alert's by
 * `toleranceFactor(hardiness)`, so the alert leads every fish; a plant's
 * nitrate edge moves out from `nitrateEdge` the same way.
 */

import type { Fish } from '../state.js';
import { mapToxins, type ToxinVector } from '../config/livestock.js';
import { eFoldsPast } from '../systems/vitality.js';
import { FISH_SPECIES_DATA, type FishSpecies } from './species.js';

/** Free (unionized) NH₃, ppm. */
export const FREE_AMMONIA_EDGE = 0.02;

/** Nitrite as NO₂⁻, ppm. */
export const NITRITE_EDGE = 0.5;

/** Nitrate as NO₃⁻, ppm. */
export const NITRATE_EDGE = 80;

/** Dissolved oxygen, mg/L — the alert fires below it. */
export const OXYGEN_EDGE = 4;

/** Dissolved oxygen at which the oxygen benefit is full, mg/L. */
export const OXYGEN_COMFORT = 6;

/** mg/L added to both sides of the oxygen log, keeping harm finite at zero. */
export const OXYGEN_LOG_OFFSET = 0.1;

/** How far past the edge an organism of hardiness 1 tolerates. */
export const HARDY_TOLERANCE = 2;

/** How far out an organism of this hardiness carries each edge: × for a toxin, ÷ for oxygen. */
export function toleranceFactor(hardiness: number): number {
  return HARDY_TOLERANCE ** hardiness;
}

/**
 * Hardiness clamped to [0.1, 0.95], so no offset makes an organism
 * invincible or instantly doomed.
 */
export function speciesHardiness(species: FishSpecies, offset = 0): number {
  return Math.max(0.1, Math.min(0.95, FISH_SPECIES_DATA[species].hardiness + offset));
}

export function fishHardiness(fish: Pick<Fish, 'species' | 'hardinessOffset'>): number {
  return speciesHardiness(fish.species, fish.hardinessOffset);
}

const TOXIN_EDGES: Readonly<ToxinVector> = { ammonia: FREE_AMMONIA_EDGE, nitrite: NITRITE_EDGE, nitrate: NITRATE_EDGE };

export function toxinEdges(hardiness: number): ToxinVector {
  const tolerance = toleranceFactor(hardiness);
  return mapToxins((t) => TOXIN_EDGES[t] * tolerance);
}

export function toxinEFolds(levels: ToxinVector, hardiness: number): ToxinVector {
  const edges = toxinEdges(hardiness);
  return mapToxins((t) => eFoldsPast(levels[t], edges[t]));
}

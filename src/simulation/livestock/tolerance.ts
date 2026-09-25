/**
 * Where water quality starts to harm a fish. Each edge is where the frailest
 * fish starts to suffer and where the matching alert fires; hardiness moves a
 * fish's own edge out along the concentration axis.
 */

import { eFoldsPast } from '../systems/vitality.js';

/** Free (unionized) NH₃, ppm. */
export const FREE_AMMONIA_EDGE = 0.02;

/** Nitrite as NO₂⁻, ppm. */
export const NITRITE_EDGE = 0.5;

/** Nitrate as NO₃⁻, ppm. */
export const NITRATE_EDGE = 80;

/** Dissolved oxygen, mg/L — harm below it. */
export const OXYGEN_EDGE = 4;

/** Dissolved oxygen at which the oxygen benefit is full, mg/L. */
export const OXYGEN_COMFORT = 6;

/** Dissolved oxygen no fish can extract below, mg/L. */
export const ANOXIA = 0.1;

/** How far past the edge a fish of hardiness 1 tolerates. */
export const HARDY_TOLERANCE = 2;

export function toleranceFactor(hardiness: number): number {
  return HARDY_TOLERANCE ** hardiness;
}

/** How many e-folds `value` stands under `edge`, the reading floored at anoxia. */
export function eFoldsUnder(value: number, edge: number): number {
  return eFoldsPast(edge, Math.max(value, ANOXIA));
}

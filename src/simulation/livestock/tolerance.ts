/**
 * Where water quality starts to harm a fish. Each edge is where the matching
 * alert fires; hardiness moves a fish's own edge out from it along the
 * concentration axis, so the alert leads every fish.
 */

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

/** How far out a fish of this hardiness carries each edge: × for a toxin, ÷ for oxygen. */
export function toleranceFactor(hardiness: number): number {
  return HARDY_TOLERANCE ** hardiness;
}

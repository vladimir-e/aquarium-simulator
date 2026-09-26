/**
 * The water-quality edges the alerts fire at. Each fish's own edge sits past
 * its alert's by `toleranceFactor(hardiness)`, so the alert leads every fish.
 */

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

/** How far past the edge a fish of hardiness 1 tolerates. */
export const HARDY_TOLERANCE = 2;

/** How far out a fish of this hardiness carries each edge: × for a toxin, ÷ for oxygen. */
export function toleranceFactor(hardiness: number): number {
  return HARDY_TOLERANCE ** hardiness;
}

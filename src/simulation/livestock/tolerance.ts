/**
 * Where water quality starts to harm a fish. Each is the edge its stressor
 * grows from and the line its alert fires at.
 */

/** Free (unionized) NH₃, ppm. */
export const HIGH_AMMONIA_THRESHOLD = 0.02;

/** Nitrite as NO₂⁻, ppm. */
export const HIGH_NITRITE_THRESHOLD = 0.5;

/** Nitrate as NO₃⁻, ppm. */
export const HIGH_NITRATE_THRESHOLD = 80;

/** Dissolved oxygen, mg/L — harm below it. */
export const LOW_OXYGEN_THRESHOLD = 4;

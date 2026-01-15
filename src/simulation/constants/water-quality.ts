/**
 * Water quality thresholds for nitrogen compounds.
 *
 * These thresholds define safe, warning, and danger levels for fish health.
 * Used by both the UI (color coding) and alert system.
 *
 * Threshold levels:
 * - SAFE: Normal levels, no concern
 * - WARNING: Elevated levels, monitor closely
 * - DANGER: Toxic levels, immediate action needed
 */

// ============================================================================
// Ammonia (NH3) Thresholds (ppm)
// ============================================================================
// Ammonia is highly toxic to fish even at low concentrations

/** Safe ammonia level - no concern (ppm) */
export const AMMONIA_SAFE_THRESHOLD = 0.02;

/** Warning ammonia level - elevated, monitor closely (ppm) */
export const AMMONIA_WARNING_THRESHOLD = 0.05;

/** Danger ammonia level - toxic to fish (ppm) */
export const AMMONIA_DANGER_THRESHOLD = 0.1;

// ============================================================================
// Nitrite (NO2) Thresholds (ppm)
// ============================================================================
// Nitrite is toxic but fish can tolerate higher levels than ammonia

/** Safe nitrite level - no concern (ppm) */
export const NITRITE_SAFE_THRESHOLD = 0.1;

/** Warning nitrite level - elevated, monitor closely (ppm) */
export const NITRITE_WARNING_THRESHOLD = 0.5;

/** Danger nitrite level - toxic to fish (ppm) */
export const NITRITE_DANGER_THRESHOLD = 1.0;

// ============================================================================
// Nitrate (NO3) Thresholds (ppm)
// ============================================================================
// Nitrate is the least toxic but accumulates over time

/** Safe nitrate level - no concern (ppm) */
export const NITRATE_SAFE_THRESHOLD = 20;

/** Warning nitrate level - elevated, consider water change (ppm) */
export const NITRATE_WARNING_THRESHOLD = 40;

/** Danger nitrate level - too high, water change needed (ppm) */
export const NITRATE_DANGER_THRESHOLD = 80;

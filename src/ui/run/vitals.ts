/**
 * Water-reading classification. Each of the nine readings maps its live value
 * to a status — which drives its marker, number and trend colour — using the
 * engine's own alert thresholds, so no surface invents a band.
 */

import {
  HIGH_AMMONIA_THRESHOLD,
  HIGH_NITRITE_THRESHOLD,
  HIGH_NITRATE_THRESHOLD,
  LOW_OXYGEN_THRESHOLD,
  HIGH_CO2_THRESHOLD,
  WATER_LEVEL_CRITICAL_THRESHOLD,
} from '../../simulation/alerts/index.js';
import type { Status } from './status.js';

export type VitalKey =
  | 'ammonia'
  | 'nitrite'
  | 'nitrate'
  | 'ph'
  | 'kh'
  | 'oxygen'
  | 'co2'
  | 'temperature'
  | 'water';

/** Nitrate below this (ppm) reads as depleted plant food. */
export const NITRATE_LOW_PPM = 5;
/** Dissolved oxygen at or above this (mg/L) reads as comfortable. */
const OXYGEN_OK_MGL = 6;
/** Water level below this (% of capacity) is the engine's critical threshold. */
const WATER_LOW_PCT = WATER_LEVEL_CRITICAL_THRESHOLD * 100;

/**
 * Classify a vital by its canonical value: toxins (ammonia/nitrite) alert over
 * threshold and read ok otherwise; nitrate is plant food, so it warns when
 * depleted and alerts when it climbs past the alert line; the physical readouts
 * (pH, KH, temp) stay quiet, oxygen and CO₂ colour only at their extremes, and
 * water tracks its critical-level threshold.
 */
export function classifyVital(key: VitalKey, value: number): Status {
  switch (key) {
    case 'ammonia':
      return value > HIGH_AMMONIA_THRESHOLD ? 'alert' : 'ok';
    case 'nitrite':
      return value > HIGH_NITRITE_THRESHOLD ? 'alert' : 'ok';
    case 'nitrate':
      if (value > HIGH_NITRATE_THRESHOLD) return 'alert';
      return value < NITRATE_LOW_PPM ? 'warn' : 'ok';
    case 'oxygen':
      if (value < LOW_OXYGEN_THRESHOLD) return 'warn';
      return value >= OXYGEN_OK_MGL ? 'ok' : 'neutral';
    case 'co2':
      return value > HIGH_CO2_THRESHOLD ? 'alert' : 'neutral';
    case 'water':
      return value < WATER_LOW_PCT ? 'warn' : 'ok';
    case 'ph':
    case 'kh':
    case 'temperature':
      return 'neutral';
  }
}

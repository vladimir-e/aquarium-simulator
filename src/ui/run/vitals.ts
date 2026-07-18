/**
 * Vitals-tile classification. Each of the eight tiles maps its live value to a
 * status (which drives the tile's border, number, sparkline colour, and pill)
 * using the engine's own alert thresholds — the strip never invents new bands.
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
  | 'oxygen'
  | 'co2'
  | 'temperature'
  | 'water';

export type VitalPill = 'HIGH' | 'LOW' | null;

export interface VitalClassification {
  status: Status;
  pill: VitalPill;
}

/** Nitrate below this (ppm) reads as depleted plant food — a LOW glance. */
export const NITRATE_LOW_PPM = 5;
/** Dissolved oxygen at or above this (mg/L) reads as comfortable. */
export const OXYGEN_OK_MGL = 6;
/** Water level below this (% of capacity) is the engine's critical threshold. */
export const WATER_LOW_PCT = WATER_LEVEL_CRITICAL_THRESHOLD * 100;

const HIGH: VitalClassification = { status: 'alert', pill: 'HIGH' };
const LOW: VitalClassification = { status: 'warn', pill: 'LOW' };
const OK: VitalClassification = { status: 'ok', pill: null };
const NEUTRAL: VitalClassification = { status: 'neutral', pill: null };

/**
 * Classify a vital by its canonical value: toxins (ammonia/nitrite) go coral
 * over threshold and green otherwise; nitrate is plant food, so it reads LOW
 * when depleted and HIGH when it climbs past the alert line; the physical
 * readouts (pH, temp) stay quiet, oxygen and CO₂ colour only at their extremes,
 * and water tracks its critical-level threshold.
 */
export function classifyVital(key: VitalKey, value: number): VitalClassification {
  switch (key) {
    case 'ammonia':
      return value > HIGH_AMMONIA_THRESHOLD ? HIGH : OK;
    case 'nitrite':
      return value > HIGH_NITRITE_THRESHOLD ? HIGH : OK;
    case 'nitrate':
      if (value > HIGH_NITRATE_THRESHOLD) return HIGH;
      return value < NITRATE_LOW_PPM ? LOW : OK;
    case 'oxygen':
      if (value < LOW_OXYGEN_THRESHOLD) return LOW;
      return value >= OXYGEN_OK_MGL ? OK : NEUTRAL;
    case 'co2':
      return value > HIGH_CO2_THRESHOLD ? HIGH : NEUTRAL;
    case 'water':
      return value < WATER_LOW_PCT ? LOW : OK;
    case 'ph':
    case 'temperature':
      return NEUTRAL;
  }
}

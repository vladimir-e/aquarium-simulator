/**
 * Water-reading classification. Each reading maps its live value
 * to a status — which drives its marker, number and trend colour — using the
 * engine's own alert thresholds, so no surface invents a band. Past a line the
 * engine alerts on for the fish's sake, a reading is an alert.
 */

import { HIGH_CO2_THRESHOLD } from '../../simulation/alerts/index.js';
import { NITRATE_EDGE, NITRITE_EDGE, OXYGEN_COMFORT, OXYGEN_EDGE } from '../../simulation/livestock/tolerance.js';
import type { Status } from './status.js';

export type VitalKey =
  | 'ammonia'
  | 'nitrite'
  | 'nitrate'
  | 'ph'
  | 'kh'
  | 'gh'
  | 'oxygen'
  | 'co2'
  | 'temperature'
  | 'water';

/**
 * Total ammonia against the line its free NH₃ alerts at — a line that moves
 * with pH and temperature, so it is read off the tank rather than fixed.
 */
export function classifyAmmonia(ppm: number, line: number): Status {
  return ppm > line ? 'alert' : 'ok';
}

/** The water level, % of capacity, against the line it alerts under. */
export function classifyLevel(percent: number, line: number): Status {
  return percent < line ? 'alert' : 'ok';
}

/**
 * Classify a vital by its canonical value: nitrite and nitrate alert over their
 * lines and read ok otherwise — what the plants make of nitrate is the nutrient
 * reading's to say; the physical readouts (pH, KH, GH, temp) stay quiet, and
 * oxygen and CO₂ colour only at their extremes.
 */
export function classifyVital(key: Exclude<VitalKey, 'ammonia' | 'water'>, value: number): Status {
  switch (key) {
    case 'nitrite':
      return value > NITRITE_EDGE ? 'alert' : 'ok';
    case 'nitrate':
      return value > NITRATE_EDGE ? 'alert' : 'ok';
    case 'oxygen':
      if (value < OXYGEN_EDGE) return 'alert';
      return value >= OXYGEN_COMFORT ? 'ok' : 'neutral';
    case 'co2':
      return value > HIGH_CO2_THRESHOLD ? 'alert' : 'neutral';
    case 'ph':
    case 'kh':
    case 'gh':
    case 'temperature':
      return 'neutral';
  }
}

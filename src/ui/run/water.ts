/**
 * The eight water readings, the two dissolved gases read beside them, and the
 * display scales they sit on. Scales are display ranges, never bands: every
 * band here is an engine threshold, and `classifyVital` alone decides colour.
 */

import type { SimulationState } from '../../simulation/index.js';
import {
  HIGH_AMMONIA_THRESHOLD,
  HIGH_NITRITE_THRESHOLD,
  HIGH_NITRATE_THRESHOLD,
  WATER_LEVEL_CRITICAL_THRESHOLD,
} from '../../simulation/alerts/index.js';
import { getDgh, getDkh, getPpm } from '../../simulation/resources/index.js';
import { getPh } from '../../simulation/core/carbonate.js';
import { getTemperatureUnit, toDisplayTemperature, type UnitSystem } from '../utils/units.js';
import type { Status } from './status.js';
import { classifyVital, NITRATE_LOW_PPM, type VitalKey } from './vitals.js';

export type WaterKey = Extract<
  VitalKey,
  'temperature' | 'ph' | 'kh' | 'gh' | 'water' | 'ammonia' | 'nitrite' | 'nitrate'
>;

export const WATER_KEYS: WaterKey[] = [
  'temperature',
  'ph',
  'kh',
  'gh',
  'water',
  'ammonia',
  'nitrite',
  'nitrate',
];

/** The two dissolved gases, read as a pair beneath the tank-condition readings. */
export type GasKey = Extract<VitalKey, 'oxygen' | 'co2'>;

export const GAS_KEYS: GasKey[] = ['oxygen', 'co2'];

/**
 * Track ranges — display scales, never bands. The toxins run well past their
 * alert line because a cycling tank does: the engine's own projection puts the
 * nitrite peak above 2 ppm on a modest bioload, so a track that stopped at the
 * threshold would peg through the whole event it exists to show.
 */
export const WATER_SCALE: Record<WaterKey, [min: number, max: number]> = {
  temperature: [15, 35],
  ph: [5.5, 8.5],
  kh: [0, 15],
  gh: [0, 25],
  water: [0, 100],
  ammonia: [0, 1],
  nitrite: [0, 5],
  nitrate: [0, 100],
};

/** Position of a value on its track, 0 (floor) to 1 (ceiling). */
export function readingAt(key: WaterKey, value: number): number {
  const [min, max] = WATER_SCALE[key];
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/** The eight canonical readings, in reading order: °C, pH, dKH, dGH, % of capacity, ppm. */
export function waterValues(state: SimulationState): Record<WaterKey, number> {
  const r = state.resources;
  const capacity = state.tank.capacity;
  return {
    temperature: r.temperature,
    ph: getPh(r),
    kh: getDkh(r.kh, r.water),
    gh: getDgh(r.gh, r.water),
    water: capacity > 0 ? (r.water / capacity) * 100 : 0,
    ammonia: getPpm(r.ammonia, r.water),
    nitrite: getPpm(r.nitrite, r.water),
    nitrate: getPpm(r.nitrate, r.water),
  };
}

/** A shaded region, in track fractions. */
export interface ReadingBand {
  from: number;
  to: number;
}

export interface WaterReading {
  key: WaterKey;
  name: string;
  unit: string;
  /** Canonical value — °C even when the reader is on Fahrenheit. */
  value: number;
  /** Value in the reader's units, formatted to the reading's precision. */
  text: string;
  status: Status;
  /** Position on the display scale, 0–1. */
  fill: number;
  /** The span the engine does not alert on; null where it has no thresholds. */
  band: ReadingBand | null;
}

const NAME: Record<VitalKey, string> = {
  temperature: 'Temp',
  ph: 'pH',
  kh: 'KH',
  gh: 'GH',
  water: 'Level',
  ammonia: 'NH₃',
  nitrite: 'NO₂',
  nitrate: 'NO₃',
  oxygen: 'O₂',
  co2: 'CO₂',
};

const DECIMALS: Record<WaterKey, number> = {
  temperature: 1,
  ph: 2,
  kh: 1,
  gh: 1,
  water: 0,
  ammonia: 3,
  nitrite: 3,
  nitrate: 1,
};

/** Temperature is the one reading whose value changes with the reader's units. */
function display(key: WaterKey, value: number, units: UnitSystem): number {
  return key === 'temperature' ? toDisplayTemperature(value, units) : value;
}

function band(key: WaterKey, from: number, to: number): ReadingBand {
  return { from: readingAt(key, from), to: readingAt(key, to) };
}

export function waterReadings(state: SimulationState, units: UnitSystem): WaterReading[] {
  const values = waterValues(state);
  const levelLimit = WATER_LEVEL_CRITICAL_THRESHOLD * 100;

  const spec: Record<WaterKey, Pick<WaterReading, 'unit' | 'band'>> = {
    temperature: { unit: getTemperatureUnit(units), band: null },
    ph: { unit: '', band: null },
    kh: { unit: 'dKH', band: null },
    gh: { unit: 'dGH', band: null },
    water: { unit: '%', band: band('water', levelLimit, 100) },
    ammonia: { unit: 'ppm', band: band('ammonia', 0, HIGH_AMMONIA_THRESHOLD) },
    nitrite: { unit: 'ppm', band: band('nitrite', 0, HIGH_NITRITE_THRESHOLD) },
    nitrate: { unit: 'ppm', band: band('nitrate', NITRATE_LOW_PPM, HIGH_NITRATE_THRESHOLD) },
  };

  return WATER_KEYS.map((key): WaterReading => {
    const value = values[key];
    return {
      key,
      name: NAME[key],
      value,
      text: display(key, value, units).toFixed(DECIMALS[key]),
      status: classifyVital(key, value),
      fill: readingAt(key, value),
      ...spec[key],
    };
  });
}

export interface GasReading {
  key: GasKey;
  name: string;
  /** Concentration in mg/L, which is the engine's own unit for both gases. */
  value: number;
  text: string;
  unit: string;
  status: Status;
}

/**
 * The dissolved gases, classified against the same engine thresholds the alerts
 * fire on.
 */
export function gasReadings(state: SimulationState): GasReading[] {
  const values: Record<GasKey, number> = {
    oxygen: state.resources.oxygen,
    co2: state.resources.co2,
  };

  return GAS_KEYS.map((key) => {
    const value = values[key];
    return {
      key,
      name: NAME[key],
      value,
      text: value.toFixed(1),
      unit: 'mg/L',
      status: classifyVital(key, value),
    };
  });
}

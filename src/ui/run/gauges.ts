/**
 * The six vertical gauges on the Water section, the two dissolved gases read
 * beside them, and the display scales the index rail's micro-meters share with
 * the gauges. Scales are display ranges, never bands: every band and hairline
 * here is an engine threshold or an engine setpoint, and `classifyVital` alone
 * decides colour.
 */

import {
  calculateCO2PHEffect,
  calculateHardscapeTargetPH,
  type SimulationState,
} from '../../simulation/index.js';
import {
  HIGH_AMMONIA_THRESHOLD,
  HIGH_NITRITE_THRESHOLD,
  HIGH_NITRATE_THRESHOLD,
  WATER_LEVEL_CRITICAL_THRESHOLD,
} from '../../simulation/alerts/index.js';
import type { PhConfig } from '../../simulation/config/index.js';
import { getPpm } from '../../simulation/resources/index.js';
import {
  formatTemperature,
  formatVolume,
  getTemperatureUnit,
  toDisplayTemperature,
  toDisplayVolume,
  type UnitSystem,
} from '../utils/units.js';
import { cycleWord } from './bacteria.js';
import type { RunSnapshot } from './history.js';
import type { Status } from './status.js';
import { classifyVital, NITRATE_LOW_PPM, type VitalKey } from './vitals.js';

export type GaugeKey = Extract<
  VitalKey,
  'temperature' | 'ph' | 'water' | 'ammonia' | 'nitrite' | 'nitrate'
>;

export const GAUGE_KEYS: GaugeKey[] = [
  'temperature',
  'ph',
  'water',
  'ammonia',
  'nitrite',
  'nitrate',
];

/** The two dissolved gases, read as a pair beneath the tank-condition gauges. */
export type GasKey = Extract<VitalKey, 'oxygen' | 'co2'>;

export const GAS_KEYS: GasKey[] = ['oxygen', 'co2'];

/**
 * Track ranges — display scales, never bands. The toxins run well past their
 * alert line because a cycling tank does: the engine's own projection puts the
 * nitrite peak above 2 ppm on a modest bioload, so a track that stopped at the
 * threshold would peg through the whole event it exists to show.
 */
const GAUGE_SCALE: Record<GaugeKey, [min: number, max: number]> = {
  temperature: [15, 35],
  ph: [5.5, 8.5],
  water: [0, 100],
  ammonia: [0, 1],
  nitrite: [0, 5],
  nitrate: [0, 100],
};

/** Position of a value on its track, 0 (floor) to 1 (ceiling). */
export function gaugeFill(key: GaugeKey, value: number): number {
  const [min, max] = GAUGE_SCALE[key];
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/** The six canonical readings, in gauge order: °C, pH, % of capacity, ppm. */
export function gaugeValues(state: SimulationState): Record<GaugeKey, number> {
  const r = state.resources;
  const capacity = state.tank.capacity;
  return {
    temperature: r.temperature,
    ph: r.ph,
    water: capacity > 0 ? (r.water / capacity) * 100 : 0,
    ammonia: getPpm(r.ammonia, r.water),
    nitrite: getPpm(r.nitrite, r.water),
    nitrate: getPpm(r.nitrate, r.water),
  };
}

/** A shaded region, in track fractions. */
export interface GaugeBand {
  from: number;
  to: number;
}

export interface GaugeTick {
  label: string;
  at: number;
}

/** The two panels the gauges are read in: tank conditions, then the cycle. */
export type GaugeGroup = 'water' | 'nitrogen';

export interface WaterGauge {
  key: GaugeKey;
  name: string;
  group: GaugeGroup;
  unit: string;
  /** Canonical value — °C even when the reader is on Fahrenheit. */
  value: number;
  /** Value in the reader's units, formatted to the gauge's precision. */
  text: string;
  status: Status;
  pill: 'HIGH' | 'LOW' | null;
  fill: number;
  ticks: GaugeTick[];
  /** The span the engine does not alert on; null where it has no thresholds. */
  band: GaugeBand | null;
  /** Hairlines at the band's edges. */
  limits: number[];
  /** Where the value is being driven — heater target, pH equilibrium. */
  setpoint: GaugeTick | null;
  caption: string;
  /** Last 24 samples of this reading, oldest first. */
  trace: number[];
}

const TRACE_HOURS = 24;

const NAME: Record<VitalKey, string> = {
  temperature: 'Temp',
  ph: 'pH',
  water: 'Level',
  ammonia: 'NH₃',
  nitrite: 'NO₂',
  nitrate: 'NO₃',
  oxygen: 'O₂',
  co2: 'CO₂',
};

const GROUP: Record<GaugeKey, GaugeGroup> = {
  temperature: 'water',
  ph: 'water',
  water: 'water',
  ammonia: 'nitrogen',
  nitrite: 'nitrogen',
  nitrate: 'nitrogen',
};

const TRACE: Record<GaugeKey, (s: RunSnapshot) => number> = {
  temperature: (s) => s.temperature,
  ph: (s) => s.ph,
  water: (s) => s.waterPct,
  ammonia: (s) => s.ammonia,
  nitrite: (s) => s.nitrite,
  nitrate: (s) => s.nitrate,
};

const DECIMALS: Record<GaugeKey, number> = {
  temperature: 1,
  ph: 2,
  water: 0,
  ammonia: 3,
  nitrite: 3,
  nitrate: 1,
};

/** The axis carries the scale, not the reading — it drops a digit to stay legible. */
const AXIS_DECIMALS: Record<GaugeKey, number> = {
  temperature: 0,
  ph: 1,
  water: 0,
  ammonia: 2,
  nitrite: 1,
  nitrate: 0,
};

/** Temperature is the one reading whose axis and value change with the reader's units. */
function display(key: GaugeKey, value: number, units: UnitSystem): number {
  return key === 'temperature' ? toDisplayTemperature(value, units) : value;
}

function tickAt(key: GaugeKey, value: number, units: UnitSystem): GaugeTick {
  return { label: display(key, value, units).toFixed(AXIS_DECIMALS[key]), at: gaugeFill(key, value) };
}

/** Scale ends plus every marked value, top-first — so no hairline goes unlabelled. */
function axis(key: GaugeKey, marks: number[], units: UnitSystem): GaugeTick[] {
  const [min, max] = GAUGE_SCALE[key];
  const values = [...new Set([max, ...marks, min])].sort((a, b) => b - a);
  return values.map((v) => tickAt(key, v, units));
}

function band(key: GaugeKey, from: number, to: number): GaugeBand {
  return { from: gaugeFill(key, from), to: gaugeFill(key, to) };
}

/** Change since the previous sample, phrased for a caption; empty until two exist. */
function trend(trace: number[], decimals: number): string {
  if (trace.length < 2) return '';
  const delta = trace[trace.length - 1] - trace[trace.length - 2];
  if (Math.abs(delta) < 0.5 / 10 ** decimals) return ' · steady';
  return ` · ${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(decimals)}/h`;
}

/** The pH the drift system is pulling toward: scape equilibrium shifted by CO₂. */
function phSetpoint(state: SimulationState, config: PhConfig): number {
  return (
    calculateHardscapeTargetPH(state.equipment.hardscape.items, config) +
    calculateCO2PHEffect(state.resources.co2, config)
  );
}

function temperatureCaption(state: SimulationState, units: UnitSystem): string {
  const { heater } = state.equipment;
  if (!heater.enabled) {
    return `no heater · room ${formatTemperature(state.environment.roomTemperature, units, 0)}`;
  }
  return `heater holds ${formatTemperature(heater.targetTemperature, units, 0)}`;
}

export interface WaterGaugeInput {
  state: SimulationState;
  phConfig: PhConfig;
  history: RunSnapshot[];
  units: UnitSystem;
}

export function waterGauges({
  state,
  phConfig,
  history,
  units,
}: WaterGaugeInput): WaterGauge[] {
  const values = gaugeValues(state);
  const recent = history.slice(-TRACE_HOURS);
  const capacity = state.tank.capacity;
  const phTarget = phSetpoint(state, phConfig);
  const levelLimit = WATER_LEVEL_CRITICAL_THRESHOLD * 100;

  type GaugeSpec = Pick<
    WaterGauge,
    'unit' | 'band' | 'limits' | 'setpoint' | 'ticks' | 'caption'
  >;

  const spec: Record<GaugeKey, GaugeSpec> = {
    temperature: {
      unit: getTemperatureUnit(units),
      band: null,
      limits: [],
      setpoint: state.equipment.heater.enabled
        ? tickAt('temperature', state.equipment.heater.targetTemperature, units)
        : null,
      ticks: axis(
        'temperature',
        state.equipment.heater.enabled ? [state.equipment.heater.targetTemperature] : [],
        units
      ),
      caption: temperatureCaption(state, units),
    },
    ph: {
      unit: '',
      band: null,
      limits: [],
      setpoint: tickAt('ph', phTarget, units),
      ticks: axis('ph', [phTarget], units),
      caption: `drifting to ${phTarget.toFixed(2)} · tap ${state.environment.tapWaterPH.toFixed(1)}`,
    },
    water: {
      unit: '%',
      band: band('water', levelLimit, 100),
      limits: [gaugeFill('water', levelLimit)],
      setpoint: null,
      ticks: axis('water', [levelLimit], units),
      caption: `${toDisplayVolume(state.resources.water, units).toFixed(1)} / ${formatVolume(capacity, units, 0)} · ATO ${state.equipment.ato.enabled ? 'on' : 'off'}`,
    },
    ammonia: {
      unit: 'ppm',
      band: band('ammonia', 0, HIGH_AMMONIA_THRESHOLD),
      limits: [gaugeFill('ammonia', HIGH_AMMONIA_THRESHOLD)],
      setpoint: null,
      ticks: axis('ammonia', [HIGH_AMMONIA_THRESHOLD], units),
      caption: `safe ≤ ${HIGH_AMMONIA_THRESHOLD.toFixed(2)}${trend(recent.map(TRACE.ammonia), 3)}`,
    },
    nitrite: {
      unit: 'ppm',
      band: band('nitrite', 0, HIGH_NITRITE_THRESHOLD),
      limits: [gaugeFill('nitrite', HIGH_NITRITE_THRESHOLD)],
      setpoint: null,
      ticks: axis('nitrite', [HIGH_NITRITE_THRESHOLD], units),
      caption: `safe ≤ ${HIGH_NITRITE_THRESHOLD.toFixed(2)}${trend(recent.map(TRACE.nitrite), 3)}`,
    },
    nitrate: {
      unit: 'ppm',
      band: band('nitrate', NITRATE_LOW_PPM, HIGH_NITRATE_THRESHOLD),
      limits: [gaugeFill('nitrate', NITRATE_LOW_PPM), gaugeFill('nitrate', HIGH_NITRATE_THRESHOLD)],
      setpoint: null,
      ticks: axis('nitrate', [NITRATE_LOW_PPM, HIGH_NITRATE_THRESHOLD], units),
      caption: `safe ${NITRATE_LOW_PPM}–${HIGH_NITRATE_THRESHOLD}${trend(recent.map(TRACE.nitrate), 1)}`,
    },
  };

  return GAUGE_KEYS.map((key): WaterGauge => {
    const value = values[key];
    const { status, pill } = classifyVital(key, value);
    return {
      key,
      name: NAME[key],
      group: GROUP[key],
      value,
      text: display(key, value, units).toFixed(DECIMALS[key]),
      status,
      pill,
      fill: gaugeFill(key, value),
      trace: recent.map(TRACE[key]),
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
  pill: 'HIGH' | 'LOW' | null;
}

/**
 * The dissolved gases, classified against the same engine thresholds the alerts
 * fire on. They carry no track: neither has a setpoint or a safe band to draw,
 * and low oxygen is worth reading long before it is worth a seventh gauge.
 */
export function gasReadings(state: SimulationState): GasReading[] {
  const values: Record<GasKey, number> = {
    oxygen: state.resources.oxygen,
    co2: state.resources.co2,
  };

  return GAS_KEYS.map((key) => {
    const value = values[key];
    const { status, pill } = classifyVital(key, value);
    return { key, name: NAME[key], value, text: value.toFixed(1), unit: 'mg/L', status, pill };
  });
}

export interface WaterAlert {
  text: string;
  status: Status;
}

/** The shape every water reading is judged on, gauge or gas. */
export interface VitalReading {
  key: VitalKey;
  value: number;
  status: Status;
}

/**
 * The one thing to say about the water right now. Shared by the index rail and
 * the section header so they can never name different problems — down to the
 * reading's name, which comes from here rather than from either caller. An
 * uncycled tank outranks a soft warning: quiet now, about to stop being quiet.
 */
export function waterAlert(readings: VitalReading[], cycled: boolean): WaterAlert | null {
  const named = (r: VitalReading): WaterAlert => ({
    text: `${NAME[r.key]} ${(classifyVital(r.key, r.value).pill ?? '').toLowerCase()}`.trim(),
    status: r.status,
  });

  const alert = readings.find((r) => r.status === 'alert');
  if (alert) return named(alert);
  if (!cycled) return { text: cycleWord(cycled), status: 'neutral' };
  const warn = readings.find((r) => r.status === 'warn');
  return warn ? named(warn) : null;
}

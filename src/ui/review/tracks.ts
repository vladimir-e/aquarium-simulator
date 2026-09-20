/**
 * The four tracks the spine and History stack over one shared x-axis: which
 * vitals each draws, and the series extraction the SVG renders from. Each
 * series is normalised to its own extent — NH₃ (~0.1 ppm) and NO₃ (~40 ppm)
 * share a track but not a scale, so every line reads its own trend, and the
 * extent is stated in the caption rather than left implied.
 */

import { DECIMALS } from '../readings/index.js';
import type { RunSnapshot } from '../run/index.js';
import type { AlertKind } from './category.js';

export interface TrackSeries {
  key: string;
  label: string;
  /** Precision the caption reads this line to — a reading's own, where it has one. */
  decimals: number;
  accessor: (snapshot: RunSnapshot) => number;
}

export interface TrackDef {
  id: string;
  title: string;
  /** Terse label for the phone's chip row. */
  shortLabel: string;
  series: TrackSeries[];
  /** Alert kinds this track's data explains. */
  alertKinds: AlertKind[];
}

export const TRACKS: TrackDef[] = [
  {
    id: 'nitrogen',
    title: 'Nitrogen',
    shortLabel: 'cycle',
    alertKinds: ['ammonia', 'nitrite', 'nitrate'],
    series: [
      { key: 'ammonia', label: 'NH₃', decimals: DECIMALS.ammonia, accessor: (s) => s.ammonia },
      { key: 'nitrite', label: 'NO₂', decimals: DECIMALS.nitrite, accessor: (s) => s.nitrite },
      { key: 'nitrate', label: 'NO₃', decimals: DECIMALS.nitrate, accessor: (s) => s.nitrate },
    ],
  },
  {
    id: 'ph-co2',
    title: 'pH & CO₂',
    shortLabel: 'pH·CO₂',
    alertKinds: ['co2'],
    series: [
      { key: 'ph', label: 'pH', decimals: DECIMALS.ph, accessor: (s) => s.ph },
      { key: 'co2', label: 'CO₂', decimals: DECIMALS.co2, accessor: (s) => s.co2 },
    ],
  },
  {
    id: 'o2-temp',
    title: 'O₂, temp & level',
    shortLabel: 'O₂·temp',
    alertKinds: ['oxygen', 'water'],
    series: [
      { key: 'oxygen', label: 'O₂', decimals: DECIMALS.oxygen, accessor: (s) => s.oxygen },
      { key: 'temperature', label: 'temp', decimals: DECIMALS.temperature, accessor: (s) => s.temperature },
      { key: 'waterPct', label: 'level', decimals: DECIMALS.level, accessor: (s) => s.waterPct },
    ],
  },
  {
    id: 'population',
    // `AlgaeState.mass` is a percentage despite the name, as `Plant.size` is.
    title: 'Populations',
    shortLabel: 'pop.',
    alertKinds: ['algae', 'plant'],
    series: [
      { key: 'fishCount', label: 'fish', decimals: 0, accessor: (s) => s.fishCount },
      { key: 'fryCount', label: 'fry', decimals: 0, accessor: (s) => s.fryCount },
      { key: 'plantAvgSize', label: 'plants', decimals: 0, accessor: (s) => s.plantAvgSize },
      { key: 'algaeMass', label: 'algae', decimals: DECIMALS.algae, accessor: (s) => s.algaeMass },
    ],
  },
];

/** Series colours, by position within their track — never a status colour. */
export const TRACK_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
];

export interface TrackPair {
  id: string;
  label: string;
  tracks: TrackDef[];
}

/**
 * A phone has room for two tracks at a time, so the four are dealt into two
 * pairs the chip row picks between — the stocks a keeper acts on first, then
 * the dissolved side of the same tank.
 */
export const TRACK_PAIRS: TrackPair[] = [
  { id: 'life', label: 'cycle & life', tracks: [TRACKS[0], TRACKS[3]] },
  { id: 'gases', label: 'gases & water', tracks: [TRACKS[1], TRACKS[2]] },
];

export interface Extent {
  min: number;
  max: number;
}

export function seriesExtent(values: number[]): Extent {
  if (values.length === 0) return { min: 0, max: 0 };
  let min = values[0];
  let max = values[0];
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

/**
 * Relative floor on a series' span: variation under this fraction of the
 * series' own magnitude reads as flat, so float micro-noise on a steady line
 * (a heater holding 25 °C) doesn't stretch to full-height volatility.
 */
const SPAN_EPSILON = 1e-3;

/** Value → 0..1 within its extent; a flat (or near-flat) series sits centred. */
export function normalize(value: number, extent: Extent): number {
  const span = extent.max - extent.min;
  const floor = Math.max(Math.abs(extent.min), Math.abs(extent.max), 1) * SPAN_EPSILON;
  if (span <= floor) return 0.5;
  return (value - extent.min) / span;
}

/** One line of a track: its colour, its samples, and the extent it is drawn to. */
export interface TrackLine {
  series: TrackSeries;
  color: string;
  values: number[];
  extent: Extent;
}

/** The track's lines over a window of history, in the order they are drawn. */
export function trackLines(history: RunSnapshot[], def: TrackDef): TrackLine[] {
  return def.series.map((series, i) => {
    const values = history.map(series.accessor);
    return {
      series,
      color: TRACK_COLORS[i % TRACK_COLORS.length],
      values,
      extent: seriesExtent(values),
    };
  });
}

/** Snapshot at an exact tick — what the captions read their values off. */
export function snapshotAtTick(history: RunSnapshot[], tick: number): RunSnapshot | null {
  return history.find((s) => s.tick === tick) ?? null;
}

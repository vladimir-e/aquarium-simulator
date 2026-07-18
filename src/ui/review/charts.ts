/**
 * The four Review charts: which vitals each frame draws, the per-series colours
 * for both themes (brief §7), and the pure series-extraction the SVG renders
 * from. Each series is normalised to its own extent — NH₃ (~0.1 ppm) and NO₃
 * (~40 ppm) share a frame but not a scale, so every line reads its own trend.
 */

import type { ResolvedTheme } from '../hooks/useTheme.js';
import type { RunSnapshot } from '../run/index.js';
import type { AlertKind } from './category.js';

export interface ChartSeries {
  key: string;
  label: string;
  accessor: (snapshot: RunSnapshot) => number;
  light: string;
  dark: string;
}

export interface ChartDef {
  id: string;
  title: string;
  series: ChartSeries[];
  /** Alert kinds this chart's data explains — its baseline markers filter to these. */
  alertKinds: AlertKind[];
}

export const REVIEW_CHARTS: ChartDef[] = [
  {
    id: 'nitrogen',
    title: 'Nitrogen cycle',
    alertKinds: ['ammonia', 'nitrite', 'nitrate'],
    series: [
      { key: 'ammonia', label: 'NH₃', accessor: (s) => s.ammonia, light: '#B34935', dark: '#EE816D' },
      { key: 'nitrite', label: 'NO₂', accessor: (s) => s.nitrite, light: '#A7732A', dark: '#F4B765' },
      { key: 'nitrate', label: 'NO₃', accessor: (s) => s.nitrate, light: '#4A8A47', dark: '#94D97B' },
    ],
  },
  {
    id: 'ph-co2',
    title: 'pH & CO₂',
    alertKinds: ['co2'],
    series: [
      { key: 'ph', label: 'pH', accessor: (s) => s.ph, light: '#6D5BA8', dark: '#A99BE0' },
      { key: 'co2', label: 'CO₂', accessor: (s) => s.co2, light: '#3C7869', dark: '#77D5C4' },
    ],
  },
  {
    id: 'o2-temp',
    title: 'O₂ / temp',
    alertKinds: ['oxygen'],
    series: [
      { key: 'oxygen', label: 'O₂', accessor: (s) => s.oxygen, light: '#3E6DA8', dark: '#7FB0E8' },
      { key: 'temperature', label: 'temp', accessor: (s) => s.temperature, light: '#8A7A5E', dark: '#C9B48A' },
    ],
  },
  {
    id: 'population',
    title: 'Population & plant mass',
    alertKinds: ['algae', 'plant'],
    series: [
      { key: 'fishCount', label: 'fish', accessor: (s) => s.fishCount, light: '#4A8A47', dark: '#94D97B' },
      { key: 'plantAvgSize', label: 'plants', accessor: (s) => s.plantAvgSize, light: '#356B3E', dark: '#6FC271' },
      { key: 'algaeMass', label: 'algae', accessor: (s) => s.algaeMass, light: '#7A8B3F', dark: '#B4C56A' },
    ],
  },
];

export function seriesColor(series: ChartSeries, theme: ResolvedTheme): string {
  return theme === 'dark' ? series.dark : series.light;
}

export function seriesValues(history: RunSnapshot[], accessor: ChartSeries['accessor']): number[] {
  return history.map(accessor);
}

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

/** Value → 0..1 within its extent; a flat series sits centred. */
export function normalize(value: number, extent: Extent): number {
  const span = extent.max - extent.min;
  if (span <= 0) return 0.5;
  return (value - extent.min) / span;
}

/** Snapshot at an exact tick (for the guide's per-series value dots). */
export function snapshotAtTick(history: RunSnapshot[], tick: number): RunSnapshot | null {
  return history.find((s) => s.tick === tick) ?? null;
}

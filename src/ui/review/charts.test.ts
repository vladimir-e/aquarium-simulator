import { describe, it, expect } from 'vitest';
import {
  REVIEW_CHARTS,
  seriesColor,
  seriesValues,
  seriesExtent,
  normalize,
  snapshotAtTick,
} from './charts';
import type { RunSnapshot } from '../run/index.js';

function snap(tick: number, over: Partial<RunSnapshot> = {}): RunSnapshot {
  return {
    tick,
    ammonia: 0,
    nitrite: 0,
    nitrate: 0,
    ph: 7,
    oxygen: 8,
    co2: 5,
    temperature: 25,
    waterPct: 100,
    fishCount: 0,
    plantAvgSize: 0,
    algaeMass: 0,
    food: 0,
    ...over,
  };
}

describe('REVIEW_CHARTS', () => {
  it('covers the four mockup charts with distinct series keys', () => {
    expect(REVIEW_CHARTS.map((c) => c.id)).toEqual(['nitrogen', 'ph-co2', 'o2-temp', 'population']);
    const keys = REVIEW_CHARTS.flatMap((c) => c.series.map((s) => s.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every accessor reads a real snapshot field', () => {
    const s = snap(0, { ammonia: 0.1, nitrate: 40, co2: 12, oxygen: 6, fishCount: 3, algaeMass: 20 });
    for (const chart of REVIEW_CHARTS) {
      for (const series of chart.series) {
        expect(Number.isFinite(series.accessor(s))).toBe(true);
      }
    }
  });
});

describe('seriesColor', () => {
  it('picks the theme-specific hex', () => {
    const nh3 = REVIEW_CHARTS[0].series[0];
    expect(seriesColor(nh3, 'light')).toBe('#B34935');
    expect(seriesColor(nh3, 'dark')).toBe('#EE816D');
  });
});

describe('seriesValues', () => {
  it('extracts one value per snapshot', () => {
    const history = [snap(0, { ammonia: 0.02 }), snap(1, { ammonia: 0.05 }), snap(2, { ammonia: 0.11 })];
    expect(seriesValues(history, (s) => s.ammonia)).toEqual([0.02, 0.05, 0.11]);
  });
});

describe('seriesExtent', () => {
  it('finds min and max', () => {
    expect(seriesExtent([0.05, 0.02, 0.11, 0.03])).toEqual({ min: 0.02, max: 0.11 });
  });

  it('is zeroed for an empty series', () => {
    expect(seriesExtent([])).toEqual({ min: 0, max: 0 });
  });
});

describe('normalize', () => {
  it('maps a value to 0..1 within its extent', () => {
    const extent = { min: 0, max: 10 };
    expect(normalize(0, extent)).toBe(0);
    expect(normalize(10, extent)).toBe(1);
    expect(normalize(5, extent)).toBe(0.5);
  });

  it('centres a flat series', () => {
    expect(normalize(22, { min: 22, max: 22 })).toBe(0.5);
  });

  it('centres a near-flat series whose span is float micro-noise', () => {
    // A heater holding 25°C with ±0.0001 jitter should read flat, not full-height.
    const extent = { min: 25, max: 25.0002 };
    expect(normalize(25.0002, extent)).toBe(0.5);
    expect(normalize(25, extent)).toBe(0.5);
  });

  it('still resolves a genuine small trend above the noise floor', () => {
    const extent = { min: 6.5, max: 7.0 };
    expect(normalize(6.75, extent)).toBeCloseTo(0.5);
    expect(normalize(7.0, extent)).toBe(1);
  });
});

describe('snapshotAtTick', () => {
  const history = [snap(10), snap(11), snap(12)];

  it('finds the snapshot at an exact tick', () => {
    expect(snapshotAtTick(history, 11)?.tick).toBe(11);
  });

  it('returns null when the tick is absent', () => {
    expect(snapshotAtTick(history, 99)).toBeNull();
  });
});

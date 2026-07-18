import { describe, it, expect } from 'vitest';
import { sliceHistory, windowRange, sliceLogs, WINDOW_TICKS } from './window';
import type { RunSnapshot } from '../run/index.js';
import { createLog, type LogEntry } from '../../simulation/index.js';

function snap(tick: number): RunSnapshot {
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
  };
}

/** Contiguous history [0..last], one snapshot per tick. */
function history(last: number): RunSnapshot[] {
  return Array.from({ length: last + 1 }, (_, i) => snap(i));
}

describe('sliceHistory', () => {
  it('returns the whole buffer for the run window', () => {
    const h = history(200);
    expect(sliceHistory(h, 'run')).toBe(h);
  });

  it('keeps the trailing span for bounded windows', () => {
    const h = history(200); // ticks 0..200
    const day = sliceHistory(h, '24h');
    expect(day).toHaveLength(WINDOW_TICKS['24h']);
    expect(day[0].tick).toBe(177);
    expect(day[day.length - 1].tick).toBe(200);

    const week = sliceHistory(h, '7d');
    expect(week).toHaveLength(WINDOW_TICKS['7d']);
    expect(week[0].tick).toBe(33);
  });

  it('degrades to the whole buffer when it is shorter than the window', () => {
    const h = history(5); // 6 snapshots
    expect(sliceHistory(h, '24h')).toHaveLength(6);
    expect(sliceHistory(h, '7d')).toHaveLength(6);
  });
});

describe('windowRange', () => {
  it('spans the whole run buffer for run', () => {
    expect(windowRange(history(36), 'run')).toEqual({ minTick: 0, maxTick: 36 });
  });

  it('spans the trailing window for 24h', () => {
    expect(windowRange(history(36), '24h')).toEqual({ minTick: 13, maxTick: 36 });
  });

  it('is null for empty history', () => {
    expect(windowRange([], 'run')).toBeNull();
    expect(windowRange([], '24h')).toBeNull();
  });

  it('collapses to one tick for a single-entry buffer', () => {
    expect(windowRange([snap(0)], 'run')).toEqual({ minTick: 0, maxTick: 0 });
  });
});

describe('sliceLogs', () => {
  const logs: LogEntry[] = [
    createLog(0, 'simulation', 'info', 'created'),
    createLog(10, 'user', 'info', 'fed'),
    createLog(30, 'nitrogen-cycle', 'warning', 'High ammonia level: 0.2 ppm'),
    createLog(36, 'simulation', 'info', 'hatched', 'eggs-hatched', 4),
  ];

  it('keeps only lines inside the range', () => {
    expect(sliceLogs(logs, { minTick: 12, maxTick: 36 }).map((l) => l.tick)).toEqual([30, 36]);
  });

  it('includes lines exactly on the boundaries', () => {
    expect(sliceLogs(logs, { minTick: 10, maxTick: 30 }).map((l) => l.tick)).toEqual([10, 30]);
  });

  it('returns everything when there is no range', () => {
    expect(sliceLogs(logs, null)).toHaveLength(4);
  });
});

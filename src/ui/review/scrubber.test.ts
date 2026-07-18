import { describe, it, expect } from 'vitest';
import {
  clampTick,
  tickToFraction,
  fractionToTick,
  nearestLogIndexAtOrBefore,
  alertMarkers,
} from './scrubber';
import { createLog, type LogEntry } from '../../simulation/index.js';

describe('clampTick', () => {
  it('holds a tick inside the domain', () => {
    expect(clampTick(5, 0, 36)).toBe(5);
    expect(clampTick(-3, 0, 36)).toBe(0);
    expect(clampTick(99, 0, 36)).toBe(36);
  });
});

describe('tickToFraction', () => {
  it('maps ticks across the domain to 0..1', () => {
    expect(tickToFraction(0, 0, 36)).toBe(0);
    expect(tickToFraction(36, 0, 36)).toBe(1);
    expect(tickToFraction(18, 0, 36)).toBeCloseTo(0.5);
  });

  it('handles a non-zero-based domain', () => {
    expect(tickToFraction(12, 12, 36)).toBe(0);
    expect(tickToFraction(24, 12, 36)).toBeCloseTo(0.5);
  });

  it('clamps out-of-range ticks', () => {
    expect(tickToFraction(-5, 0, 36)).toBe(0);
    expect(tickToFraction(50, 0, 36)).toBe(1);
  });

  it('pins to the start for a zero-width domain', () => {
    expect(tickToFraction(5, 5, 5)).toBe(0);
  });
});

describe('fractionToTick', () => {
  it('maps 0..1 back to the nearest whole tick', () => {
    expect(fractionToTick(0, 0, 36)).toBe(0);
    expect(fractionToTick(1, 0, 36)).toBe(36);
    expect(fractionToTick(0.5, 0, 36)).toBe(18);
  });

  it('rounds to the closest tick and clamps the fraction', () => {
    expect(fractionToTick(0.51, 0, 36)).toBe(18);
    expect(fractionToTick(-0.2, 0, 36)).toBe(0);
    expect(fractionToTick(1.4, 0, 36)).toBe(36);
  });

  it('returns the single tick for a zero-width domain', () => {
    expect(fractionToTick(0.7, 8, 8)).toBe(8);
  });
});

describe('nearestLogIndexAtOrBefore', () => {
  const logs: LogEntry[] = [
    createLog(0, 'simulation', 'info', 'created'),
    createLog(10, 'user', 'info', 'fed'),
    createLog(30, 'nitrogen-cycle', 'warning', 'High ammonia level: 0.2 ppm'),
  ];

  it('lands on the last line at or before the tick', () => {
    expect(nearestLogIndexAtOrBefore(logs, 30)).toBe(2);
    expect(nearestLogIndexAtOrBefore(logs, 20)).toBe(1);
    expect(nearestLogIndexAtOrBefore(logs, 10)).toBe(1);
  });

  it('returns -1 before the first line and on an empty log', () => {
    expect(nearestLogIndexAtOrBefore(logs, -1)).toBe(-1);
    expect(nearestLogIndexAtOrBefore([], 5)).toBe(-1);
  });
});

describe('alertMarkers', () => {
  const logs: LogEntry[] = [
    createLog(5, 'user', 'info', 'fed'),
    createLog(10, 'nitrogen-cycle', 'warning', 'High ammonia level: 0.2 ppm'),
    createLog(20, 'gas-exchange', 'warning', 'Low oxygen level: 3.5 mg/L'),
    createLog(40, 'algae', 'warning', 'High algae level: 85'),
  ];

  it('collects classifiable alerts across the whole log', () => {
    expect(alertMarkers(logs, null)).toEqual([
      { tick: 10, kind: 'ammonia' },
      { tick: 20, kind: 'oxygen' },
      { tick: 40, kind: 'algae' },
    ]);
  });

  it('keeps only alerts inside the window range', () => {
    expect(alertMarkers(logs, { minTick: 12, maxTick: 40 })).toEqual([
      { tick: 20, kind: 'oxygen' },
      { tick: 40, kind: 'algae' },
    ]);
  });
});

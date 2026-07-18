import { describe, it, expect } from 'vitest';
import {
  emptyAggregates,
  accrueLogs,
  accrueTicks,
  accrueWaterChanged,
} from './aggregates';
import { createLog, type LogEntry } from '../../simulation/index.js';

describe('emptyAggregates', () => {
  it('starts every counter at zero', () => {
    expect(emptyAggregates()).toEqual({
      ticks: 0,
      deaths: 0,
      births: 0,
      frySold: 0,
      alerts: 0,
      waterChangedL: 0,
    });
  });
});

describe('accrueLogs', () => {
  it('counts a death per fish-died entry', () => {
    const logs = [
      createLog(1, 'simulation', 'warning', 'A died', 'fish-died'),
      createLog(2, 'simulation', 'warning', 'B died', 'fish-died'),
    ];
    expect(accrueLogs(emptyAggregates(), logs).deaths).toBe(2);
  });

  it('sums births from spawn and hatch counts', () => {
    const logs = [
      createLog(1, 'simulation', 'info', 'gave birth to 4 fry', 'fish-spawned', 4),
      createLog(2, 'simulation', 'info', '25 eggs hatched', 'eggs-hatched', 25),
    ];
    expect(accrueLogs(emptyAggregates(), logs).births).toBe(29);
  });

  it('sums fry sold from the entry count', () => {
    const logs = [createLog(3, 'user', 'info', 'Sold 100 fry', 'fry-sold', 100)];
    expect(accrueLogs(emptyAggregates(), logs).frySold).toBe(100);
  });

  it('falls back to one when a lifecycle entry omits a count', () => {
    const logs = [createLog(1, 'simulation', 'info', 'gave birth', 'fish-spawned')];
    expect(accrueLogs(emptyAggregates(), logs).births).toBe(1);
  });

  it('counts warning entries without a lifecycle event as alerts', () => {
    const logs = [
      createLog(1, 'nitrogen-cycle', 'warning', 'high ammonia'),
      createLog(2, 'gas-exchange', 'warning', 'low oxygen'),
    ];
    expect(accrueLogs(emptyAggregates(), logs).alerts).toBe(2);
  });

  it('does not count a fish death as an alert', () => {
    const logs = [createLog(1, 'simulation', 'warning', 'A died', 'fish-died')];
    const result = accrueLogs(emptyAggregates(), logs);
    expect(result.alerts).toBe(0);
    expect(result.deaths).toBe(1);
  });

  it('counts a plant death as an alert, not a fish death', () => {
    const logs = [createLog(1, 'simulation', 'warning', 'Java Fern died', 'plant-died')];
    const result = accrueLogs(emptyAggregates(), logs);
    expect(result.alerts).toBe(1);
    expect(result.deaths).toBe(0);
  });

  it('ignores info entries that carry no lifecycle event', () => {
    const logs = [createLog(1, 'user', 'info', 'Heater enabled')];
    expect(accrueLogs(emptyAggregates(), logs)).toMatchObject({
      deaths: 0,
      births: 0,
      frySold: 0,
      alerts: 0,
    });
  });

  it('folds a mixed batch and leaves the input untouched', () => {
    const start = emptyAggregates();
    const logs: LogEntry[] = [
      createLog(1, 'simulation', 'warning', 'A died', 'fish-died'),
      createLog(1, 'simulation', 'info', '25 eggs hatched', 'eggs-hatched', 25),
      createLog(1, 'user', 'info', 'Sold 25 fry', 'fry-sold', 25),
      createLog(1, 'nitrogen-cycle', 'warning', 'high nitrite'),
      createLog(1, 'user', 'info', 'Fed fish'),
    ];
    const result = accrueLogs(start, logs);
    expect(result).toMatchObject({ deaths: 1, births: 25, frySold: 25, alerts: 1 });
    expect(start.deaths).toBe(0);
    expect(result).not.toBe(start);
  });
});

describe('accrueTicks', () => {
  it('advances the run length', () => {
    expect(accrueTicks(emptyAggregates(), 6).ticks).toBe(6);
    expect(accrueTicks(accrueTicks(emptyAggregates(), 6), 1).ticks).toBe(7);
  });

  it('ignores non-positive deltas', () => {
    const start = accrueTicks(emptyAggregates(), 5);
    expect(accrueTicks(start, 0)).toBe(start);
    expect(accrueTicks(start, -3)).toBe(start);
  });
});

describe('accrueWaterChanged', () => {
  it('accumulates liters changed', () => {
    const once = accrueWaterChanged(emptyAggregates(), 10);
    expect(once.waterChangedL).toBe(10);
    expect(accrueWaterChanged(once, 2.5).waterChangedL).toBe(12.5);
  });

  it('ignores non-positive volumes', () => {
    const start = accrueWaterChanged(emptyAggregates(), 4);
    expect(accrueWaterChanged(start, 0)).toBe(start);
    expect(accrueWaterChanged(start, -1)).toBe(start);
  });
});

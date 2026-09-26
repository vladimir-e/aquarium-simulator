import { describe, it, expect } from 'vitest';
import { runLength, runTallies } from './summary';
import type { RunAggregates } from '../run/index.js';

const RUN: RunAggregates = {
  ticks: 1622,
  deaths: 2,
  births: 18,
  alerts: 6,
  waterChangedL: 340,
};

describe('runTallies', () => {
  it('reads each tally straight off the aggregates', () => {
    const tallies = runTallies(RUN, 'metric');
    expect([tallies.deaths.value, tallies.births.value, tallies.alerts.value]).toEqual(['2', '18', '6']);
  });

  it('states the water changed in the reader’s own units', () => {
    expect(runTallies(RUN, 'metric').water.value).toBe('340 L');
    expect(runTallies(RUN, 'imperial').water.value).toBe('90 gal');
  });
});

describe('runLength', () => {
  it('states the run in ticks and as elapsed time', () => {
    expect(runLength(RUN)).toBe('1622 ticks · 67d 14h');
    expect(runLength({ ...RUN, ticks: 1 })).toBe('1 tick · 1h');
  });

  it('says zero rather than an elapsed time of nothing', () => {
    expect(runLength({ ...RUN, ticks: 0 })).toBe('0 ticks');
  });
});

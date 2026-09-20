import { describe, it, expect } from 'vitest';
import { photoperiodSpans } from './photoperiod';

const SCHEDULE = { startHour: 8, duration: 6 };

describe('photoperiodSpans', () => {
  it('lights the fixture hours of every day in the window', () => {
    expect(photoperiodSpans({ minTick: 0, maxTick: 48 }, SCHEDULE)).toEqual([
      { from: 8, to: 14 },
      { from: 32, to: 38 },
    ]);
  });

  it('clips a period the window opens or closes inside', () => {
    expect(photoperiodSpans({ minTick: 10, maxTick: 34 }, SCHEDULE)).toEqual([
      { from: 10, to: 14 },
      { from: 32, to: 34 },
    ]);
  });

  it('lights nothing without a fixture, or with one that never comes on', () => {
    expect(photoperiodSpans({ minTick: 0, maxTick: 48 }, null)).toEqual([]);
    expect(photoperiodSpans({ minTick: 0, maxTick: 48 }, { startHour: 8, duration: 0 })).toEqual([]);
    expect(photoperiodSpans(null, SCHEDULE)).toEqual([]);
  });

  it('carries a period that runs past midnight into the day it ends on', () => {
    expect(photoperiodSpans({ minTick: 24, maxTick: 30 }, { startHour: 20, duration: 8 })).toEqual([
      { from: 24, to: 28 },
    ]);
  });
});

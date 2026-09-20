import { describe, it, expect } from 'vitest';
import { photoperiodSpans } from './photoperiod';
import type { RunSnapshot } from '../run/index.js';
import { snapshot } from '../test/snapshot';

/** A buffer of `count` ticks from `from`, lit on the hours the predicate names. */
function buffer(from: number, count: number, lit: (tick: number) => boolean): RunSnapshot[] {
  return Array.from({ length: count }, (_, i) =>
    snapshot(from + i, { lightOn: lit(from + i) })
  );
}

/** The fixture the run was on: 08:00 for six hours. */
const eightToTwo = (tick: number): boolean => tick % 24 >= 8 && tick % 24 < 14;

describe('photoperiodSpans', () => {
  it('lights the hours the buffer recorded the fixture running', () => {
    expect(photoperiodSpans(buffer(0, 49, eightToTwo))).toEqual([
      { from: 8, to: 14 },
      { from: 32, to: 38 },
    ]);
  });

  it('clips a period the buffer opens inside, and lights one it ends inside through', () => {
    expect(photoperiodSpans(buffer(10, 25, eightToTwo))).toEqual([
      { from: 10, to: 14 },
      { from: 32, to: 35 },
    ]);
  });

  it('lights the last hour the buffer recorded, where that hour is the only one lit', () => {
    expect(photoperiodSpans(buffer(6, 3, eightToTwo))).toEqual([{ from: 8, to: 9 }]);
  });

  it('lights nothing on an empty buffer, or one that never saw the fixture on', () => {
    expect(photoperiodSpans([])).toEqual([]);
    expect(photoperiodSpans(buffer(0, 49, () => false))).toEqual([]);
  });

  it('carries a period that runs past midnight into the day it ends on', () => {
    const eightPmToFour = (tick: number): boolean => tick % 24 >= 20 || tick % 24 < 4;
    expect(photoperiodSpans(buffer(24, 7, eightPmToFour))).toEqual([{ from: 24, to: 28 }]);
  });

  it('leaves the hours already run where they were when the fixture is retimed', () => {
    const retimed = [
      ...buffer(0, 24, eightToTwo),
      ...buffer(24, 25, (tick) => tick % 24 >= 18 && tick % 24 < 22),
    ];

    expect(photoperiodSpans(retimed)).toEqual([
      { from: 8, to: 14 },
      { from: 42, to: 46 },
    ]);
  });
});

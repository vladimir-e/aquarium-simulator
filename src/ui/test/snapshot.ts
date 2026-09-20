import type { RunSnapshot } from '../run/index.js';

/** One tick of a quiet tank, for a test that reads a field or two off it. */
export function snapshot(tick: number, reading: Partial<RunSnapshot> = {}): RunSnapshot {
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
    fryCount: 0,
    plantAvgSize: 0,
    algaeMass: 0,
    food: 0,
    lightOn: false,
    ...reading,
  };
}

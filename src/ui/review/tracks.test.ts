import { describe, it, expect } from 'vitest';
import type { RunSnapshot } from '../run';
import {
  normalize,
  seriesExtent,
  snapshotAtTick,
  trackLines,
  TRACKS,
  TRACK_COLORS,
  TRACK_PAIRS,
} from './tracks';

const history = [
  { tick: 0, ammonia: 0, nitrite: 0.2, nitrate: 10 },
  { tick: 1, ammonia: 0.5, nitrite: 0.1, nitrate: 20 },
  { tick: 2, ammonia: 1, nitrite: 0.3, nitrate: 40 },
] as RunSnapshot[];

describe('the four tracks', () => {
  it('covers the tank in four groups and nothing twice', () => {
    expect(TRACKS.map((t) => t.id)).toEqual(['nitrogen', 'ph-co2', 'o2-temp', 'population']);
    const keys = TRACKS.flatMap((t) => t.series.map((s) => s.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('colours a line by its place in its own track, never by status', () => {
    const lines = trackLines(history, TRACKS[0]);
    expect(lines.map((line) => line.color)).toEqual(TRACK_COLORS.slice(0, 3));
  });

  it('gives every line its own extent, so a trace at 0.3 reads beside one at 40', () => {
    const [ammonia, nitrite, nitrate] = trackLines(history, TRACKS[0]);
    expect(ammonia.extent).toEqual({ min: 0, max: 1 });
    expect(nitrite.extent).toEqual({ min: 0.1, max: 0.3 });
    expect(nitrate.extent).toEqual({ min: 10, max: 40 });
  });

  it('deals the four into two pairs for a phone, covering all of them once', () => {
    const paired = TRACK_PAIRS.flatMap((pair) => pair.tracks.map((t) => t.id));
    expect(paired).toHaveLength(TRACKS.length);
    expect(new Set(paired).size).toBe(TRACKS.length);
    expect(TRACK_PAIRS[0].tracks.map((t) => t.id)).toEqual(['nitrogen', 'population']);
  });
});

describe('normalize', () => {
  it('spreads a series across its own extent', () => {
    const extent = seriesExtent([10, 20, 40]);
    expect(normalize(10, extent)).toBe(0);
    expect(normalize(40, extent)).toBe(1);
    expect(normalize(25, extent)).toBeCloseTo(0.5);
  });

  it('centres a line that is flat, or as good as', () => {
    expect(normalize(25, seriesExtent([25, 25]))).toBe(0.5);
    expect(normalize(25, seriesExtent([25, 25.000001]))).toBe(0.5);
  });

  it('has nothing to place on an empty window', () => {
    expect(seriesExtent([])).toEqual({ min: 0, max: 0 });
  });
});

describe('snapshotAtTick', () => {
  it('finds the exact tick, and nothing near it', () => {
    expect(snapshotAtTick(history, 1)?.tick).toBe(1);
    expect(snapshotAtTick(history, 9)).toBeNull();
  });
});

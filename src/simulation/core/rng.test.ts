import { describe, it, expect } from 'vitest';
import { createRng, draw, drawId } from './rng.js';

describe('createRng', () => {
  it('opens a named stream at its start', () => {
    expect(createRng(2026)).toEqual({ seed: 2026, counter: 0 });
  });

  it('takes a time-derived seed when nobody names one', () => {
    const rng = createRng();

    expect(rng.counter).toBe(0);
    expect(Number.isInteger(rng.seed)).toBe(true);
  });

  it('opens a stream of its own for every unnamed tank, however fast they are built', () => {
    const seeds = new Set(Array.from({ length: 1000 }, () => createRng().seed));

    expect(seeds.size).toBe(1000);
  });

  it('keeps the seed inside the word the generator mixes', () => {
    const { seed } = createRng(Number.MAX_SAFE_INTEGER);

    expect(seed).toBe(seed | 0);
  });
});

describe('draw', () => {
  it('is a pure function of seed and position', () => {
    expect(draw({ seed: 5, counter: 100 })).toBe(draw({ seed: 5, counter: 100 }));
  });

  it('gives the same value however the position was reached', () => {
    const walked = createRng(5);
    for (let i = 0; i < 100; i++) draw(walked);

    expect(draw(walked)).toBe(draw({ seed: 5, counter: 100 }));
  });

  it('advances the position by exactly one', () => {
    const rng = createRng(5);
    draw(rng);
    draw(rng);
    draw(rng);

    expect(rng.counter).toBe(3);
  });

  it('replays a seed and diverges from any other', () => {
    const stream = (seed: number): number[] => {
      const rng = createRng(seed);
      return Array.from({ length: 20 }, () => draw(rng));
    };

    expect(stream(5)).toEqual(stream(5));
    expect(stream(5)).not.toEqual(stream(6));
  });

  it('stays inside [0, 1)', () => {
    const rng = createRng(11);
    for (let i = 0; i < 20000; i++) {
      const value = draw(rng);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('spreads evenly across the interval', () => {
    const rng = createRng(11);
    const buckets = new Array<number>(10).fill(0);
    const N = 100000;
    let total = 0;
    for (let i = 0; i < N; i++) {
      const value = draw(rng);
      total += value;
      buckets[Math.floor(value * 10)]++;
    }

    expect(total / N).toBeCloseTo(0.5, 2);
    for (const count of buckets) {
      expect(count).toBeGreaterThan(0.95 * (N / 10));
      expect(count).toBeLessThan(1.05 * (N / 10));
    }
  });

  it('carries no correlation between neighbouring positions', () => {
    const rng = createRng(11);
    const N = 50000;
    let sum = 0;
    let previous = draw(rng);
    for (let i = 0; i < N; i++) {
      const value = draw(rng);
      sum += (previous - 0.5) * (value - 0.5);
      previous = value;
    }

    expect(sum / N).toBeCloseTo(0, 2);
  });
});

describe('drawId', () => {
  it('names under the prefix it was given', () => {
    expect(drawId(createRng(5), 'fish')).toMatch(/^fish_/);
  });

  it('advances the position, so a name and a draw never share one', () => {
    const rng = createRng(5);
    const id = drawId(rng, 'fish');

    expect(rng.counter).toBe(1);
    expect(id).not.toBe(drawId(rng, 'fish'));
  });

  it('never repeats a name in one stream', () => {
    const rng = createRng(5);
    const ids = new Set<string>();
    for (let i = 0; i < 10000; i++) ids.add(drawId(rng, 'fish'));

    expect(ids.size).toBe(10000);
  });

  it('keeps names apart across prefixes even at the same position', () => {
    expect(drawId(createRng(5), 'fish')).not.toBe(drawId(createRng(5), 'plant'));
  });
});

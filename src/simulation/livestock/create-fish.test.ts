import { describe, it, expect } from 'vitest';
import { createFish, fishMassForAge, generateFishId } from './create-fish.js';
import { FISH_SPECIES_DATA } from '../state.js';

/** Deterministic uniform PRNG (mulberry32) for distribution assertions. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** rng that replays a fixed list, cycling. */
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('fishMassForAge', () => {
  it('gives adult mass for adults regardless of age', () => {
    expect(fishMassForAge('guppy', 0, 'adult')).toBe(FISH_SPECIES_DATA.guppy.adultMass);
    expect(fishMassForAge('guppy', 999999, 'adult')).toBe(FISH_SPECIES_DATA.guppy.adultMass);
  });

  it('starts a fry at fryMassFraction × adultMass (age 0)', () => {
    const { adultMass, breeding } = FISH_SPECIES_DATA.guppy;
    expect(fishMassForAge('guppy', 0, 'fry')).toBeCloseTo(breeding.fryMassFraction * adultMass, 10);
  });

  it('reaches adult mass at maturityAge', () => {
    const { adultMass, breeding } = FISH_SPECIES_DATA.guppy;
    expect(fishMassForAge('guppy', breeding.maturityAge, 'fry')).toBeCloseTo(adultMass, 10);
  });

  it('interpolates linearly at the midpoint', () => {
    const { adultMass, breeding } = FISH_SPECIES_DATA.neon_tetra;
    const fryMass = breeding.fryMassFraction * adultMass;
    const mid = fishMassForAge('neon_tetra', breeding.maturityAge / 2, 'fry');
    expect(mid).toBeCloseTo(fryMass + (adultMass - fryMass) * 0.5, 10);
  });

  it('clamps past maturityAge (never exceeds adult mass)', () => {
    const { adultMass, breeding } = FISH_SPECIES_DATA.guppy;
    expect(fishMassForAge('guppy', breeding.maturityAge * 3, 'fry')).toBeCloseTo(adultMass, 10);
  });
});

describe('createFish', () => {
  it('builds a stocked adult at full mass, age 0, arrival satiation', () => {
    const fish = createFish({ species: 'angelfish', age: 0, stage: 'adult', rng: seq([0.5, 0.5, 0.5]) });
    expect(fish.stage).toBe('adult');
    expect(fish.mass).toBe(FISH_SPECIES_DATA.angelfish.adultMass);
    expect(fish.age).toBe(0);
    expect(fish.satiation).toBe(70);
    expect(fish.surplus).toBe(0);
    expect(fish.health).toBe(100); // rng 0.5 → no jitter
    expect(fish.hardinessOffset).toBe(0); // rng 0.5 → no offset
  });

  it('builds a fry small, at fry satiation', () => {
    const { adultMass, breeding } = FISH_SPECIES_DATA.guppy;
    const fish = createFish({ species: 'guppy', age: 0, stage: 'fry', rng: seq([0.5, 0.5, 0.5]) });
    expect(fish.stage).toBe('fry');
    expect(fish.mass).toBeCloseTo(breeding.fryMassFraction * adultMass, 10);
    expect(fish.satiation).toBe(50);
    expect(fish.age).toBe(0);
  });

  it('samples sex ~50/50', () => {
    const rng = mulberry32(12345);
    let males = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      if (createFish({ species: 'guppy', age: 0, stage: 'adult', rng }).sex === 'male') males++;
    }
    expect(males / N).toBeGreaterThan(0.46);
    expect(males / N).toBeLessThan(0.54);
  });

  it('keeps hardiness offset within ±15% of species baseline', () => {
    const rng = mulberry32(999);
    const maxAbs = 0.15 * FISH_SPECIES_DATA.neon_tetra.hardiness;
    for (let i = 0; i < 500; i++) {
      const f = createFish({ species: 'neon_tetra', age: 0, stage: 'fry', rng });
      expect(Math.abs(f.hardinessOffset)).toBeLessThanOrEqual(maxAbs + 1e-9);
    }
  });

  it('keeps initial health within [95, 100]', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const f = createFish({ species: 'guppy', age: 0, stage: 'adult', rng });
      expect(f.health).toBeGreaterThanOrEqual(95);
      expect(f.health).toBeLessThanOrEqual(100);
    }
  });

  it('generates unique ids', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(generateFishId());
    expect(ids.size).toBe(1000);
  });
});

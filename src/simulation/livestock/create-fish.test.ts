import { describe, it, expect } from 'vitest';
import { createFish, fishMassForAge } from './create-fish.js';
import { createRng } from '../core/rng.js';
import { FISH_SPECIES_DATA } from './species.js';

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
    const fish = createFish({ species: 'angelfish', age: 0, stage: 'adult', rng: createRng(1) });
    expect(fish.stage).toBe('adult');
    expect(fish.mass).toBe(FISH_SPECIES_DATA.angelfish.adultMass);
    expect(fish.age).toBe(0);
    expect(fish.satiation).toBe(70);
    expect(fish.surplus).toBe(0);
  });

  it('builds a fry small, at fry satiation', () => {
    const { adultMass, breeding } = FISH_SPECIES_DATA.guppy;
    const fish = createFish({ species: 'guppy', age: 0, stage: 'fry', rng: createRng(1) });
    expect(fish.stage).toBe('fry');
    expect(fish.mass).toBeCloseTo(breeding.fryMassFraction * adultMass, 10);
    expect(fish.satiation).toBe(50);
    expect(fish.age).toBe(0);
  });

  it('samples sex ~50/50', () => {
    const rng = createRng(12345);
    let males = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      if (createFish({ species: 'guppy', age: 0, stage: 'adult', rng }).sex === 'male') males++;
    }
    expect(males / N).toBeGreaterThan(0.46);
    expect(males / N).toBeLessThan(0.54);
  });

  it('takes an explicit sex instead of sampling one', () => {
    const rng = createRng(12345);
    for (let i = 0; i < 100; i++) {
      expect(createFish({ species: 'guppy', age: 0, stage: 'adult', sex: 'female', rng }).sex).toBe(
        'female'
      );
    }
  });

  it('draws the same stream whether or not it was given a sex', () => {
    const sampled = createFish({ species: 'guppy', age: 0, stage: 'adult', rng: createRng(3) });
    const named = createFish({
      species: 'guppy',
      age: 0,
      stage: 'adult',
      sex: 'male',
      rng: createRng(3),
    });

    expect(named.hardinessOffset).toBe(sampled.hardinessOffset);
    expect(named.health).toBe(sampled.health);
  });

  it('leaves the stream where the next fish expects it', () => {
    const build = (sex?: 'male' | 'female'): { fish: ReturnType<typeof createFish>; at: number } => {
      const rng = createRng(3);
      createFish({ species: 'guppy', age: 0, stage: 'adult', sex, rng });
      return { fish: createFish({ species: 'guppy', age: 0, stage: 'adult', rng }), at: rng.counter };
    };
    const after = build();
    const afterNamed = build('female');

    expect(afterNamed.at).toBe(after.at);
    expect(afterNamed.fish).toEqual(after.fish);
  });

  it('keeps hardiness offset within ±15% of species baseline', () => {
    const rng = createRng(999);
    const maxAbs = 0.15 * FISH_SPECIES_DATA.neon_tetra.hardiness;
    for (let i = 0; i < 500; i++) {
      const f = createFish({ species: 'neon_tetra', age: 0, stage: 'fry', rng });
      expect(Math.abs(f.hardinessOffset)).toBeLessThanOrEqual(maxAbs + 1e-9);
    }
  });

  it('keeps initial health within [95, 100]', () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i++) {
      const f = createFish({ species: 'guppy', age: 0, stage: 'adult', rng });
      expect(f.health).toBeGreaterThanOrEqual(95);
      expect(f.health).toBeLessThanOrEqual(100);
    }
  });

  it('centres the hardiness offset on the species baseline', () => {
    const rng = createRng(4242);
    const N = 4000;
    let total = 0;
    let weaker = 0;
    for (let i = 0; i < N; i++) {
      const { hardinessOffset } = createFish({
        species: 'neon_tetra',
        age: 0,
        stage: 'adult',
        rng,
      });
      total += hardinessOffset;
      if (hardinessOffset < 0) weaker++;
    }

    expect(total / N).toBeCloseTo(0, 2);
    expect(weaker / N).toBeGreaterThan(0.46);
    expect(weaker / N).toBeLessThan(0.54);
  });

  it('names every fish off the stream, never twice the same', () => {
    const rng = createRng(1);
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(createFish({ species: 'guppy', age: 0, stage: 'adult', rng }).id);
    }
    expect(ids.size).toBe(1000);
  });

  it('builds the same fish, id included, from the same seed — and a different one otherwise', () => {
    const build = (seed: number): ReturnType<typeof createFish> =>
      createFish({ species: 'guppy', age: 0, stage: 'adult', rng: createRng(seed) });

    expect(build(11)).toEqual(build(11));
    expect(build(11)).not.toEqual(build(12));
  });
});

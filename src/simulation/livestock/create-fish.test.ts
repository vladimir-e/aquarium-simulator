import { describe, it, expect } from 'vitest';
import { createFish, HARDINESS_OFFSET_SPAN, HEALTH_JITTER } from './create-fish.js';
import { createRng, draw } from '../core/rng.js';
import { FISH_SPECIES_DATA } from './species.js';
import { livestockDefaults } from '../config/livestock.js';

describe('createFish', () => {
  it('builds a fish at its size, as that share of adult mass, with a day’s keep in its gut', () => {
    const { adultMass } = FISH_SPECIES_DATA.angelfish;
    for (const size of [2, 40, 100]) {
      const fish = createFish({ species: 'angelfish', size, rng: createRng(1), config: livestockDefaults });
      expect(fish.mass).toBeCloseTo((size / 100) * adultMass, 12);
      expect(fish.gut).toBeCloseTo(fish.mass * livestockDefaults.maintenanceRation, 12);
      expect(fish.surplus).toBe(0);
    }
  });

  it('starts at age 0 unless the caller names one', () => {
    const rng = createRng(1);
    expect(createFish({ species: 'guppy', size: 100, rng, config: livestockDefaults }).age).toBe(0);
    expect(createFish({ species: 'guppy', size: 100, age: 240, rng, config: livestockDefaults }).age).toBe(240);
  });

  it('takes an explicit sex instead of sampling one', () => {
    const rng = createRng(12345);
    for (let i = 0; i < 100; i++) {
      expect(createFish({ species: 'guppy', size: 100, sex: 'female', rng, config: livestockDefaults }).sex).toBe(
        'female'
      );
    }
  });

  it('draws the same stream whether or not it was given a sex', () => {
    const sampled = createFish({ species: 'guppy', size: 100, rng: createRng(3), config: livestockDefaults });
    const named = createFish({
      species: 'guppy',
      size: 100,
      sex: 'male',
      rng: createRng(3),
      config: livestockDefaults,
    });

    expect(named.hardinessOffset).toBe(sampled.hardinessOffset);
    expect(named.health).toBe(sampled.health);
  });

  it('leaves the stream where the next fish expects it', () => {
    const build = (sex?: 'male' | 'female'): { fish: ReturnType<typeof createFish>; at: number } => {
      const rng = createRng(3);
      createFish({ species: 'guppy', size: 100, sex, rng, config: livestockDefaults });
      return { fish: createFish({ species: 'guppy', size: 100, rng, config: livestockDefaults }), at: rng.counter };
    };
    const after = build();
    const afterNamed = build('female');

    expect(afterNamed.at).toBe(after.at);
    expect(afterNamed.fish).toEqual(after.fish);
  });

  it('keeps hardiness offset within the offset span of the species baseline', () => {
    const rng = createRng(999);
    const maxAbs = HARDINESS_OFFSET_SPAN * FISH_SPECIES_DATA.neon_tetra.hardiness;
    for (let i = 0; i < 500; i++) {
      const f = createFish({ species: 'neon_tetra', size: 5, rng, config: livestockDefaults });
      expect(Math.abs(f.hardinessOffset)).toBeLessThanOrEqual(maxAbs + 1e-9);
    }
  });

  it('keeps initial health within the jitter below full health', () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i++) {
      const f = createFish({ species: 'guppy', size: 100, rng, config: livestockDefaults });
      expect(f.health).toBeGreaterThanOrEqual(100 - HEALTH_JITTER);
      expect(f.health).toBeLessThanOrEqual(100);
    }
  });

  it('spends its three draws on sex, hardiness and health, in that order', () => {
    const rng = createRng(1);
    const probe = { ...rng };
    const sexDraw = draw(probe);
    const hardinessDraw = draw(probe);
    const healthDraw = draw(probe);
    const { hardiness } = FISH_SPECIES_DATA.neon_tetra;

    const fish = createFish({ species: 'neon_tetra', size: 100, rng, config: livestockDefaults });

    expect(fish.sex).toBe(sexDraw < 0.5 ? 'male' : 'female');
    expect(fish.hardinessOffset).toBeCloseTo(
      (hardinessDraw - 0.5) * 2 * HARDINESS_OFFSET_SPAN * hardiness,
      12
    );
    expect(fish.health).toBeCloseTo(100 + (healthDraw - 0.5) * 2 * HEALTH_JITTER, 12);
  });

  it('names every fish off the stream, never twice the same', () => {
    const rng = createRng(1);
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(createFish({ species: 'guppy', size: 100, rng, config: livestockDefaults }).id);
    }
    expect(ids.size).toBe(1000);
  });

  it('builds the same fish from the same seed — another seed rerolls all but the id', () => {
    const build = (seed: number): ReturnType<typeof createFish> =>
      createFish({ species: 'guppy', size: 100, rng: createRng(seed), config: livestockDefaults });

    expect(build(11)).toEqual(build(11));
    expect(build(11)).not.toEqual(build(12));
    expect(build(11).id).toBe(build(12).id);
  });
});

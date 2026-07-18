import { describe, it, expect } from 'vitest';
import type { Fish, FishSpecies } from '../../simulation/index.js';
import {
  bioload,
  fryLines,
  GUIDELINE_G_PER_L,
  projectedAdultMass,
  removalVictimId,
  speciesCounts,
} from './stocking';

function makeFish(overrides: Partial<Fish> & { id: string }): Fish {
  return {
    species: 'neon_tetra',
    mass: 0.5,
    health: 100,
    age: 0,
    satiation: 90,
    sex: 'male',
    stage: 'adult',
    hardinessOffset: 0,
    surplus: 0,
    ...overrides,
  };
}

function stock(species: FishSpecies, n: number): Fish[] {
  return Array.from({ length: n }, (_, i) => makeFish({ id: `${species}-${i}`, species }));
}

describe('speciesCounts', () => {
  it('folds adults into per-species counts in first-seen order, excluding fry', () => {
    const fish = [
      makeFish({ id: 'n1', species: 'neon_tetra' }),
      makeFish({ id: 'g1', species: 'guppy' }),
      makeFish({ id: 'n2', species: 'neon_tetra' }),
      makeFish({ id: 'f1', species: 'guppy', stage: 'fry', age: 24 }),
    ];
    expect(speciesCounts(fish)).toEqual([
      { species: 'neon_tetra', name: 'Neon Tetra', count: 2 },
      { species: 'guppy', name: 'Guppy', count: 1 },
    ]);
  });

  it('is empty when only fry are present', () => {
    expect(speciesCounts([makeFish({ id: 'f1', stage: 'fry', age: 12 })])).toEqual([]);
  });
});

describe('removalVictimId', () => {
  it('picks the lowest-health adult of the species', () => {
    const fish = [
      makeFish({ id: 'a', species: 'neon_tetra', health: 80 }),
      makeFish({ id: 'b', species: 'neon_tetra', health: 30 }),
      makeFish({ id: 'c', species: 'neon_tetra', health: 55 }),
      makeFish({ id: 'g', species: 'guppy', health: 10 }),
    ];
    expect(removalVictimId(fish, 'neon_tetra')).toBe('b');
  });

  it('ignores fry and returns null when no adult of the species remains', () => {
    const fish = [makeFish({ id: 'f', species: 'neon_tetra', stage: 'fry', age: 24, health: 5 })];
    expect(removalVictimId(fish, 'neon_tetra')).toBeNull();
    expect(removalVictimId([], 'guppy')).toBeNull();
  });
});

describe('fryLines', () => {
  it('folds fry into per-species lines and ignores adults', () => {
    const fish = [
      makeFish({ id: 'f1', species: 'guppy', stage: 'fry', age: 24 }),
      makeFish({ id: 'f2', species: 'guppy', stage: 'fry', age: 48 }),
      makeFish({ id: 'a1', species: 'guppy', stage: 'adult' }),
    ];
    expect(fryLines(fish)).toEqual([{ species: 'guppy', name: 'Guppy', count: 2 }]);
  });
});

describe('projectedAdultMass', () => {
  it('sums species adult mass, counting fry at adult mass', () => {
    const fish = [
      makeFish({ id: 'a', species: 'corydoras' }), // 4 g adult
      makeFish({ id: 'f', species: 'corydoras', stage: 'fry', age: 24, mass: 0.2 }), // still 4 g projected
    ];
    expect(projectedAdultMass(fish)).toBe(8);
  });
});

describe('bioload', () => {
  it('lands the reference 40-gal community at ~0.8x (the calibration anchor)', () => {
    // 12 neon (6 g) + 8 corydoras (32 g) + 4 guppy (4 g) + 2 angelfish (30 g) = 72 g in 150 L.
    const community = [
      ...stock('neon_tetra', 12),
      ...stock('corydoras', 8),
      ...stock('guppy', 4),
      ...stock('angelfish', 2),
    ];
    const load = bioload(community, 150);
    expect(load.massG).toBe(72);
    expect(load.guidelineG).toBeCloseTo(90, 5);
    expect(load.ratio).toBeCloseTo(0.8, 2);
    expect(load.status).toBe('warn');
  });

  it('reads calm for a lightly-stocked tank', () => {
    const load = bioload(stock('neon_tetra', 12), 150); // 6 g / 90 g
    expect(load.ratio).toBeLessThan(0.7);
    expect(load.status).toBe('ok');
  });

  it('alerts and clamps once projected mass passes the guideline', () => {
    const load = bioload(stock('corydoras', 40), 150); // 160 g / 90 g = 1.78x
    expect(load.ratio).toBeGreaterThan(1);
    expect(load.status).toBe('alert');
    expect(load.pct).toBe(100);
  });

  it('handles empty and zero-capacity tanks', () => {
    expect(bioload([], 150)).toMatchObject({ massG: 0, ratio: 0, status: 'ok' });
    expect(bioload(stock('neon_tetra', 1), 0)).toMatchObject({ guidelineG: 0, ratio: 0 });
  });

  it('uses the documented guideline density', () => {
    expect(GUIDELINE_G_PER_L).toBe(0.6);
  });
});

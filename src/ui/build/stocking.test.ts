import { describe, it, expect } from 'vitest';
import type { Fish } from '../../simulation/index.js';
import { bioload, fryLines, removalVictimId, speciesCounts } from './stocking';

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

describe('bioload', () => {
  // getMaxFishMass(40) = 0.5 * 40 * 1000 = 20000 g.
  it('reports the ratio against the tank physical ceiling', () => {
    const load = bioload([makeFish({ id: 'a', mass: 10000 })], 40);
    expect(load.maxG).toBe(20000);
    expect(load.ratio).toBeCloseTo(0.5, 5);
    expect(load.pct).toBeCloseTo(50, 5);
    expect(load.status).toBe('ok');
  });

  it('warns approaching the ceiling and alerts near it', () => {
    expect(bioload([makeFish({ id: 'a', mass: 15000 })], 40).status).toBe('warn');
    expect(bioload([makeFish({ id: 'a', mass: 18500 })], 40).status).toBe('alert');
  });

  it('clamps the bar and handles an empty or zero-capacity tank', () => {
    expect(bioload([makeFish({ id: 'a', mass: 30000 })], 40).pct).toBe(100);
    expect(bioload([], 40)).toMatchObject({ ratio: 0, pct: 0, status: 'ok' });
    expect(bioload([makeFish({ id: 'a', mass: 5 })], 0)).toMatchObject({ maxG: 0, ratio: 0 });
  });
});

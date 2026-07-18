import { describe, it, expect } from 'vitest';
import type { Fish } from '../../simulation/index.js';
import { FISH_SPECIES_DATA } from '../../simulation/index.js';
import { livestockDefaults } from '../../simulation/config/livestock.js';
import {
  bandStatus,
  countHungry,
  deriveFryGraduation,
  groupBySpecies,
  groupFryBatches,
  isHungryBand,
} from './livestock';

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

// Band floors (config defaults): overfed ≥99, wellFed ≥75, peckish ≥50, hungry ≥25, else starving.
describe('bandStatus / isHungryBand', () => {
  it('maps bands onto the status vocabulary', () => {
    expect(bandStatus('wellFed')).toBe('ok');
    expect(bandStatus('peckish')).toBe('neutral');
    expect(bandStatus('hungry')).toBe('warn');
    expect(bandStatus('overfed')).toBe('warn');
    expect(bandStatus('starving')).toBe('alert');
  });

  it('counts only hungry and starving as hungry', () => {
    expect(isHungryBand('hungry')).toBe(true);
    expect(isHungryBand('starving')).toBe(true);
    expect(isHungryBand('peckish')).toBe(false);
    expect(isHungryBand('wellFed')).toBe(false);
  });
});

describe('countHungry', () => {
  it('tallies fish in the hungry and starving bands', () => {
    const fish = [
      makeFish({ id: 'a', satiation: 90 }), // wellFed
      makeFish({ id: 'b', satiation: 60 }), // peckish
      makeFish({ id: 'c', satiation: 40 }), // hungry
      makeFish({ id: 'd', satiation: 10 }), // starving
    ];
    expect(countHungry(fish, livestockDefaults)).toBe(2);
  });
});

describe('groupBySpecies', () => {
  it('folds adults into per-species rows and excludes fry', () => {
    const fish = [
      makeFish({ id: 'n1', species: 'neon_tetra', satiation: 80 }),
      makeFish({ id: 'n2', species: 'neon_tetra', satiation: 40 }),
      makeFish({ id: 'g1', species: 'guppy', satiation: 90 }),
      makeFish({ id: 'f1', species: 'neon_tetra', stage: 'fry', age: 24 }),
    ];
    const groups = groupBySpecies(fish, livestockDefaults);
    expect(groups.map((g) => g.species)).toEqual(['neon_tetra', 'guppy']);
    const neon = groups[0];
    expect(neon.count).toBe(2);
    expect(neon.avgSatiation).toBe(60);
    expect(neon.hungryCount).toBe(1);
    expect(neon.name).toBe(FISH_SPECIES_DATA.neon_tetra.name);
  });
});

describe('groupFryBatches', () => {
  it('groups fry by species with derived maturation', () => {
    const fish = [
      makeFish({ id: 'f1', species: 'guppy', stage: 'fry', age: 24 }),
      makeFish({ id: 'f2', species: 'guppy', stage: 'fry', age: 72 }),
      makeFish({ id: 'a1', species: 'guppy', stage: 'adult' }),
    ];
    const batches = groupFryBatches(fish);
    expect(batches).toHaveLength(1);
    expect(batches[0].species).toBe('guppy');
    expect(batches[0].count).toBe(2);
    // guppy maturityAge = 24 * 60 = 1440 ticks → graduates day 60
    expect(batches[0].graduationDay).toBe(60);
  });
});

describe('deriveFryGraduation', () => {
  it('derives day, graduation day, and growth from average age', () => {
    const maturityAge = 24 * 120; // 2880 ticks → 120 days
    const g = deriveFryGraduation([24, 72], maturityAge); // avg 48 ticks = day 2
    expect(g.dayNow).toBe(2);
    expect(g.graduationDay).toBe(120);
    expect(g.growthPct).toBeCloseTo((48 / 2880) * 100, 5);
  });

  it('treats an ageless or maturity-zero batch as fully grown / day zero', () => {
    expect(deriveFryGraduation([], 2880)).toEqual({ dayNow: 0, graduationDay: 120, growthPct: 0 });
    expect(deriveFryGraduation([100], 0).growthPct).toBe(100);
  });
});

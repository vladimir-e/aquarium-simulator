import { describe, it, expect } from 'vitest';
import type { Fish, FishSpecies } from '../../simulation/index.js';
import { bioload, bioloadNote, GUIDELINE_G_PER_L, projectedAdultMass } from './stocking';

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

describe('projectedAdultMass', () => {
  it('sums species adult mass, counting fry at adult mass', () => {
    const fish = [
      makeFish({ id: 'a', species: 'corydoras' }),
      makeFish({ id: 'f', species: 'corydoras', stage: 'fry', age: 24, mass: 0.2 }),
    ];
    expect(projectedAdultMass(fish)).toBe(8);
  });
});

describe('bioload', () => {
  it('reads projected adult mass against a guideline density over the tank', () => {
    const fish = [...stock('neon_tetra', 12), ...stock('corydoras', 8)];
    const load = bioload(fish, 150);

    expect(load.massG).toBe(projectedAdultMass(fish));
    expect(load.guidelineG).toBeCloseTo(150 * GUIDELINE_G_PER_L, 10);
    expect(load.ratio).toBeCloseTo(load.massG / load.guidelineG, 10);
  });

  it('reads calm for a lightly-stocked tank', () => {
    const load = bioload(stock('neon_tetra', 12), 150);
    expect(load.ratio).toBeLessThan(0.7);
    expect(load.status).toBe('ok');
  });

  it('alerts and clamps once projected mass passes the guideline', () => {
    const load = bioload(stock('corydoras', 40), 150);
    expect(load.ratio).toBeGreaterThan(1);
    expect(load.status).toBe('alert');
    expect(load.pct).toBe(100);
  });

  it('handles empty and zero-capacity tanks', () => {
    expect(bioload([], 150)).toMatchObject({ massG: 0, ratio: 0, status: 'ok' });
    expect(bioload(stock('neon_tetra', 1), 0)).toMatchObject({ guidelineG: 0, ratio: 0 });
  });
});

describe('bioloadNote', () => {
  const load = bioload(stock('corydoras', 4), 200);
  const lead = `${load.massG.toFixed(1)} g projected adult mass · guideline ${Math.round(load.guidelineG)} g`;

  it('spells out the mass against the guideline that produced the × figure', () => {
    expect(bioloadNote(load, 'metric')).toBe(`${lead} at ${GUIDELINE_G_PER_L} g/L`);
  });

  it('quotes the density per the reader’s own volume unit, leaving the guideline mass alone', () => {
    expect(bioloadNote(load, 'imperial')).toMatch(new RegExp(`^${lead} at [\\d.]+ g/gal$`));
  });
});

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

describe('bioloadNote', () => {
  // 0.6 g/L over a 200 L tank is a 120 g guideline; 4 corydoras project 16 g.
  const load = bioload(stock('corydoras', 4), 200);

  it('spells out the mass against the guideline that produced the × figure', () => {
    expect(bioloadNote(load, 'metric')).toBe(
      '16.0 g projected adult mass · guideline 120 g at 0.6 g/L'
    );
  });

  it('quotes the density per the reader’s own volume unit', () => {
    // 0.6 g per litre is 2.27 g per gallon — the guideline mass itself is unchanged.
    expect(bioloadNote(load, 'imperial')).toBe(
      '16.0 g projected adult mass · guideline 120 g at 2.3 g/gal'
    );
  });
});

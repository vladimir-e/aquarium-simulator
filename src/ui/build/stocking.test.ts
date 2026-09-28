import { describe, it, expect } from 'vitest';
import type { Fish, FishSpecies } from '../../simulation/index.js';
import { bioload, bioloadNote, GUIDELINE_G_PER_L, projectedAdultMass } from './stocking';
import { fishRecord } from '../../simulation/tests/fish.js';

function stock(species: FishSpecies, n: number): Fish[] {
  return Array.from({ length: n }, (_, i) => fishRecord({ id: `${species}-${i}`, species }));
}

describe('projectedAdultMass', () => {
  it('sums species adult mass, counting fry at adult mass', () => {
    const fish = [
      fishRecord({ id: 'a', species: 'corydoras' }),
      fishRecord({ id: 'f', species: 'corydoras', age: 24, mass: 0.2 }),
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

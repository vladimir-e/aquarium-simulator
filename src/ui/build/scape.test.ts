import { describe, it, expect } from 'vitest';
import { plantOptions, substrateConsequence, substrateSurface } from './scape';

describe('substrateSurface', () => {
  it('reports per-gallon and total surface for imperial units', () => {
    // aqua_soil = 1200 cm²/L; ×3.785… ≈ 4542 cm²/gal; ×40 L = 48000 total.
    expect(substrateSurface('aqua_soil', 40, 'imperial')).toEqual({
      perUnit: 4542,
      unitLabel: 'cm²/gal',
      total: 48000,
    });
  });

  it('reports per-liter surface for metric units', () => {
    expect(substrateSurface('aqua_soil', 40, 'metric')).toEqual({
      perUnit: 1200,
      unitLabel: 'cm²/L',
      total: 48000,
    });
  });

  it('is zero for a bare bottom', () => {
    expect(substrateSurface('none', 40, 'metric')).toMatchObject({ perUnit: 0, total: 0 });
  });
});

describe('substrateConsequence', () => {
  it('describes what each substrate can root', () => {
    expect(substrateConsequence('none')).toMatch(/epiphytes only/);
    expect(substrateConsequence('gravel')).toMatch(/epiphytes only/);
    expect(substrateConsequence('sand')).toMatch(/sand/);
    expect(substrateConsequence('aqua_soil')).toMatch(/every plant/);
  });
});

describe('plantOptions', () => {
  it('marks every species compatible on aqua soil', () => {
    expect(plantOptions('aqua_soil').every((o) => o.compatible)).toBe(true);
  });

  it('gates rooted species off an inert/bare substrate, keeping epiphytes', () => {
    const byId = Object.fromEntries(plantOptions('none').map((o) => [o.species, o.compatible]));
    expect(byId.java_fern).toBe(true); // epiphyte — attaches to hardscape
    expect(byId.anubias).toBe(true);
    expect(byId.amazon_sword).toBe(false); // needs sand+
    expect(byId.dwarf_hairgrass).toBe(false); // needs aqua soil
    expect(byId.monte_carlo).toBe(false);
  });

  it('roots sand species on sand but still gates aqua-soil species', () => {
    const byId = Object.fromEntries(plantOptions('sand').map((o) => [o.species, o.compatible]));
    expect(byId.amazon_sword).toBe(true);
    expect(byId.monte_carlo).toBe(false);
  });
});

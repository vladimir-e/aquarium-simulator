import { describe, it, expect } from 'vitest';
import { blendTemperature, blendConcentration, phToHydrogen, hydrogenToPh, blendPH } from './blending.js';

describe.each([
  ['blendTemperature', blendTemperature],
  ['blendConcentration', blendConcentration],
])('%s', (_, blend) => {
  it('is the volume-weighted mean', () => {
    expect(blend(26, 50, 20, 50)).toBe(23);
    expect(blend(28, 75, 20, 25)).toBe(26);
    expect(blend(26, 99, 20, 1)).toBe(25.94);
  });

  it('keeps the existing value with nothing added, and takes the added value into an empty tank', () => {
    expect(blend(25, 100, 20, 0)).toBe(25);
    expect(blend(25, 0, 20, 0)).toBe(25);
    expect(blend(25, 0, 20, 100)).toBe(20);
  });

  it('rounds to 2 decimal places', () => {
    expect(Number.isInteger(blend(26, 66.67, 20, 33.33) * 100)).toBe(true);
  });
});

describe('phToHydrogen / hydrogenToPh', () => {
  it('converts by powers of ten, and round-trips', () => {
    expect(phToHydrogen(7)).toBeCloseTo(1e-7, 12);
    expect(phToHydrogen(6) / phToHydrogen(8)).toBeCloseTo(100, 6);
    for (const ph of [5.5, 6.0, 7.0, 8.5]) {
      expect(hydrogenToPh(phToHydrogen(ph))).toBeCloseTo(ph, 10);
    }
  });

  it('reads no hydrogen as neutral', () => {
    expect(hydrogenToPh(0)).toBe(7);
    expect(hydrogenToPh(-1)).toBe(7);
  });
});

describe('blendPH', () => {
  it('blends hydrogen ions, not pH units, so the acid side dominates', () => {
    const result = blendPH(6, 50, 8, 50);
    expect(result).toBeCloseTo(hydrogenToPh((phToHydrogen(6) + phToHydrogen(8)) / 2), 2);
    expect(result).toBeLessThan(7);
    expect(blendPH(8, 75, 6.5, 25)).toBeLessThan(8 * 0.75 + 6.5 * 0.25);
  });

  it('keeps the existing pH with nothing added, and takes the added pH into an empty tank', () => {
    expect(blendPH(7, 100, 6, 0)).toBe(7);
    expect(blendPH(7, 0, 6, 0)).toBe(7);
    expect(blendPH(7, 0, 6, 100)).toBe(6);
    expect(blendPH(7, 50, 7, 50)).toBe(7);
  });

  it('rounds to 2 decimal places', () => {
    expect(Number.isInteger(blendPH(6.5, 66.67, 7.5, 33.33) * 100)).toBe(true);
  });
});

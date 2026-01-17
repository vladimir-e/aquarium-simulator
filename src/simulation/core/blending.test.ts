import { describe, it, expect } from 'vitest';
import { blendTemperature, blendConcentration, phToHydrogen, hydrogenToPh, blendPH } from './blending.js';

describe('blendTemperature', () => {
  it('blends 50/50 mix correctly', () => {
    // 50L at 26°C + 50L at 20°C = 100L at 23°C
    const result = blendTemperature(26, 50, 20, 50);
    expect(result).toBe(23);
  });

  it('blends 75/25 mix correctly', () => {
    // 75L at 28°C + 25L at 20°C = 100L at 26°C
    const result = blendTemperature(28, 75, 20, 25);
    expect(result).toBe(26);
  });

  it('blends 90/10 mix correctly', () => {
    // 90L at 25°C + 10L at 20°C = 100L at 24.5°C
    const result = blendTemperature(25, 90, 20, 10);
    expect(result).toBe(24.5);
  });

  it('handles small additions', () => {
    // 99L at 26°C + 1L at 20°C
    const result = blendTemperature(26, 99, 20, 1);
    expect(result).toBe(25.94);
  });

  it('handles cold tap water', () => {
    // 80L at 25°C + 20L at 15°C = 100L at 23°C
    const result = blendTemperature(25, 80, 15, 20);
    expect(result).toBe(23);
  });

  it('handles hot tap water', () => {
    // 80L at 20°C + 20L at 30°C = 100L at 22°C
    const result = blendTemperature(20, 80, 30, 20);
    expect(result).toBe(22);
  });

  it('returns existing temp when no water added', () => {
    const result = blendTemperature(25, 100, 20, 0);
    expect(result).toBe(25);
  });

  it('returns existing temp when total volume is zero', () => {
    const result = blendTemperature(25, 0, 20, 0);
    expect(result).toBe(25);
  });

  it('returns added temp when existing volume is zero', () => {
    const result = blendTemperature(25, 0, 20, 100);
    expect(result).toBe(20);
  });

  it('rounds to 2 decimal places', () => {
    // Result would be 25.333... without rounding
    const result = blendTemperature(26, 66.67, 20, 33.33);
    expect(Number.isInteger(result * 100)).toBe(true);
  });

  it('handles equal temperatures', () => {
    const result = blendTemperature(25, 50, 25, 50);
    expect(result).toBe(25);
  });
});

describe('blendConcentration', () => {
  it('blends 50/50 mix correctly', () => {
    // 50L at 8 mg/L + 50L at 4 mg/L = 100L at 6 mg/L
    const result = blendConcentration(8, 50, 4, 50);
    expect(result).toBe(6);
  });

  it('blends 75/25 mix correctly', () => {
    // 75L at 8 mg/L + 25L at 4 mg/L = 100L at 7 mg/L
    const result = blendConcentration(8, 75, 4, 25);
    expect(result).toBe(7);
  });

  it('blends 90/10 mix correctly', () => {
    // 90L at 8 mg/L + 10L at 4 mg/L = 100L at 7.6 mg/L
    const result = blendConcentration(8, 90, 4, 10);
    expect(result).toBe(7.6);
  });

  it('handles small additions', () => {
    // 99L at 8 mg/L + 1L at 4 mg/L
    const result = blendConcentration(8, 99, 4, 1);
    expect(result).toBe(7.96);
  });

  it('returns existing concentration when no water added', () => {
    const result = blendConcentration(8, 100, 4, 0);
    expect(result).toBe(8);
  });

  it('returns existing concentration when total volume is zero', () => {
    const result = blendConcentration(8, 0, 4, 0);
    expect(result).toBe(8);
  });

  it('returns added concentration when existing volume is zero', () => {
    const result = blendConcentration(8, 0, 4, 100);
    expect(result).toBe(4);
  });

  it('rounds to 2 decimal places', () => {
    // Result would be 6.666... without rounding
    const result = blendConcentration(8, 66.67, 4, 33.33);
    expect(Number.isInteger(result * 100)).toBe(true);
  });

  it('handles equal concentrations', () => {
    const result = blendConcentration(8, 50, 8, 50);
    expect(result).toBe(8);
  });

  it('works for O2 blending scenario (water change)', () => {
    // Tank at 6 mg/L O2, 75L remaining after removing 25%
    // Adding 25L tap water at saturation 8.5 mg/L
    const result = blendConcentration(6, 75, 8.5, 25);
    // (6 * 75 + 8.5 * 25) / 100 = (450 + 212.5) / 100 = 6.625
    expect(result).toBe(6.63); // Rounded
  });

  it('works for CO2 blending scenario (water change)', () => {
    // Tank at 20 mg/L CO2, 75L remaining after removing 25%
    // Adding 25L tap water at atmospheric 4 mg/L
    const result = blendConcentration(20, 75, 4, 25);
    // (20 * 75 + 4 * 25) / 100 = (1500 + 100) / 100 = 16
    expect(result).toBe(16);
  });
});

describe('phToHydrogen', () => {
  it('converts pH 7 to 10^-7', () => {
    const h = phToHydrogen(7);
    expect(h).toBeCloseTo(1e-7, 10);
  });

  it('converts pH 6 to 10^-6', () => {
    const h = phToHydrogen(6);
    expect(h).toBeCloseTo(1e-6, 10);
  });

  it('converts pH 8 to 10^-8', () => {
    const h = phToHydrogen(8);
    expect(h).toBeCloseTo(1e-8, 11);
  });

  it('lower pH = higher H+ concentration', () => {
    const h6 = phToHydrogen(6);
    const h7 = phToHydrogen(7);
    const h8 = phToHydrogen(8);
    expect(h6).toBeGreaterThan(h7);
    expect(h7).toBeGreaterThan(h8);
    // pH 6 has 100x more H+ than pH 8
    expect(h6 / h8).toBeCloseTo(100, 0);
  });
});

describe('hydrogenToPh', () => {
  it('converts 10^-7 to pH 7', () => {
    const ph = hydrogenToPh(1e-7);
    expect(ph).toBeCloseTo(7, 5);
  });

  it('converts 10^-6 to pH 6', () => {
    const ph = hydrogenToPh(1e-6);
    expect(ph).toBeCloseTo(6, 5);
  });

  it('converts 10^-8 to pH 8', () => {
    const ph = hydrogenToPh(1e-8);
    expect(ph).toBeCloseTo(8, 5);
  });

  it('returns neutral pH 7 for zero hydrogen', () => {
    const ph = hydrogenToPh(0);
    expect(ph).toBe(7.0);
  });

  it('returns neutral pH 7 for negative hydrogen', () => {
    const ph = hydrogenToPh(-1);
    expect(ph).toBe(7.0);
  });

  it('is inverse of phToHydrogen', () => {
    for (const testPh of [5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5]) {
      const h = phToHydrogen(testPh);
      const roundTrip = hydrogenToPh(h);
      expect(roundTrip).toBeCloseTo(testPh, 5);
    }
  });
});

describe('blendPH', () => {
  it('blending equal volumes of pH 6 and pH 8 yields ~6.3 (not 7.0)', () => {
    // This is the key test showing why pH blending is logarithmic
    // pH 6 has 100x more H+ than pH 8, so the result is much closer to pH 6
    const result = blendPH(6, 50, 8, 50);
    // H+ blend: (1e-6 * 50 + 1e-8 * 50) / 100 = (50e-6 + 0.5e-6) / 100 = 50.5e-8 = 5.05e-7
    // pH = -log10(5.05e-7) = 6.297
    expect(result).toBeCloseTo(6.3, 1);
    expect(result).toBeLessThan(7.0); // NOT simple average
  });

  it('blending 75/25 of pH 6.5 and pH 7.5', () => {
    const result = blendPH(6.5, 75, 7.5, 25);
    // Result should be closer to 6.5 due to logarithmic nature
    expect(result).toBeLessThan(7.0);
    expect(result).toBeGreaterThan(6.5);
  });

  it('blending 90/10 of pH 7 tank with pH 6 tap water', () => {
    // Common scenario: tank at neutral pH, acidic tap water
    const result = blendPH(7, 90, 6, 10);
    // Should pull pH down toward 6, but mostly stay near 7
    expect(result).toBeLessThan(7.0);
    expect(result).toBeGreaterThan(6.5);
  });

  it('returns existing pH when no water added', () => {
    const result = blendPH(7.0, 100, 6.0, 0);
    expect(result).toBe(7.0);
  });

  it('returns existing pH when total volume is zero', () => {
    const result = blendPH(7.0, 0, 6.0, 0);
    expect(result).toBe(7.0);
  });

  it('returns added pH when existing volume is zero', () => {
    const result = blendPH(7.0, 0, 6.0, 100);
    expect(result).toBe(6.0);
  });

  it('handles equal pH values', () => {
    const result = blendPH(7.0, 50, 7.0, 50);
    expect(result).toBe(7.0);
  });

  it('rounds to 2 decimal places', () => {
    const result = blendPH(6.5, 66.67, 7.5, 33.33);
    expect(Number.isInteger(result * 100)).toBe(true);
  });

  it('works for water change scenario (alkaline tank, acidic tap)', () => {
    // Tank at pH 8, 75L remaining after removing 25%
    // Adding 25L tap water at pH 6.5
    const result = blendPH(8, 75, 6.5, 25);
    // Acidic tap water dominates more than simple average suggests
    expect(result).toBeLessThan(7.625); // Would be (8*0.75 + 6.5*0.25) if linear
  });

  it('works for ATO scenario (small addition)', () => {
    // Tank at pH 7, 99L, adding 1L at pH 6.5
    const result = blendPH(7, 99, 6.5, 1);
    // Should barely change
    expect(result).toBeCloseTo(6.99, 1);
  });
});

import { describe, it, expect } from 'vitest';
import { blendTemperature, blendConcentration } from './blending.js';

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

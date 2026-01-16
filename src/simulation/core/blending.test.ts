import { describe, it, expect } from 'vitest';
import { blendTemperature } from './blending.js';

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

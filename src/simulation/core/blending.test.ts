import { describe, it, expect } from 'vitest';
import { blendTemperature, blendConcentration } from './blending.js';

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

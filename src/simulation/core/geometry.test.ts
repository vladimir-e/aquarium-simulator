import { describe, it, expect } from 'vitest';
import { calculateFloorArea, calculateTankGlassSurface, calculateTankHeight } from './geometry.js';

describe('tank geometry', () => {
  it('reads the 2:1:1 box the glass surface already assumes', () => {
    expect(calculateTankHeight(8 * 40) / calculateTankHeight(40)).toBeCloseTo(2, 10);
    expect(calculateTankGlassSurface(8 * 40) / calculateTankGlassSurface(40)).toBeCloseTo(4, 3);
  });

  it('floors the 2:1:1 box at twice its depth squared', () => {
    for (const capacity of [20, 150, 300]) {
      expect(calculateFloorArea(capacity)).toBeCloseTo(2 * calculateTankHeight(capacity) ** 2, 9);
    }
  });
});

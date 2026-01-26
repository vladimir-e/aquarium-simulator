import { describe, it, expect } from 'vitest';
import {
  algaeSystem,
  calculateAlgaeGrowth,
  getWattsPerGallon,
} from './algae.js';
import { createSimulation, type SimulationState } from '../state.js';
import { produce } from 'immer';
import { DEFAULT_CONFIG } from '../config/index.js';
import { algaeDefaults } from '../config/algae.js';

describe('calculateAlgaeGrowth', () => {
  it('returns 0 when light is 0', () => {
    const growth = calculateAlgaeGrowth(0, 100);
    expect(growth).toBe(0);
  });

  it('returns 0 when light is negative', () => {
    const growth = calculateAlgaeGrowth(-10, 100);
    expect(growth).toBe(0);
  });

  it('returns 0 when tank capacity is 0', () => {
    const growth = calculateAlgaeGrowth(100, 0);
    expect(growth).toBe(0);
  });

  it('returns 0 when tank capacity is negative', () => {
    const growth = calculateAlgaeGrowth(100, -10);
    expect(growth).toBe(0);
  });

  it('uses Michaelis-Menten saturation formula', () => {
    // 100W in 100L = 1 W/L
    // growth = maxGrowthRate * wpl / (halfSaturation + wpl)
    // growth = 4 * 1 / (1.3 + 1) = 4 / 2.3 ≈ 1.74
    const growth = calculateAlgaeGrowth(100, 100);
    const expected = (algaeDefaults.maxGrowthRate * 1.0) / (algaeDefaults.halfSaturation + 1.0);
    expect(growth).toBeCloseTo(expected, 6);
  });

  it('shows diminishing returns at high light intensity', () => {
    // With saturation curve, doubling light doesn't double growth
    const growth1 = calculateAlgaeGrowth(50, 100); // 0.5 W/L
    const growth2 = calculateAlgaeGrowth(100, 100); // 1.0 W/L
    const growth4 = calculateAlgaeGrowth(200, 100); // 2.0 W/L

    // Growth increases, but not linearly
    expect(growth2).toBeGreaterThan(growth1);
    expect(growth4).toBeGreaterThan(growth2);

    // But the ratios decrease (diminishing returns)
    const ratio1to2 = growth2 / growth1;
    const ratio2to4 = growth4 / growth2;
    expect(ratio2to4).toBeLessThan(ratio1to2);
  });

  it('approaches maxGrowthRate asymptotically at extreme light', () => {
    // Very high W/L should approach but not exceed maxGrowthRate
    const extremeGrowth = calculateAlgaeGrowth(1000, 100); // 10 W/L
    expect(extremeGrowth).toBeLessThan(algaeDefaults.maxGrowthRate);
    expect(extremeGrowth).toBeGreaterThan(algaeDefaults.maxGrowthRate * 0.85); // >85% of max
  });

  it('produces same growth rate for same W/L ratio', () => {
    // 10 gal (38L) with 10W = ~0.26 W/L
    const growth10gal = calculateAlgaeGrowth(10, 38);
    // 50 gal (190L) with 50W = ~0.26 W/L
    const growth50gal = calculateAlgaeGrowth(50, 190);
    // 100 gal (380L) with 100W = ~0.26 W/L
    const growth100gal = calculateAlgaeGrowth(100, 380);

    // All should produce approximately the same growth rate
    expect(growth10gal).toBeCloseTo(growth50gal, 2);
    expect(growth50gal).toBeCloseTo(growth100gal, 2);
  });

  // Calibration tests with saturation curve
  describe('calibration tests (saturation curve)', () => {
    it('10 gal (38L) with 10W (1 W/gal) gives ~0.67/hour (~16/day)', () => {
      const growth = calculateAlgaeGrowth(10, 38);
      // wpl = 10/38 ≈ 0.263, growth = 4 * 0.263 / 1.563 ≈ 0.67
      expect(growth).toBeCloseTo(0.67, 1);
    });

    it('50 gal (190L) with 50W (1 W/gal) gives ~0.67/hour', () => {
      const growth = calculateAlgaeGrowth(50, 190);
      expect(growth).toBeCloseTo(0.67, 1);
    });

    it('10 gal (38L) with 5W (0.5 W/gal) gives ~0.37/hour (~9/day)', () => {
      const growth = calculateAlgaeGrowth(5, 38);
      // wpl = 5/38 ≈ 0.132, growth = 4 * 0.132 / 1.432 ≈ 0.37
      expect(growth).toBeCloseTo(0.37, 1);
    });

    it('10 gal (38L) with 50W (5 W/gal) gives ~2.0/hour (diminished from linear)', () => {
      const growth = calculateAlgaeGrowth(50, 38);
      // wpl = 50/38 ≈ 1.316, growth = 4 * 1.316 / 2.616 ≈ 2.01
      // Linear would be 3.29, but saturation curve caps it
      expect(growth).toBeCloseTo(2.0, 1);
    });

    it('100 gal (380L) with 100W (1 W/gal) gives ~0.67/hour', () => {
      const growth = calculateAlgaeGrowth(100, 380);
      expect(growth).toBeCloseTo(0.67, 1);
    });

    it('100 gal (380L) with 200W (2 W/gal) gives ~1.15/hour', () => {
      const growth = calculateAlgaeGrowth(200, 380);
      // wpl = 200/380 ≈ 0.526, growth = 4 * 0.526 / 1.826 ≈ 1.15
      expect(growth).toBeCloseTo(1.15, 1);
    });

    it('5 gal (19L) with 200W (extreme) gives ~3.6/hour (not instant bloom)', () => {
      const growth = calculateAlgaeGrowth(200, 19);
      // wpl = 200/19 ≈ 10.5, growth = 4 * 10.5 / 11.8 ≈ 3.56
      // With 10hr photoperiod = 36/day (takes ~3 days to reach 100, not 1 day)
      expect(growth).toBeCloseTo(3.6, 1);
      expect(growth).toBeLessThan(algaeDefaults.maxGrowthRate);
    });
  });
});

describe('getWattsPerGallon', () => {
  it('converts watts and liters to W/gal correctly', () => {
    // 100W in 100L = 100W in ~26.4 gal = ~3.8 W/gal
    const wpg = getWattsPerGallon(100, 100);
    expect(wpg).toBeCloseTo(3.785, 2);
  });

  it('returns ~1 W/gal for typical setup', () => {
    // 10W in 38L (10 gal) = 1 W/gal
    const wpg = getWattsPerGallon(10, 38);
    expect(wpg).toBeCloseTo(1.0, 1);
  });

  it('handles large tanks', () => {
    // 100W in 380L (100 gal) = 1 W/gal
    const wpg = getWattsPerGallon(100, 380);
    expect(wpg).toBeCloseTo(1.0, 1);
  });
});

describe('algaeSystem', () => {
  function createTestState(overrides: Partial<{
    light: number;
    tankCapacity: number;
    algae: number;
  }> = {}): SimulationState {
    const capacity = overrides.tankCapacity ?? 100;
    const state = createSimulation({ tankCapacity: capacity });
    return produce(state, (draft) => {
      if (overrides.light !== undefined) {
        draft.resources.light = overrides.light;
      }
      if (overrides.algae !== undefined) {
        draft.resources.algae = overrides.algae;
      }
    });
  }

  it('has correct id and tier', () => {
    expect(algaeSystem.id).toBe('algae');
    expect(algaeSystem.tier).toBe('passive');
  });

  it('creates algae growth effect when light > 0', () => {
    const state = createTestState({ light: 100 });
    const effects = algaeSystem.update(state, DEFAULT_CONFIG);

    const algaeEffect = effects.find((e) => e.resource === 'algae');
    expect(algaeEffect).toBeDefined();
    expect(algaeEffect!.delta).toBeGreaterThan(0);
  });

  it('creates no effect when light is 0', () => {
    const state = createTestState({ light: 0 });
    const effects = algaeSystem.update(state, DEFAULT_CONFIG);

    expect(effects.length).toBe(0);
  });

  it('all effects have tier: passive', () => {
    const state = createTestState({ light: 100 });
    const effects = algaeSystem.update(state, DEFAULT_CONFIG);

    effects.forEach((effect) => {
      expect(effect.tier).toBe('passive');
    });
  });

  it('effect source is "algae"', () => {
    const state = createTestState({ light: 100 });
    const effects = algaeSystem.update(state, DEFAULT_CONFIG);

    const algaeEffect = effects.find((e) => e.resource === 'algae');
    expect(algaeEffect!.source).toBe('algae');
  });

  it('growth rate increases with light intensity (with diminishing returns)', () => {
    const dimState = createTestState({ light: 50 });
    const brightState = createTestState({ light: 100 });

    const dimEffects = algaeSystem.update(dimState, DEFAULT_CONFIG);
    const brightEffects = algaeSystem.update(brightState, DEFAULT_CONFIG);

    const dimGrowth = dimEffects.find((e) => e.resource === 'algae')!.delta;
    const brightGrowth = brightEffects.find((e) => e.resource === 'algae')!.delta;

    // More light = more growth, but not exactly 2x due to saturation
    expect(brightGrowth).toBeGreaterThan(dimGrowth);
    expect(brightGrowth).toBeLessThan(dimGrowth * 2); // Diminishing returns
  });

  it('larger tanks have slower growth with same wattage', () => {
    const smallTank = createTestState({ light: 100, tankCapacity: 50 });
    const largeTank = createTestState({ light: 100, tankCapacity: 100 });

    const smallEffects = algaeSystem.update(smallTank, DEFAULT_CONFIG);
    const largeEffects = algaeSystem.update(largeTank, DEFAULT_CONFIG);

    const smallGrowth = smallEffects.find((e) => e.resource === 'algae')!.delta;
    const largeGrowth = largeEffects.find((e) => e.resource === 'algae')!.delta;

    // Larger tank = slower growth (lower W/L), but not exactly half due to saturation
    expect(largeGrowth).toBeLessThan(smallGrowth);
  });
});

describe('config defaults', () => {
  it('maxGrowthRate is 4', () => {
    expect(algaeDefaults.maxGrowthRate).toBe(4);
  });

  it('halfSaturation is 1.3', () => {
    expect(algaeDefaults.halfSaturation).toBe(1.3);
  });

  it('algaeCap is 100', () => {
    expect(algaeDefaults.algaeCap).toBe(100);
  });
});

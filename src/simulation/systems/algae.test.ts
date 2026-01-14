import { describe, it, expect } from 'vitest';
import {
  algaeSystem,
  calculateAlgaeGrowth,
  getWattsPerGallon,
  BASE_GROWTH_RATE,
  ALGAE_CAP,
} from './algae.js';
import { createSimulation, type SimulationState } from '../state.js';
import { produce } from 'immer';

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

  it('calculates growth correctly with BASE_GROWTH_RATE', () => {
    // 100W light in 100L tank = 1 W/L
    // growth = 2.5 * 1 = 2.5 per hour
    const growth = calculateAlgaeGrowth(100, 100);
    expect(growth).toBeCloseTo(BASE_GROWTH_RATE * 1.0, 6);
  });

  it('scales linearly with light intensity', () => {
    const growth1 = calculateAlgaeGrowth(50, 100);
    const growth2 = calculateAlgaeGrowth(100, 100);
    expect(growth2).toBeCloseTo(growth1 * 2, 6);
  });

  it('scales inversely with tank size', () => {
    // Same wattage, double the tank size = half the growth
    const growth1 = calculateAlgaeGrowth(100, 50);
    const growth2 = calculateAlgaeGrowth(100, 100);
    expect(growth2).toBeCloseTo(growth1 / 2, 6);
  });

  it('produces same growth rate for same W/gal ratio', () => {
    // 10 gal (38L) with 10W = 1 W/gal
    const growth10gal = calculateAlgaeGrowth(10, 38);
    // 50 gal (190L) with 50W = 1 W/gal
    const growth50gal = calculateAlgaeGrowth(50, 190);
    // 100 gal (380L) with 100W = 1 W/gal
    const growth100gal = calculateAlgaeGrowth(100, 380);

    // All should produce approximately the same growth rate
    expect(growth10gal).toBeCloseTo(growth50gal, 2);
    expect(growth50gal).toBeCloseTo(growth100gal, 2);
  });

  // Calibration tests from task spec
  describe('calibration tests', () => {
    it('10 gal (38L) with 10W (1 W/gal) gives ~0.65/hour', () => {
      const growth = calculateAlgaeGrowth(10, 38);
      expect(growth).toBeCloseTo(0.65, 1);
    });

    it('50 gal (190L) with 50W (1 W/gal) gives ~0.65/hour', () => {
      const growth = calculateAlgaeGrowth(50, 190);
      expect(growth).toBeCloseTo(0.65, 1);
    });

    it('10 gal (38L) with 5W (0.5 W/gal) gives ~0.33/hour', () => {
      const growth = calculateAlgaeGrowth(5, 38);
      expect(growth).toBeCloseTo(0.33, 1);
    });

    it('10 gal (38L) with 50W (5 W/gal) gives ~3.29/hour (bloom!)', () => {
      const growth = calculateAlgaeGrowth(50, 38);
      expect(growth).toBeCloseTo(3.29, 1);
    });

    it('100 gal (380L) with 100W (1 W/gal) gives ~0.65/hour', () => {
      const growth = calculateAlgaeGrowth(100, 380);
      expect(growth).toBeCloseTo(0.65, 1);
    });

    it('100 gal (380L) with 200W (2 W/gal) gives ~1.33/hour', () => {
      const growth = calculateAlgaeGrowth(200, 380);
      expect(growth).toBeCloseTo(1.33, 1);
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
        draft.passiveResources.light = overrides.light;
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
    const effects = algaeSystem.update(state);

    const algaeEffect = effects.find((e) => e.resource === 'algae');
    expect(algaeEffect).toBeDefined();
    expect(algaeEffect!.delta).toBeGreaterThan(0);
  });

  it('creates no effect when light is 0', () => {
    const state = createTestState({ light: 0 });
    const effects = algaeSystem.update(state);

    expect(effects.length).toBe(0);
  });

  it('all effects have tier: passive', () => {
    const state = createTestState({ light: 100 });
    const effects = algaeSystem.update(state);

    effects.forEach((effect) => {
      expect(effect.tier).toBe('passive');
    });
  });

  it('effect source is "algae"', () => {
    const state = createTestState({ light: 100 });
    const effects = algaeSystem.update(state);

    const algaeEffect = effects.find((e) => e.resource === 'algae');
    expect(algaeEffect!.source).toBe('algae');
  });

  it('growth rate depends on light intensity per liter', () => {
    const dimState = createTestState({ light: 50 });
    const brightState = createTestState({ light: 100 });

    const dimEffects = algaeSystem.update(dimState);
    const brightEffects = algaeSystem.update(brightState);

    const dimGrowth = dimEffects.find((e) => e.resource === 'algae')!.delta;
    const brightGrowth = brightEffects.find((e) => e.resource === 'algae')!.delta;

    expect(brightGrowth).toBeCloseTo(dimGrowth * 2, 6);
  });

  it('larger tanks have slower growth with same wattage', () => {
    const smallTank = createTestState({ light: 100, tankCapacity: 50 });
    const largeTank = createTestState({ light: 100, tankCapacity: 100 });

    const smallEffects = algaeSystem.update(smallTank);
    const largeEffects = algaeSystem.update(largeTank);

    const smallGrowth = smallEffects.find((e) => e.resource === 'algae')!.delta;
    const largeGrowth = largeEffects.find((e) => e.resource === 'algae')!.delta;

    expect(largeGrowth).toBeCloseTo(smallGrowth / 2, 6);
  });
});

describe('constants', () => {
  it('BASE_GROWTH_RATE is 2.5', () => {
    expect(BASE_GROWTH_RATE).toBe(2.5);
  });

  it('ALGAE_CAP is 100', () => {
    expect(ALGAE_CAP).toBe(100);
  });
});

import { describe, it, expect } from 'vitest';
import {
  nitrogenCycleSystem,
  calculateMaxBacteriaCapacity,
  calculateFoodFactor,
  calculateCapacityFactor,
  calculateWasteConversion,
  calculateAOBConversion,
  calculateNOBConversion,
  calculateBacteriaChange,
  gramsToPpm,
  ppmToGrams,
  WASTE_TO_AMMONIA_RATE,
  AOB_CONVERSION_RATE,
  NOB_CONVERSION_RATE,
  NH3_TO_NO2_RATIO,
  AOB_GROWTH_RATE,
  NOB_GROWTH_RATE,
  AOB_DEATH_RATE,
  NOB_DEATH_RATE,
  MIN_FOOD_AOB,
  MIN_FOOD_NOB,
  BACTERIA_PER_CM2,
} from './nitrogen-cycle.js';
import { createSimulation, type SimulationState } from '../state.js';
import { produce } from 'immer';
import { applyEffects } from '../core/effects.js';

// ============================================================================
// Helper Functions Tests
// ============================================================================

describe('calculateMaxBacteriaCapacity', () => {
  it('returns 0 for 0 surface area', () => {
    expect(calculateMaxBacteriaCapacity(0)).toBe(0);
  });

  it('returns correct capacity based on surface area', () => {
    // 10,000 cm² * 0.0001 = 1.0 bacteria unit max
    expect(calculateMaxBacteriaCapacity(10000)).toBe(1.0);
  });

  it('scales linearly with surface area', () => {
    const cap1 = calculateMaxBacteriaCapacity(5000);
    const cap2 = calculateMaxBacteriaCapacity(10000);
    expect(cap2).toBe(cap1 * 2);
  });

  it('uses BACTERIA_PER_CM2 constant', () => {
    const surface = 20000;
    expect(calculateMaxBacteriaCapacity(surface)).toBe(surface * BACTERIA_PER_CM2);
  });
});

describe('calculateFoodFactor', () => {
  it('returns 1.0 when food >= minFood', () => {
    expect(calculateFoodFactor(0.01, 0.001)).toBe(1.0);
  });

  it('returns 1.0 when food equals minFood', () => {
    expect(calculateFoodFactor(0.001, 0.001)).toBe(1.0);
  });

  it('returns fractional value when food < minFood', () => {
    expect(calculateFoodFactor(0.0005, 0.001)).toBe(0.5);
  });

  it('returns 0 when food is 0', () => {
    expect(calculateFoodFactor(0, 0.001)).toBe(0);
  });

  it('returns 1.0 when minFood is 0', () => {
    expect(calculateFoodFactor(0.001, 0)).toBe(1.0);
  });

  it('returns 1.0 when minFood is negative', () => {
    expect(calculateFoodFactor(0.001, -1)).toBe(1.0);
  });
});

describe('calculateCapacityFactor', () => {
  it('returns 1.0 when population is 0', () => {
    expect(calculateCapacityFactor(0, 1.0)).toBe(1.0);
  });

  it('returns 0 when population equals max capacity', () => {
    expect(calculateCapacityFactor(1.0, 1.0)).toBe(0);
  });

  it('returns 0.5 when population is half of max', () => {
    expect(calculateCapacityFactor(0.5, 1.0)).toBe(0.5);
  });

  it('returns 0 when maxCapacity is 0', () => {
    expect(calculateCapacityFactor(0.5, 0)).toBe(0);
  });

  it('returns 0 (clamped) when population exceeds max', () => {
    expect(calculateCapacityFactor(1.5, 1.0)).toBe(0);
  });
});

describe('calculateWasteConversion', () => {
  it('returns 0 when waste is 0', () => {
    expect(calculateWasteConversion(0)).toBe(0);
  });

  it('returns 0 when waste is negative', () => {
    expect(calculateWasteConversion(-1)).toBe(0);
  });

  it('converts fraction of waste based on WASTE_TO_AMMONIA_RATE', () => {
    const waste = 1.0;
    const converted = calculateWasteConversion(waste);
    expect(converted).toBe(waste * WASTE_TO_AMMONIA_RATE);
  });

  it('never converts more than available waste', () => {
    // With WASTE_TO_AMMONIA_RATE = 0.1, converting 0.05g should return 0.005g
    const waste = 0.05;
    const converted = calculateWasteConversion(waste);
    expect(converted).toBeLessThanOrEqual(waste);
  });

  it('scales linearly with waste amount', () => {
    const conv1 = calculateWasteConversion(1.0);
    const conv2 = calculateWasteConversion(2.0);
    expect(conv2).toBe(conv1 * 2);
  });
});

describe('calculateAOBConversion', () => {
  it('returns 0 when ammonia is 0', () => {
    expect(calculateAOBConversion(0, 0.5, 1.0)).toBe(0);
  });

  it('returns 0 when AOB population is 0', () => {
    expect(calculateAOBConversion(1.0, 0, 1.0)).toBe(0);
  });

  it('returns 0 when ammonia is negative', () => {
    expect(calculateAOBConversion(-1, 0.5, 1.0)).toBe(0);
  });

  it('scales with AOB population and max capacity', () => {
    const ammonia = 10; // plenty of ammonia
    const maxCapacity = 1.0;

    const conv1 = calculateAOBConversion(ammonia, 0.5, maxCapacity);
    const conv2 = calculateAOBConversion(ammonia, 1.0, maxCapacity);

    // Double population should double conversion
    expect(conv2).toBeCloseTo(conv1 * 2, 10);
  });

  it('never consumes more ammonia than available', () => {
    const ammonia = 0.00001; // very little ammonia
    const converted = calculateAOBConversion(ammonia, 1.0, 100);
    expect(converted).toBeLessThanOrEqual(ammonia);
  });

  it('uses AOB_CONVERSION_RATE constant', () => {
    const ammonia = 100; // plenty
    const aob = 0.5;
    const maxCapacity = 1.0;
    const effectivePop = aob * maxCapacity;
    const expected = AOB_CONVERSION_RATE * effectivePop;
    expect(calculateAOBConversion(ammonia, aob, maxCapacity)).toBe(expected);
  });
});

describe('calculateNOBConversion', () => {
  it('returns 0 when nitrite is 0', () => {
    expect(calculateNOBConversion(0, 0.5, 1.0)).toBe(0);
  });

  it('returns 0 when NOB population is 0', () => {
    expect(calculateNOBConversion(1.0, 0, 1.0)).toBe(0);
  });

  it('returns 0 when nitrite is negative', () => {
    expect(calculateNOBConversion(-1, 0.5, 1.0)).toBe(0);
  });

  it('scales with NOB population and max capacity', () => {
    const nitrite = 10; // plenty of nitrite
    const maxCapacity = 1.0;

    const conv1 = calculateNOBConversion(nitrite, 0.5, maxCapacity);
    const conv2 = calculateNOBConversion(nitrite, 1.0, maxCapacity);

    expect(conv2).toBeCloseTo(conv1 * 2, 10);
  });

  it('never consumes more nitrite than available', () => {
    const nitrite = 0.00001;
    const converted = calculateNOBConversion(nitrite, 1.0, 100);
    expect(converted).toBeLessThanOrEqual(nitrite);
  });

  it('uses NOB_CONVERSION_RATE constant', () => {
    const nitrite = 100;
    const nob = 0.5;
    const maxCapacity = 1.0;
    const effectivePop = nob * maxCapacity;
    const expected = NOB_CONVERSION_RATE * effectivePop;
    expect(calculateNOBConversion(nitrite, nob, maxCapacity)).toBe(expected);
  });
});

describe('calculateBacteriaChange', () => {
  it('returns 0 when population is 0', () => {
    const change = calculateBacteriaChange(0, 1.0, 0.001, 0.1, 0.01, 1.0);
    expect(change).toBe(0);
  });

  it('returns negative population when maxCapacity is 0', () => {
    const pop = 0.5;
    const change = calculateBacteriaChange(pop, 1.0, 0.001, 0.1, 0.01, 0);
    expect(change).toBe(-pop);
  });

  it('bacteria grow when food is abundant and capacity available', () => {
    const change = calculateBacteriaChange(
      0.5,      // 50% population
      0.01,     // plenty of food (10x minFood)
      0.001,    // minFood
      0.1,      // growth rate
      0.01,     // death rate
      1.0       // maxCapacity
    );
    expect(change).toBeGreaterThan(0);
  });

  it('bacteria die when food is scarce', () => {
    const change = calculateBacteriaChange(
      0.5,      // 50% population
      0,        // no food
      0.001,    // minFood
      0.1,      // growth rate
      0.01,     // death rate
      1.0       // maxCapacity
    );
    expect(change).toBeLessThan(0);
  });

  it('growth slows as population approaches capacity (logistic)', () => {
    const food = 0.01;
    const minFood = 0.001;
    const growthRate = 0.1;
    const deathRate = 0.01;
    const maxCapacity = 1.0;

    const changeAt50 = calculateBacteriaChange(0.5, food, minFood, growthRate, deathRate, maxCapacity);
    const changeAt90 = calculateBacteriaChange(0.9, food, minFood, growthRate, deathRate, maxCapacity);

    // Net change at 90% should be less than at 50% due to capacity factor
    expect(changeAt90).toBeLessThan(changeAt50);
  });

  it('uses AOB rates correctly', () => {
    const pop = 0.5;
    const food = MIN_FOOD_AOB * 2; // adequate food
    const change = calculateBacteriaChange(
      pop,
      food,
      MIN_FOOD_AOB,
      AOB_GROWTH_RATE,
      AOB_DEATH_RATE,
      1.0
    );

    // With food = 2x minFood, foodFactor = 1.0
    // capacityFactor = 1 - 0.5 = 0.5
    // growth = 0.069 * 1.0 * 0.5 * 0.5 = 0.01725
    // death = 0.012 * 0 * 0.5 = 0
    const expected = AOB_GROWTH_RATE * 1.0 * 0.5 * pop;
    expect(change).toBeCloseTo(expected, 10);
  });

  it('uses NOB rates correctly', () => {
    const pop = 0.5;
    const food = MIN_FOOD_NOB * 2;
    const change = calculateBacteriaChange(
      pop,
      food,
      MIN_FOOD_NOB,
      NOB_GROWTH_RATE,
      NOB_DEATH_RATE,
      1.0
    );

    const expected = NOB_GROWTH_RATE * 1.0 * 0.5 * pop;
    expect(change).toBeCloseTo(expected, 10);
  });
});

// ============================================================================
// Utility Functions Tests
// ============================================================================

describe('gramsToPpm', () => {
  it('returns 0 when liters is 0', () => {
    expect(gramsToPpm(1.0, 0)).toBe(0);
  });

  it('returns 0 when grams is 0', () => {
    expect(gramsToPpm(0, 100)).toBe(0);
  });

  it('correctly converts grams to ppm', () => {
    // 0.001g in 1L = 1 ppm
    expect(gramsToPpm(0.001, 1)).toBe(1);
  });

  it('correctly converts for larger volumes', () => {
    // 0.1g in 100L = (0.1/100)*1000 = 1 ppm
    expect(gramsToPpm(0.1, 100)).toBe(1);
  });

  it('is inverse of ppmToGrams', () => {
    const grams = 0.05;
    const liters = 40;
    const ppm = gramsToPpm(grams, liters);
    const backToGrams = ppmToGrams(ppm, liters);
    expect(backToGrams).toBeCloseTo(grams, 10);
  });
});

describe('ppmToGrams', () => {
  it('returns 0 when ppm is 0', () => {
    expect(ppmToGrams(0, 100)).toBe(0);
  });

  it('correctly converts ppm to grams', () => {
    // 1 ppm in 1L = 0.001g
    expect(ppmToGrams(1, 1)).toBe(0.001);
  });

  it('correctly converts for larger volumes', () => {
    // 1 ppm in 100L = 0.1g
    expect(ppmToGrams(1, 100)).toBe(0.1);
  });

  it('scales linearly with volume', () => {
    const ppm = 5;
    expect(ppmToGrams(ppm, 100)).toBe(ppmToGrams(ppm, 50) * 2);
  });
});

// ============================================================================
// Nitrogen Cycle System Tests
// ============================================================================

describe('nitrogenCycleSystem', () => {
  function createTestState(overrides: Partial<{
    waste: number;
    ammonia: number;
    nitrite: number;
    nitrate: number;
    aob: number;
    nob: number;
    surface: number;
  }> = {}): SimulationState {
    const state = createSimulation({ tankCapacity: 100 });
    return produce(state, (draft) => {
      if (overrides.waste !== undefined) draft.resources.waste = overrides.waste;
      if (overrides.ammonia !== undefined) draft.resources.ammonia = overrides.ammonia;
      if (overrides.nitrite !== undefined) draft.resources.nitrite = overrides.nitrite;
      if (overrides.nitrate !== undefined) draft.resources.nitrate = overrides.nitrate;
      if (overrides.aob !== undefined) draft.resources.aob = overrides.aob;
      if (overrides.nob !== undefined) draft.resources.nob = overrides.nob;
      if (overrides.surface !== undefined) draft.passiveResources.surface = overrides.surface;
    });
  }

  it('has correct id and tier', () => {
    expect(nitrogenCycleSystem.id).toBe('nitrogen-cycle');
    expect(nitrogenCycleSystem.tier).toBe('passive');
  });

  describe('Stage 1: Waste -> Ammonia', () => {
    it('converts waste to ammonia when waste > 0', () => {
      const state = createTestState({ waste: 1.0 });
      const effects = nitrogenCycleSystem.update(state);

      const wasteEffect = effects.find(e => e.resource === 'waste');
      const ammoniaEffect = effects.find(e => e.resource === 'ammonia' && e.source === 'nitrogen-cycle');

      expect(wasteEffect).toBeDefined();
      expect(wasteEffect!.delta).toBeLessThan(0);
      expect(ammoniaEffect).toBeDefined();
      expect(ammoniaEffect!.delta).toBeGreaterThan(0);
    });

    it('does not produce effects when waste is 0', () => {
      const state = createTestState({ waste: 0, ammonia: 0, aob: 0, nob: 0 });
      const effects = nitrogenCycleSystem.update(state);

      const wasteEffect = effects.find(e => e.resource === 'waste');
      expect(wasteEffect).toBeUndefined();
    });

    it('ammonia produced equals waste consumed * WASTE_TO_AMMONIA_RATE', () => {
      const state = createTestState({ waste: 1.0 });
      const effects = nitrogenCycleSystem.update(state);

      const wasteEffect = effects.find(e => e.resource === 'waste')!;
      const ammoniaEffect = effects.find(e => e.resource === 'ammonia' && e.source === 'nitrogen-cycle')!;

      const wasteConsumed = -wasteEffect.delta;
      expect(ammoniaEffect.delta).toBeCloseTo(wasteConsumed * WASTE_TO_AMMONIA_RATE, 10);
    });
  });

  describe('Stage 2: Ammonia -> Nitrite (AOB)', () => {
    it('AOB converts ammonia to nitrite when both present', () => {
      const state = createTestState({ ammonia: 0.1, aob: 0.5, surface: 10000 });
      const effects = nitrogenCycleSystem.update(state);

      const ammoniaEffect = effects.find(e => e.resource === 'ammonia' && e.source === 'aob');
      const nitriteEffect = effects.find(e => e.resource === 'nitrite' && e.source === 'aob');

      expect(ammoniaEffect).toBeDefined();
      expect(ammoniaEffect!.delta).toBeLessThan(0);
      expect(nitriteEffect).toBeDefined();
      expect(nitriteEffect!.delta).toBeGreaterThan(0);
    });

    it('no conversion when ammonia is 0', () => {
      const state = createTestState({ ammonia: 0, aob: 0.5, surface: 10000 });
      const effects = nitrogenCycleSystem.update(state);

      const aobEffect = effects.find(e => e.source === 'aob');
      expect(aobEffect).toBeUndefined();
    });

    it('no conversion when AOB is 0', () => {
      const state = createTestState({ ammonia: 0.1, aob: 0, surface: 10000 });
      const effects = nitrogenCycleSystem.update(state);

      const aobEffect = effects.find(e => e.source === 'aob');
      expect(aobEffect).toBeUndefined();
    });

    it('nitrite produced uses NH3_TO_NO2_RATIO', () => {
      const state = createTestState({ ammonia: 0.1, aob: 0.5, surface: 10000 });
      const effects = nitrogenCycleSystem.update(state);

      const ammoniaEffect = effects.find(e => e.resource === 'ammonia' && e.source === 'aob')!;
      const nitriteEffect = effects.find(e => e.resource === 'nitrite' && e.source === 'aob')!;

      const ammoniaConsumed = -ammoniaEffect.delta;
      expect(nitriteEffect.delta).toBeCloseTo(ammoniaConsumed * NH3_TO_NO2_RATIO, 10);
    });
  });

  describe('Stage 3: Nitrite -> Nitrate (NOB)', () => {
    it('NOB converts nitrite to nitrate when both present', () => {
      const state = createTestState({ nitrite: 0.1, nob: 0.5, surface: 10000 });
      const effects = nitrogenCycleSystem.update(state);

      const nitriteEffect = effects.find(e => e.resource === 'nitrite' && e.source === 'nob');
      const nitrateEffect = effects.find(e => e.resource === 'nitrate' && e.source === 'nob');

      expect(nitriteEffect).toBeDefined();
      expect(nitriteEffect!.delta).toBeLessThan(0);
      expect(nitrateEffect).toBeDefined();
      expect(nitrateEffect!.delta).toBeGreaterThan(0);
    });

    it('no conversion when nitrite is 0', () => {
      const state = createTestState({ nitrite: 0, nob: 0.5, surface: 10000 });
      const effects = nitrogenCycleSystem.update(state);

      const nobEffect = effects.find(e => e.source === 'nob');
      expect(nobEffect).toBeUndefined();
    });

    it('no conversion when NOB is 0', () => {
      const state = createTestState({ nitrite: 0.1, nob: 0, surface: 10000 });
      const effects = nitrogenCycleSystem.update(state);

      const nobEffect = effects.find(e => e.source === 'nob');
      expect(nobEffect).toBeUndefined();
    });

    it('nitrate produced equals nitrite consumed (1:1 ratio)', () => {
      const state = createTestState({ nitrite: 0.1, nob: 0.5, surface: 10000 });
      const effects = nitrogenCycleSystem.update(state);

      const nitriteEffect = effects.find(e => e.resource === 'nitrite' && e.source === 'nob')!;
      const nitrateEffect = effects.find(e => e.resource === 'nitrate' && e.source === 'nob')!;

      expect(nitrateEffect.delta).toBe(-nitriteEffect.delta);
    });
  });

  describe('Bacterial Population Dynamics', () => {
    it('AOB grows when ammonia is present', () => {
      const state = createTestState({ ammonia: 0.01, aob: 0.1, surface: 10000 });
      const effects = nitrogenCycleSystem.update(state);

      const aobEffect = effects.find(e => e.resource === 'aob');
      expect(aobEffect).toBeDefined();
      expect(aobEffect!.delta).toBeGreaterThan(0);
    });

    it('AOB dies when no ammonia present', () => {
      const state = createTestState({ ammonia: 0, aob: 0.5, surface: 10000 });
      const effects = nitrogenCycleSystem.update(state);

      const aobEffect = effects.find(e => e.resource === 'aob');
      expect(aobEffect).toBeDefined();
      expect(aobEffect!.delta).toBeLessThan(0);
    });

    it('NOB grows when nitrite is present', () => {
      const state = createTestState({ nitrite: 0.01, nob: 0.1, surface: 10000 });
      const effects = nitrogenCycleSystem.update(state);

      const nobEffect = effects.find(e => e.resource === 'nob');
      expect(nobEffect).toBeDefined();
      expect(nobEffect!.delta).toBeGreaterThan(0);
    });

    it('NOB dies when no nitrite present', () => {
      const state = createTestState({ nitrite: 0, nob: 0.5, surface: 10000 });
      const effects = nitrogenCycleSystem.update(state);

      const nobEffect = effects.find(e => e.resource === 'nob');
      expect(nobEffect).toBeDefined();
      expect(nobEffect!.delta).toBeLessThan(0);
    });

    it('no bacteria change when population is 0', () => {
      const state = createTestState({ ammonia: 0.1, aob: 0, nob: 0, surface: 10000 });
      const effects = nitrogenCycleSystem.update(state);

      const aobEffect = effects.find(e => e.resource === 'aob');
      const nobEffect = effects.find(e => e.resource === 'nob');
      expect(aobEffect).toBeUndefined();
      expect(nobEffect).toBeUndefined();
    });
  });

  describe('Effect Properties', () => {
    it('all effects have tier: passive', () => {
      const state = createTestState({
        waste: 1.0,
        ammonia: 0.1,
        nitrite: 0.1,
        aob: 0.5,
        nob: 0.5,
        surface: 10000,
      });
      const effects = nitrogenCycleSystem.update(state);

      effects.forEach(effect => {
        expect(effect.tier).toBe('passive');
      });
    });

    it('effects have correct sources', () => {
      const state = createTestState({
        waste: 1.0,
        ammonia: 0.1,
        nitrite: 0.1,
        aob: 0.5,
        nob: 0.5,
        surface: 10000,
      });
      const effects = nitrogenCycleSystem.update(state);

      // Check for expected sources
      expect(effects.some(e => e.source === 'nitrogen-cycle')).toBe(true);
      expect(effects.some(e => e.source === 'aob')).toBe(true);
      expect(effects.some(e => e.source === 'nob')).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('handles zero waste, zero bacteria (no changes)', () => {
      const state = createTestState({
        waste: 0,
        ammonia: 0,
        nitrite: 0,
        aob: 0,
        nob: 0,
        surface: 10000,
      });
      const effects = nitrogenCycleSystem.update(state);
      expect(effects.length).toBe(0);
    });

    it('handles maximum bacteria with no food (death occurs)', () => {
      const state = createTestState({
        waste: 0,
        ammonia: 0,
        nitrite: 0,
        aob: 1.0,
        nob: 1.0,
        surface: 10000,
      });
      const effects = nitrogenCycleSystem.update(state);

      const aobEffect = effects.find(e => e.resource === 'aob');
      const nobEffect = effects.find(e => e.resource === 'nob');

      expect(aobEffect).toBeDefined();
      expect(aobEffect!.delta).toBeLessThan(0);
      expect(nobEffect).toBeDefined();
      expect(nobEffect!.delta).toBeLessThan(0);
    });

    it('handles very high waste influx', () => {
      const state = createTestState({
        waste: 100,
        ammonia: 0,
        aob: 0.01, // small population
        surface: 10000,
      });
      const effects = nitrogenCycleSystem.update(state);

      // Should convert some waste but bacteria can't keep up
      const wasteEffect = effects.find(e => e.resource === 'waste');
      const ammoniaEffect = effects.find(e => e.resource === 'ammonia' && e.source === 'nitrogen-cycle');

      expect(wasteEffect).toBeDefined();
      expect(ammoniaEffect).toBeDefined();
      // Ammonia should be produced
      expect(ammoniaEffect!.delta).toBeGreaterThan(0);
    });
  });

  describe('Integration: Multi-tick Simulation', () => {
    it('full cycle: waste -> ammonia -> nitrite -> nitrate accumulation', () => {
      let state = createTestState({
        waste: 0.5,
        ammonia: 0,
        nitrite: 0,
        nitrate: 0,
        aob: 0.5,
        nob: 0.5,
        surface: 10000,
      });

      // Simulate 100 ticks
      for (let i = 0; i < 100; i++) {
        const effects = nitrogenCycleSystem.update(state);
        state = applyEffects(state, effects);
      }

      // After cycling, nitrate should have accumulated
      expect(state.resources.nitrate).toBeGreaterThan(0);
      // Some waste should have been consumed
      expect(state.resources.waste).toBeLessThan(0.5);
    });

    it('bacteria populations are clamped between 0 and 1', () => {
      let state = createTestState({
        ammonia: 1.0, // lots of food for growth
        nitrite: 1.0,
        aob: 0.99,
        nob: 0.99,
        surface: 10000,
      });

      // Simulate growth
      for (let i = 0; i < 50; i++) {
        const effects = nitrogenCycleSystem.update(state);
        state = applyEffects(state, effects);
      }

      // Should be clamped at 1.0
      expect(state.resources.aob).toBeLessThanOrEqual(1.0);
      expect(state.resources.nob).toBeLessThanOrEqual(1.0);

      // Now test death
      state = produce(state, draft => {
        draft.resources.ammonia = 0;
        draft.resources.nitrite = 0;
      });

      for (let i = 0; i < 200; i++) {
        const effects = nitrogenCycleSystem.update(state);
        state = applyEffects(state, effects);
      }

      // Should be clamped at 0.0
      expect(state.resources.aob).toBeGreaterThanOrEqual(0);
      expect(state.resources.nob).toBeGreaterThanOrEqual(0);
    });

    it('AOB grows faster than NOB (creates sequential spikes)', () => {
      // Start with equal small populations
      let state = createTestState({
        ammonia: 0.1,
        nitrite: 0.1,
        aob: 0.1,
        nob: 0.1,
        surface: 10000,
      });

      // Simulate one tick
      const effects = nitrogenCycleSystem.update(state);
      const aobGrowth = effects.find(e => e.resource === 'aob')?.delta ?? 0;
      const nobGrowth = effects.find(e => e.resource === 'nob')?.delta ?? 0;

      // AOB should grow faster (higher growth rate)
      expect(aobGrowth).toBeGreaterThan(nobGrowth);
    });
  });
});

// ============================================================================
// State Initialization Tests
// ============================================================================

describe('State Initialization', () => {
  it('creates state with nitrogen cycle resources', () => {
    const state = createSimulation({ tankCapacity: 100 });

    expect(state.resources.ammonia).toBe(0);
    expect(state.resources.nitrite).toBe(0);
    expect(state.resources.nitrate).toBe(0);
    expect(state.resources.aob).toBe(0.001); // Initial seed population
    expect(state.resources.nob).toBe(0.0005); // Initial seed population
  });

  it('creates state with nitrogen alert flags', () => {
    const state = createSimulation({ tankCapacity: 100 });

    expect(state.alertState.highAmmonia).toBe(false);
    expect(state.alertState.highNitrite).toBe(false);
    expect(state.alertState.highNitrate).toBe(false);
  });
});

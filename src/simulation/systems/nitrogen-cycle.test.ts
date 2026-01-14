import { describe, it, expect } from 'vitest';
import {
  nitrogenCycleSystem,
  updateNitrogenCycle,
  calculateMaxBacteriaCapacity,
  wasteToAmmoniaPPM,
  calculateBacteriaGrowth,
  calculateBacteriaDeath,
  MAX_WASTE_CONVERSION_PER_HOUR,
  WASTE_TO_AMMONIA_FACTOR,
  NH3_TO_NO2_RATIO,
  NO2_TO_NO3_RATIO,
  BACTERIA_DOUBLING_TIME,
  BACTERIA_GROWTH_RATE,
  BACTERIA_STARVATION_DAYS,
  BACTERIA_DEATH_RATE,
  MIN_FOOD_AOB,
  MIN_FOOD_NOB,
  SPAWN_THRESHOLD_AOB,
  SPAWN_THRESHOLD_NOB,
  INITIAL_BACTERIA_SPAWN,
  MIN_BACTERIA_FLOOR,
  BACTERIA_PER_CM2,
} from './nitrogen-cycle.js';
import { createSimulation, type SimulationState } from '../state.js';
import { produce } from 'immer';

describe('calculateMaxBacteriaCapacity', () => {
  it('returns correct capacity for given surface area', () => {
    const capacity = calculateMaxBacteriaCapacity(10000); // 10,000 cm²
    expect(capacity).toBe(10000 * BACTERIA_PER_CM2);
  });

  it('returns 0 for 0 surface area', () => {
    const capacity = calculateMaxBacteriaCapacity(0);
    expect(capacity).toBe(0);
  });

  it('scales linearly with surface area', () => {
    const capacity1 = calculateMaxBacteriaCapacity(5000);
    const capacity2 = calculateMaxBacteriaCapacity(10000);
    expect(capacity2).toBe(capacity1 * 2);
  });
});

describe('wasteToAmmoniaPPM', () => {
  it('returns 0 for 0 waste', () => {
    const ppm = wasteToAmmoniaPPM(0, 40);
    expect(ppm).toBe(0);
  });

  it('returns 0 for negative waste', () => {
    const ppm = wasteToAmmoniaPPM(-1, 40);
    expect(ppm).toBe(0);
  });

  it('returns 0 for 0 water volume', () => {
    const ppm = wasteToAmmoniaPPM(1, 0);
    expect(ppm).toBe(0);
  });

  it('converts waste to ammonia using correct factor', () => {
    // 1g waste in 40L
    // ammonia = 1 * WASTE_TO_AMMONIA_FACTOR = 0.15g = 150mg
    // ppm = 150mg / 40L = 3.75 ppm
    const ppm = wasteToAmmoniaPPM(1, 40);
    const expected = (1 * WASTE_TO_AMMONIA_FACTOR * 1000) / 40;
    expect(ppm).toBeCloseTo(expected, 6);
  });

  it('scales inversely with water volume', () => {
    const ppm40 = wasteToAmmoniaPPM(1, 40);
    const ppm80 = wasteToAmmoniaPPM(1, 80);
    expect(ppm40).toBeCloseTo(ppm80 * 2, 6);
  });

  it('scales linearly with waste amount', () => {
    const ppm1 = wasteToAmmoniaPPM(1, 40);
    const ppm2 = wasteToAmmoniaPPM(2, 40);
    expect(ppm2).toBeCloseTo(ppm1 * 2, 6);
  });
});

describe('calculateBacteriaGrowth', () => {
  const maxCapacity = 10;

  it('returns 0 when population is 0', () => {
    const growth = calculateBacteriaGrowth(0, 1.0, MIN_FOOD_AOB, maxCapacity);
    expect(growth).toBe(0);
  });

  it('returns 0 when food is below minimum', () => {
    const growth = calculateBacteriaGrowth(1, 0.001, MIN_FOOD_AOB, maxCapacity);
    expect(growth).toBe(0);
  });

  it('returns 0 when at max capacity', () => {
    const growth = calculateBacteriaGrowth(10, 1.0, MIN_FOOD_AOB, maxCapacity);
    expect(growth).toBe(0);
  });

  it('returns positive growth when conditions are good', () => {
    const growth = calculateBacteriaGrowth(1, 1.0, MIN_FOOD_AOB, maxCapacity);
    expect(growth).toBeGreaterThan(0);
  });

  it('growth slows near capacity (logistic)', () => {
    // At low population, growth is faster per capita
    const growthLow = calculateBacteriaGrowth(1, 1.0, MIN_FOOD_AOB, maxCapacity);
    const growthHigh = calculateBacteriaGrowth(9, 1.0, MIN_FOOD_AOB, maxCapacity);

    // Per-capita growth rate should be lower at high population
    const perCapitaLow = growthLow / 1;
    const perCapitaHigh = growthHigh / 9;
    expect(perCapitaHigh).toBeLessThan(perCapitaLow);
  });

  it('food factor scales growth', () => {
    // More food should not increase growth beyond cap
    const growth1 = calculateBacteriaGrowth(1, MIN_FOOD_AOB, MIN_FOOD_AOB, maxCapacity);
    const growth2 = calculateBacteriaGrowth(1, MIN_FOOD_AOB * 10, MIN_FOOD_AOB, maxCapacity);
    // Both should be similar when food factor is capped at 1.0
    expect(growth2).toBeGreaterThanOrEqual(growth1);
  });
});

describe('calculateBacteriaDeath', () => {
  it('returns 0 when population is 0', () => {
    const death = calculateBacteriaDeath(0, 0, MIN_FOOD_AOB);
    expect(death).toBe(0);
  });

  it('returns 0 when food is sufficient', () => {
    const death = calculateBacteriaDeath(1, MIN_FOOD_AOB, MIN_FOOD_AOB);
    expect(death).toBe(0);
  });

  it('returns positive death when food is below minimum', () => {
    const death = calculateBacteriaDeath(1, 0, MIN_FOOD_AOB);
    expect(death).toBeGreaterThan(0);
  });

  it('death rate matches expected starvation timeline', () => {
    // Should die off in ~5 days (120 hours)
    const death = calculateBacteriaDeath(1, 0, MIN_FOOD_AOB);
    expect(death).toBeCloseTo(BACTERIA_DEATH_RATE, 6);
  });

  it('scales with population size', () => {
    const death1 = calculateBacteriaDeath(1, 0, MIN_FOOD_AOB);
    const death10 = calculateBacteriaDeath(10, 0, MIN_FOOD_AOB);
    expect(death10).toBeCloseTo(death1 * 10, 6);
  });
});

describe('nitrogenCycleSystem', () => {
  function createTestState(
    overrides: Partial<{
      waste: number;
      water: number;
      ammonia: number;
      nitrite: number;
      nitrate: number;
      aob: number;
      nob: number;
      surface: number;
    }> = {}
  ): SimulationState {
    const state = createSimulation({ tankCapacity: 40 });
    return produce(state, (draft) => {
      if (overrides.waste !== undefined) draft.resources.waste = overrides.waste;
      if (overrides.water !== undefined) draft.resources.water = overrides.water;
      if (overrides.ammonia !== undefined) draft.resources.ammonia = overrides.ammonia;
      if (overrides.nitrite !== undefined) draft.resources.nitrite = overrides.nitrite;
      if (overrides.nitrate !== undefined) draft.resources.nitrate = overrides.nitrate;
      if (overrides.aob !== undefined) draft.resources.aob = overrides.aob;
      if (overrides.nob !== undefined) draft.resources.nob = overrides.nob;
      if (overrides.surface !== undefined) draft.resources.surface = overrides.surface;
    });
  }

  it('has correct id and tier', () => {
    expect(nitrogenCycleSystem.id).toBe('nitrogen-cycle');
    expect(nitrogenCycleSystem.tier).toBe('passive');
  });

  describe('Stage 1: Waste → Ammonia', () => {
    it('converts waste to ammonia', () => {
      const state = createTestState({ waste: 0.1, water: 40 });
      const effects = updateNitrogenCycle(state);

      const wasteEffect = effects.find((e) => e.resource === 'waste' && e.source === 'nitrogen-cycle');
      const ammoniaEffect = effects.find((e) => e.resource === 'ammonia' && e.source === 'nitrogen-cycle');

      expect(wasteEffect).toBeDefined();
      expect(wasteEffect!.delta).toBeLessThan(0);
      expect(ammoniaEffect).toBeDefined();
      expect(ammoniaEffect!.delta).toBeGreaterThan(0);
    });

    it('limits waste conversion to MAX_WASTE_CONVERSION_PER_HOUR', () => {
      const state = createTestState({ waste: 10, water: 40 }); // Lots of waste
      const effects = updateNitrogenCycle(state);

      const wasteEffect = effects.find((e) => e.resource === 'waste' && e.source === 'nitrogen-cycle');
      expect(Math.abs(wasteEffect!.delta)).toBeLessThanOrEqual(MAX_WASTE_CONVERSION_PER_HOUR);
    });

    it('no conversion when waste is 0', () => {
      const state = createTestState({ waste: 0 });
      const effects = updateNitrogenCycle(state);

      const wasteEffect = effects.find((e) => e.resource === 'waste' && e.source === 'nitrogen-cycle');
      expect(wasteEffect).toBeUndefined();
    });
  });

  describe('Bacteria Spawning', () => {
    it('AOB spawns when ammonia reaches threshold', () => {
      const state = createTestState({ ammonia: SPAWN_THRESHOLD_AOB, aob: 0 });
      const effects = updateNitrogenCycle(state);

      const aobEffect = effects.find((e) => e.resource === 'aob' && e.delta > 0);
      expect(aobEffect).toBeDefined();
      expect(aobEffect!.delta).toBe(INITIAL_BACTERIA_SPAWN);
    });

    it('AOB does not spawn when ammonia below threshold', () => {
      const state = createTestState({ ammonia: SPAWN_THRESHOLD_AOB - 0.1, aob: 0 });
      const effects = updateNitrogenCycle(state);

      const aobSpawnEffect = effects.find(
        (e) => e.resource === 'aob' && e.delta === INITIAL_BACTERIA_SPAWN
      );
      expect(aobSpawnEffect).toBeUndefined();
    });

    it('AOB does not spawn again if already present', () => {
      const state = createTestState({ ammonia: SPAWN_THRESHOLD_AOB * 2, aob: 1 });
      const effects = updateNitrogenCycle(state);

      const spawnEffect = effects.find(
        (e) => e.resource === 'aob' && e.delta === INITIAL_BACTERIA_SPAWN
      );
      expect(spawnEffect).toBeUndefined();
    });

    it('NOB spawns when nitrite reaches threshold', () => {
      const state = createTestState({ nitrite: SPAWN_THRESHOLD_NOB, nob: 0 });
      const effects = updateNitrogenCycle(state);

      const nobEffect = effects.find((e) => e.resource === 'nob' && e.delta > 0);
      expect(nobEffect).toBeDefined();
      expect(nobEffect!.delta).toBe(INITIAL_BACTERIA_SPAWN);
    });

    it('NOB does not spawn when nitrite below threshold', () => {
      const state = createTestState({ nitrite: SPAWN_THRESHOLD_NOB - 0.1, nob: 0 });
      const effects = updateNitrogenCycle(state);

      const nobSpawnEffect = effects.find(
        (e) => e.resource === 'nob' && e.delta === INITIAL_BACTERIA_SPAWN
      );
      expect(nobSpawnEffect).toBeUndefined();
    });
  });

  describe('Stage 2: AOB converts Ammonia → Nitrite', () => {
    it('AOB converts ammonia to nitrite', () => {
      const state = createTestState({ ammonia: 1.0, aob: 1.0, surface: 10000 });
      const effects = updateNitrogenCycle(state);

      const ammoniaEffect = effects.find((e) => e.resource === 'ammonia' && e.source === 'aob');
      const nitriteEffect = effects.find((e) => e.resource === 'nitrite' && e.source === 'aob');

      expect(ammoniaEffect).toBeDefined();
      expect(ammoniaEffect!.delta).toBeLessThan(0);
      expect(nitriteEffect).toBeDefined();
      expect(nitriteEffect!.delta).toBeGreaterThan(0);
    });

    it('nitrite production follows stoichiometric ratio', () => {
      const state = createTestState({ ammonia: 10, aob: 1.0, surface: 10000 });
      const effects = updateNitrogenCycle(state);

      const ammoniaEffect = effects.find((e) => e.resource === 'ammonia' && e.source === 'aob');
      const nitriteEffect = effects.find((e) => e.resource === 'nitrite' && e.source === 'aob');

      const ammoniaConsumed = Math.abs(ammoniaEffect!.delta);
      const nitriteProduced = nitriteEffect!.delta;
      expect(nitriteProduced).toBeCloseTo(ammoniaConsumed * NH3_TO_NO2_RATIO, 6);
    });

    it('conversion scales with AOB population', () => {
      const state1 = createTestState({ ammonia: 10, aob: 1, surface: 10000 });
      const state2 = createTestState({ ammonia: 10, aob: 2, surface: 10000 });

      const effects1 = updateNitrogenCycle(state1);
      const effects2 = updateNitrogenCycle(state2);

      const ammonia1 = effects1.find((e) => e.resource === 'ammonia' && e.source === 'aob');
      const ammonia2 = effects2.find((e) => e.resource === 'ammonia' && e.source === 'aob');

      expect(Math.abs(ammonia2!.delta)).toBeCloseTo(Math.abs(ammonia1!.delta) * 2, 6);
    });

    it('cannot consume more ammonia than available', () => {
      const state = createTestState({ ammonia: 0.01, aob: 100, surface: 100000 });
      const effects = updateNitrogenCycle(state);

      const ammoniaEffect = effects.find((e) => e.resource === 'ammonia' && e.source === 'aob');
      expect(Math.abs(ammoniaEffect!.delta)).toBeLessThanOrEqual(0.01);
    });

    it('no conversion when AOB is 0', () => {
      const state = createTestState({ ammonia: 1.0, aob: 0 });
      const effects = updateNitrogenCycle(state);

      const ammoniaFromAOB = effects.find((e) => e.resource === 'ammonia' && e.source === 'aob');
      expect(ammoniaFromAOB).toBeUndefined();
    });

    it('no conversion when ammonia is 0', () => {
      const state = createTestState({ ammonia: 0, aob: 1.0 });
      const effects = updateNitrogenCycle(state);

      const ammoniaFromAOB = effects.find((e) => e.resource === 'ammonia' && e.source === 'aob');
      expect(ammoniaFromAOB).toBeUndefined();
    });
  });

  describe('Stage 3: NOB converts Nitrite → Nitrate', () => {
    it('NOB converts nitrite to nitrate', () => {
      const state = createTestState({ nitrite: 1.0, nob: 1.0, surface: 10000 });
      const effects = updateNitrogenCycle(state);

      const nitriteEffect = effects.find((e) => e.resource === 'nitrite' && e.source === 'nob');
      const nitrateEffect = effects.find((e) => e.resource === 'nitrate' && e.source === 'nob');

      expect(nitriteEffect).toBeDefined();
      expect(nitriteEffect!.delta).toBeLessThan(0);
      expect(nitrateEffect).toBeDefined();
      expect(nitrateEffect!.delta).toBeGreaterThan(0);
    });

    it('nitrate production follows stoichiometric ratio (1:1)', () => {
      const state = createTestState({ nitrite: 10, nob: 1.0, surface: 10000 });
      const effects = updateNitrogenCycle(state);

      const nitriteEffect = effects.find((e) => e.resource === 'nitrite' && e.source === 'nob');
      const nitrateEffect = effects.find((e) => e.resource === 'nitrate' && e.source === 'nob');

      const nitriteConsumed = Math.abs(nitriteEffect!.delta);
      const nitrateProduced = nitrateEffect!.delta;
      expect(nitrateProduced).toBeCloseTo(nitriteConsumed * NO2_TO_NO3_RATIO, 6);
    });

    it('conversion scales with NOB population', () => {
      const state1 = createTestState({ nitrite: 10, nob: 1, surface: 10000 });
      const state2 = createTestState({ nitrite: 10, nob: 2, surface: 10000 });

      const effects1 = updateNitrogenCycle(state1);
      const effects2 = updateNitrogenCycle(state2);

      const nitrite1 = effects1.find((e) => e.resource === 'nitrite' && e.source === 'nob');
      const nitrite2 = effects2.find((e) => e.resource === 'nitrite' && e.source === 'nob');

      expect(Math.abs(nitrite2!.delta)).toBeCloseTo(Math.abs(nitrite1!.delta) * 2, 6);
    });

    it('cannot consume more nitrite than available', () => {
      const state = createTestState({ nitrite: 0.01, nob: 100, surface: 100000 });
      const effects = updateNitrogenCycle(state);

      const nitriteEffect = effects.find((e) => e.resource === 'nitrite' && e.source === 'nob');
      expect(Math.abs(nitriteEffect!.delta)).toBeLessThanOrEqual(0.01);
    });

    it('no conversion when NOB is 0', () => {
      const state = createTestState({ nitrite: 1.0, nob: 0 });
      const effects = updateNitrogenCycle(state);

      const nitriteFromNOB = effects.find((e) => e.resource === 'nitrite' && e.source === 'nob');
      expect(nitriteFromNOB).toBeUndefined();
    });
  });

  describe('Bacterial Growth', () => {
    it('AOB grows when ammonia is above threshold', () => {
      // Need larger population for growth to round to at least 1
      const state = createTestState({
        ammonia: 1.0,
        aob: 100,
        surface: 10000,
      });
      const effects = updateNitrogenCycle(state);

      const growthEffect = effects.find(
        (e) => e.resource === 'aob' && e.source === 'nitrogen-cycle' && e.delta > 0
      );
      expect(growthEffect).toBeDefined();
    });

    it('NOB grows when nitrite is above threshold', () => {
      // Need larger population for growth to round to at least 1
      const state = createTestState({
        nitrite: 1.0,
        nob: 100,
        surface: 10000,
      });
      const effects = updateNitrogenCycle(state);

      const growthEffect = effects.find(
        (e) => e.resource === 'nob' && e.source === 'nitrogen-cycle' && e.delta > 0
      );
      expect(growthEffect).toBeDefined();
    });

    it('AOB does not grow when at max capacity', () => {
      const maxCapacity = calculateMaxBacteriaCapacity(1000);
      const state = createTestState({
        ammonia: 10,
        aob: maxCapacity,
        surface: 1000,
      });
      const effects = updateNitrogenCycle(state);

      const growthEffect = effects.find(
        (e) => e.resource === 'aob' && e.source === 'nitrogen-cycle' && e.delta > 0
      );
      expect(growthEffect).toBeUndefined();
    });
  });

  describe('Bacterial Death', () => {
    it('AOB dies when ammonia below threshold', () => {
      // Use larger population since MIN_BACTERIA_FLOOR prevents death below it
      const state = createTestState({
        ammonia: 0,
        aob: 100,
        surface: 10000,
      });
      const effects = updateNitrogenCycle(state);

      const deathEffect = effects.find(
        (e) => e.resource === 'aob' && e.source === 'nitrogen-cycle' && e.delta < 0
      );
      expect(deathEffect).toBeDefined();
    });

    it('NOB dies when nitrite below threshold', () => {
      // Use larger population since MIN_BACTERIA_FLOOR prevents death below it
      const state = createTestState({
        nitrite: 0,
        nob: 100,
        surface: 10000,
      });
      const effects = updateNitrogenCycle(state);

      const deathEffect = effects.find(
        (e) => e.resource === 'nob' && e.source === 'nitrogen-cycle' && e.delta < 0
      );
      expect(deathEffect).toBeDefined();
    });

    it('AOB does not die when ammonia is sufficient', () => {
      const state = createTestState({
        ammonia: MIN_FOOD_AOB * 2,
        aob: 100,
        surface: 10000,
      });
      const effects = updateNitrogenCycle(state);

      const deathEffect = effects.find(
        (e) => e.resource === 'aob' && e.source === 'nitrogen-cycle' && e.delta < 0
      );
      expect(deathEffect).toBeUndefined();
    });

    it('bacteria death is limited by MIN_BACTERIA_FLOOR', () => {
      // When bacteria is at or near floor, death should be 0 or very limited
      const state = createTestState({
        ammonia: 0,
        aob: MIN_BACTERIA_FLOOR,
        surface: 10000,
      });
      const effects = updateNitrogenCycle(state);

      // No death effect should be generated because aob is at MIN_BACTERIA_FLOOR
      const deathEffect = effects.find(
        (e) => e.resource === 'aob' && e.source === 'nitrogen-cycle' && e.delta < 0
      );
      expect(deathEffect).toBeUndefined();
    });
  });

  describe('Surface Area Capping', () => {
    it('caps AOB to max capacity when surface decreases', () => {
      const smallSurface = 100;
      const maxCapacity = calculateMaxBacteriaCapacity(smallSurface);
      const state = createTestState({
        aob: maxCapacity * 2, // Above capacity
        surface: smallSurface,
        ammonia: 10, // Plenty of food to avoid death effect interference
      });
      const effects = updateNitrogenCycle(state);

      const capEffect = effects.find(
        (e) => e.resource === 'aob' && e.delta < 0
      );
      expect(capEffect).toBeDefined();
    });

    it('caps NOB to max capacity when surface decreases', () => {
      const smallSurface = 100;
      const maxCapacity = calculateMaxBacteriaCapacity(smallSurface);
      const state = createTestState({
        nob: maxCapacity * 2, // Above capacity
        surface: smallSurface,
        nitrite: 10, // Plenty of food
      });
      const effects = updateNitrogenCycle(state);

      const capEffect = effects.find(
        (e) => e.resource === 'nob' && e.delta < 0
      );
      expect(capEffect).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('handles zero state (no waste, no bacteria, no chemicals)', () => {
      const state = createTestState({
        waste: 0,
        ammonia: 0,
        nitrite: 0,
        nitrate: 0,
        aob: 0,
        nob: 0,
      });
      const effects = updateNitrogenCycle(state);

      // Should return empty array or only non-nitrogen-cycle effects
      const ncEffects = effects.filter(
        (e) =>
          e.resource === 'waste' ||
          e.resource === 'ammonia' ||
          e.resource === 'nitrite' ||
          e.resource === 'nitrate' ||
          e.resource === 'aob' ||
          e.resource === 'nob'
      );
      expect(ncEffects.length).toBe(0);
    });

    it('all effects have tier: passive', () => {
      const state = createTestState({
        waste: 1,
        ammonia: 1,
        nitrite: 1,
        aob: 1,
        nob: 1,
        surface: 10000,
      });
      const effects = updateNitrogenCycle(state);

      effects.forEach((effect) => {
        expect(effect.tier).toBe('passive');
      });
    });
  });
});

describe('Constants', () => {
  it('BACTERIA_GROWTH_RATE matches doubling time', () => {
    // ln(2) / 24 ≈ 0.0289
    const expected = Math.log(2) / BACTERIA_DOUBLING_TIME;
    expect(BACTERIA_GROWTH_RATE).toBeCloseTo(expected, 6);
  });

  it('BACTERIA_DEATH_RATE matches starvation time', () => {
    // 1 / (5 * 24) ≈ 0.0083
    const expected = 1 / (BACTERIA_STARVATION_DAYS * 24);
    expect(BACTERIA_DEATH_RATE).toBeCloseTo(expected, 6);
  });

  it('spawn thresholds are set correctly', () => {
    expect(SPAWN_THRESHOLD_AOB).toBe(0.05);
    expect(SPAWN_THRESHOLD_NOB).toBe(0.5);
  });

  it('minimum food thresholds are set correctly', () => {
    expect(MIN_FOOD_AOB).toBe(0.01);
    expect(MIN_FOOD_NOB).toBe(0.01);
  });

  it('stoichiometric ratio NH3 → NO2 is 2.7', () => {
    expect(NH3_TO_NO2_RATIO).toBe(2.7);
  });

  it('stoichiometric ratio NO2 → NO3 is 1.0', () => {
    expect(NO2_TO_NO3_RATIO).toBe(1.0);
  });
});

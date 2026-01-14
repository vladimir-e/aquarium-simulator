import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import {
  nitrogenCycleSystem,
  calculateMaxBacteria,
  calculateBacterialGrowth,
  calculateWasteToAmmonia,
  calculateAmmoniaToNitrite,
  calculateNitriteToNitrate,
  WASTE_CONVERSION_RATE,
  BACTERIA_PROCESSING_RATE,
  AOB_SPAWN_THRESHOLD,
  NOB_SPAWN_THRESHOLD,
  SPAWN_AMOUNT,
  AOB_GROWTH_RATE,
  BACTERIA_PER_CM2,
  BACTERIA_DEATH_RATE,
  AOB_FOOD_THRESHOLD,
} from './nitrogen-cycle.js';
import { createSimulation, type SimulationState } from '../state.js';
import { applyEffects } from '../core/effects.js';
import { decaySystem } from './decay.js';

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('calculateMaxBacteria', () => {
  it('returns 0 for zero surface', () => {
    expect(calculateMaxBacteria(0)).toBe(0);
  });

  it('scales linearly with surface area', () => {
    expect(calculateMaxBacteria(1000)).toBe(1000 * BACTERIA_PER_CM2);
    expect(calculateMaxBacteria(5000)).toBe(5000 * BACTERIA_PER_CM2);
  });

  it('uses BACTERIA_PER_CM2 constant correctly', () => {
    const surface = 10000;
    expect(calculateMaxBacteria(surface)).toBe(surface * 0.1);
  });
});

describe('calculateBacterialGrowth', () => {
  it('returns 0 for zero population', () => {
    expect(calculateBacterialGrowth(0, AOB_GROWTH_RATE, 1000)).toBe(0);
  });

  it('returns 0 for zero max population', () => {
    expect(calculateBacterialGrowth(100, AOB_GROWTH_RATE, 0)).toBe(0);
  });

  it('follows logistic growth formula', () => {
    const population = 100;
    const maxPopulation = 1000;
    const expectedGrowth = population * AOB_GROWTH_RATE * (1 - population / maxPopulation);
    expect(calculateBacterialGrowth(population, AOB_GROWTH_RATE, maxPopulation)).toBeCloseTo(
      expectedGrowth,
      10
    );
  });

  it('slows down as population approaches max', () => {
    const maxPopulation = 1000;
    const growthAt10Percent = calculateBacterialGrowth(100, AOB_GROWTH_RATE, maxPopulation);
    const growthAt50Percent = calculateBacterialGrowth(500, AOB_GROWTH_RATE, maxPopulation);
    const growthAt90Percent = calculateBacterialGrowth(900, AOB_GROWTH_RATE, maxPopulation);

    // Relative growth rate should decrease
    expect(growthAt50Percent / 500).toBeLessThan(growthAt10Percent / 100);
    expect(growthAt90Percent / 900).toBeLessThan(growthAt50Percent / 500);
  });

  it('returns near-zero growth at carrying capacity', () => {
    const growth = calculateBacterialGrowth(999, AOB_GROWTH_RATE, 1000);
    expect(growth).toBeCloseTo(0.03 * 999 * 0.001, 6);
  });
});

describe('calculateWasteToAmmonia', () => {
  it('returns zero for no waste', () => {
    const result = calculateWasteToAmmonia(0, 100);
    expect(result.wasteConsumed).toBe(0);
    expect(result.ammoniaProduced).toBe(0);
  });

  it('returns zero for zero water volume', () => {
    const result = calculateWasteToAmmonia(10, 0);
    expect(result.wasteConsumed).toBe(0);
    expect(result.ammoniaProduced).toBe(0);
  });

  it('converts 30% of waste per tick', () => {
    const result = calculateWasteToAmmonia(10, 100);
    expect(result.wasteConsumed).toBeCloseTo(10 * WASTE_CONVERSION_RATE, 10);
  });

  it('produces higher ammonia concentration in smaller tanks', () => {
    const smallTank = calculateWasteToAmmonia(10, 20);
    const largeTank = calculateWasteToAmmonia(10, 100);
    expect(smallTank.ammoniaProduced).toBeGreaterThan(largeTank.ammoniaProduced);
    expect(smallTank.ammoniaProduced).toBeCloseTo(largeTank.ammoniaProduced * 5, 10);
  });

  it('ammonia produced equals waste consumed / water volume', () => {
    const result = calculateWasteToAmmonia(10, 40);
    expect(result.ammoniaProduced).toBeCloseTo(result.wasteConsumed / 40, 10);
  });
});

describe('calculateAmmoniaToNitrite', () => {
  it('returns 0 for no ammonia', () => {
    expect(calculateAmmoniaToNitrite(0, 100)).toBe(0);
  });

  it('returns 0 for no bacteria', () => {
    expect(calculateAmmoniaToNitrite(1.0, 0)).toBe(0);
  });

  it('processes based on bacteria population', () => {
    const bacteria = 100;
    const ammonia = 10; // More ammonia than can be processed
    const processed = calculateAmmoniaToNitrite(ammonia, bacteria);
    expect(processed).toBeCloseTo(bacteria * BACTERIA_PROCESSING_RATE, 10);
  });

  it('cannot process more ammonia than available', () => {
    const bacteria = 1000;
    const ammonia = 0.001; // Very little ammonia
    const processed = calculateAmmoniaToNitrite(ammonia, bacteria);
    expect(processed).toBe(ammonia);
  });
});

describe('calculateNitriteToNitrate', () => {
  it('returns 0 for no nitrite', () => {
    expect(calculateNitriteToNitrate(0, 100)).toBe(0);
  });

  it('returns 0 for no bacteria', () => {
    expect(calculateNitriteToNitrate(1.0, 0)).toBe(0);
  });

  it('processes based on bacteria population', () => {
    const bacteria = 100;
    const nitrite = 10; // More nitrite than can be processed
    const processed = calculateNitriteToNitrate(nitrite, bacteria);
    expect(processed).toBeCloseTo(bacteria * BACTERIA_PROCESSING_RATE, 10);
  });

  it('cannot process more nitrite than available', () => {
    const bacteria = 1000;
    const nitrite = 0.001; // Very little nitrite
    const processed = calculateNitriteToNitrate(nitrite, bacteria);
    expect(processed).toBe(nitrite);
  });
});

// ============================================================================
// System Tests
// ============================================================================

describe('nitrogenCycleSystem', () => {
  function createTestState(
    overrides: Partial<{
      waste: number;
      ammonia: number;
      nitrite: number;
      nitrate: number;
      aob: number;
      nob: number;
      surface: number;
      water: number;
    }> = {}
  ): SimulationState {
    const state = createSimulation({ tankCapacity: 40 });
    return produce(state, (draft) => {
      if (overrides.waste !== undefined) draft.resources.waste = overrides.waste;
      if (overrides.ammonia !== undefined) draft.resources.ammonia = overrides.ammonia;
      if (overrides.nitrite !== undefined) draft.resources.nitrite = overrides.nitrite;
      if (overrides.nitrate !== undefined) draft.resources.nitrate = overrides.nitrate;
      if (overrides.aob !== undefined) draft.resources.aob = overrides.aob;
      if (overrides.nob !== undefined) draft.resources.nob = overrides.nob;
      if (overrides.surface !== undefined) draft.resources.surface = overrides.surface;
      if (overrides.water !== undefined) draft.resources.water = overrides.water;
    });
  }

  it('has correct id and tier', () => {
    expect(nitrogenCycleSystem.id).toBe('nitrogen-cycle');
    expect(nitrogenCycleSystem.tier).toBe('passive');
  });

  describe('Waste to Ammonia', () => {
    it('converts waste to ammonia', () => {
      const state = createTestState({ waste: 10, water: 40 });
      const effects = nitrogenCycleSystem.update(state);

      const wasteEffect = effects.find(
        (e) => e.resource === 'waste' && e.source === 'nitrogen-cycle-mineralization'
      );
      const ammoniaEffect = effects.find(
        (e) => e.resource === 'ammonia' && e.source === 'nitrogen-cycle-mineralization'
      );

      expect(wasteEffect).toBeDefined();
      expect(wasteEffect!.delta).toBeLessThan(0);
      expect(ammoniaEffect).toBeDefined();
      expect(ammoniaEffect!.delta).toBeGreaterThan(0);
    });

    it('produces no ammonia when waste is 0', () => {
      const state = createTestState({ waste: 0 });
      const effects = nitrogenCycleSystem.update(state);

      const ammoniaEffect = effects.find(
        (e) => e.resource === 'ammonia' && e.source === 'nitrogen-cycle-mineralization'
      );
      expect(ammoniaEffect).toBeUndefined();
    });
  });

  describe('AOB Processing', () => {
    it('processes ammonia when AOB present', () => {
      const state = createTestState({ ammonia: 1.0, aob: 100 });
      const effects = nitrogenCycleSystem.update(state);

      const ammoniaEffect = effects.find(
        (e) => e.resource === 'ammonia' && e.source === 'nitrogen-cycle-aob'
      );
      const nitriteEffect = effects.find(
        (e) => e.resource === 'nitrite' && e.source === 'nitrogen-cycle-aob'
      );

      expect(ammoniaEffect).toBeDefined();
      expect(ammoniaEffect!.delta).toBeLessThan(0);
      expect(nitriteEffect).toBeDefined();
      expect(nitriteEffect!.delta).toBeGreaterThan(0);
      expect(nitriteEffect!.delta).toBe(-ammoniaEffect!.delta); // 1:1 conversion
    });

    it('does not process ammonia when AOB is 0', () => {
      const state = createTestState({ ammonia: 1.0, aob: 0 });
      const effects = nitrogenCycleSystem.update(state);

      const ammoniaEffect = effects.find(
        (e) => e.resource === 'ammonia' && e.source === 'nitrogen-cycle-aob'
      );
      expect(ammoniaEffect).toBeUndefined();
    });
  });

  describe('NOB Processing', () => {
    it('processes nitrite when NOB present', () => {
      const state = createTestState({ nitrite: 1.0, nob: 100 });
      const effects = nitrogenCycleSystem.update(state);

      const nitriteEffect = effects.find(
        (e) => e.resource === 'nitrite' && e.source === 'nitrogen-cycle-nob'
      );
      const nitrateEffect = effects.find(
        (e) => e.resource === 'nitrate' && e.source === 'nitrogen-cycle-nob'
      );

      expect(nitriteEffect).toBeDefined();
      expect(nitriteEffect!.delta).toBeLessThan(0);
      expect(nitrateEffect).toBeDefined();
      expect(nitrateEffect!.delta).toBeGreaterThan(0);
      expect(nitrateEffect!.delta).toBe(-nitriteEffect!.delta); // 1:1 conversion
    });

    it('does not process nitrite when NOB is 0', () => {
      const state = createTestState({ nitrite: 1.0, nob: 0 });
      const effects = nitrogenCycleSystem.update(state);

      const nitriteEffect = effects.find(
        (e) => e.resource === 'nitrite' && e.source === 'nitrogen-cycle-nob'
      );
      expect(nitriteEffect).toBeUndefined();
    });
  });

  describe('Bacteria Spawning', () => {
    it('spawns AOB when ammonia reaches threshold', () => {
      const state = createTestState({ ammonia: AOB_SPAWN_THRESHOLD, aob: 0 });
      const effects = nitrogenCycleSystem.update(state);

      const aobEffect = effects.find(
        (e) => e.resource === 'aob' && e.source === 'nitrogen-cycle-spawn'
      );
      expect(aobEffect).toBeDefined();
      expect(aobEffect!.delta).toBe(SPAWN_AMOUNT);
    });

    it('does not spawn AOB when already present', () => {
      const state = createTestState({ ammonia: AOB_SPAWN_THRESHOLD, aob: 1 });
      const effects = nitrogenCycleSystem.update(state);

      const aobSpawnEffect = effects.find(
        (e) => e.resource === 'aob' && e.source === 'nitrogen-cycle-spawn'
      );
      expect(aobSpawnEffect).toBeUndefined();
    });

    it('does not spawn AOB when ammonia below threshold', () => {
      const state = createTestState({ ammonia: AOB_SPAWN_THRESHOLD - 0.1, aob: 0 });
      const effects = nitrogenCycleSystem.update(state);

      const aobEffect = effects.find(
        (e) => e.resource === 'aob' && e.source === 'nitrogen-cycle-spawn'
      );
      expect(aobEffect).toBeUndefined();
    });

    it('spawns NOB when nitrite reaches threshold', () => {
      const state = createTestState({ nitrite: NOB_SPAWN_THRESHOLD, nob: 0 });
      const effects = nitrogenCycleSystem.update(state);

      const nobEffect = effects.find(
        (e) => e.resource === 'nob' && e.source === 'nitrogen-cycle-spawn'
      );
      expect(nobEffect).toBeDefined();
      expect(nobEffect!.delta).toBe(SPAWN_AMOUNT);
    });
  });

  describe('Bacteria Growth', () => {
    it('AOB grows when ammonia available', () => {
      const state = createTestState({
        ammonia: 0.5,
        aob: 100,
        surface: 10000, // Large surface so no cap
      });
      const effects = nitrogenCycleSystem.update(state);

      const growthEffect = effects.find(
        (e) => e.resource === 'aob' && e.source === 'nitrogen-cycle-growth'
      );
      expect(growthEffect).toBeDefined();
      expect(growthEffect!.delta).toBeGreaterThan(0);
    });

    it('AOB does not grow when ammonia scarce', () => {
      const state = createTestState({
        ammonia: AOB_FOOD_THRESHOLD - 0.001,
        aob: 100,
      });
      const effects = nitrogenCycleSystem.update(state);

      const growthEffect = effects.find(
        (e) => e.resource === 'aob' && e.source === 'nitrogen-cycle-growth'
      );
      expect(growthEffect).toBeUndefined();
    });

    it('NOB grows when nitrite available', () => {
      const state = createTestState({
        nitrite: 0.5,
        nob: 100,
        surface: 10000,
      });
      const effects = nitrogenCycleSystem.update(state);

      const growthEffect = effects.find(
        (e) => e.resource === 'nob' && e.source === 'nitrogen-cycle-growth'
      );
      expect(growthEffect).toBeDefined();
      expect(growthEffect!.delta).toBeGreaterThan(0);
    });
  });

  describe('Bacteria Death', () => {
    it('AOB dies when ammonia scarce', () => {
      const state = createTestState({
        ammonia: 0, // No food
        aob: 100,
      });
      const effects = nitrogenCycleSystem.update(state);

      const deathEffect = effects.find(
        (e) => e.resource === 'aob' && e.source === 'nitrogen-cycle-death'
      );
      expect(deathEffect).toBeDefined();
      expect(deathEffect!.delta).toBeLessThan(0);
      expect(deathEffect!.delta).toBeCloseTo(-100 * BACTERIA_DEATH_RATE, 10);
    });

    it('AOB does not die when ammonia available', () => {
      const state = createTestState({
        ammonia: 0.5,
        aob: 100,
      });
      const effects = nitrogenCycleSystem.update(state);

      const deathEffect = effects.find(
        (e) => e.resource === 'aob' && e.source === 'nitrogen-cycle-death'
      );
      expect(deathEffect).toBeUndefined();
    });

    it('NOB dies when nitrite scarce', () => {
      const state = createTestState({
        nitrite: 0,
        nob: 100,
      });
      const effects = nitrogenCycleSystem.update(state);

      const deathEffect = effects.find(
        (e) => e.resource === 'nob' && e.source === 'nitrogen-cycle-death'
      );
      expect(deathEffect).toBeDefined();
      expect(deathEffect!.delta).toBeLessThan(0);
    });
  });

  describe('Surface Cap', () => {
    it('caps AOB when surface decreases', () => {
      const state = createTestState({
        aob: 500,
        surface: 1000, // Max = 100 bacteria
      });
      const effects = nitrogenCycleSystem.update(state);

      const capEffect = effects.find(
        (e) => e.resource === 'aob' && e.source === 'nitrogen-cycle-surface-cap'
      );
      expect(capEffect).toBeDefined();
      expect(capEffect!.delta).toBe(100 - 500); // Reduce to max
    });

    it('caps NOB when surface decreases', () => {
      const state = createTestState({
        nob: 500,
        surface: 1000, // Max = 100 bacteria
      });
      const effects = nitrogenCycleSystem.update(state);

      const capEffect = effects.find(
        (e) => e.resource === 'nob' && e.source === 'nitrogen-cycle-surface-cap'
      );
      expect(capEffect).toBeDefined();
      expect(capEffect!.delta).toBe(100 - 500);
    });

    it('does not cap when under limit', () => {
      const state = createTestState({
        aob: 50,
        nob: 50,
        surface: 1000, // Max = 100 bacteria
      });
      const effects = nitrogenCycleSystem.update(state);

      const aobCapEffect = effects.find(
        (e) => e.resource === 'aob' && e.source === 'nitrogen-cycle-surface-cap'
      );
      const nobCapEffect = effects.find(
        (e) => e.resource === 'nob' && e.source === 'nitrogen-cycle-surface-cap'
      );
      expect(aobCapEffect).toBeUndefined();
      expect(nobCapEffect).toBeUndefined();
    });
  });
});

// ============================================================================
// Integration Test: 25-Day Cycling Scenario
// ============================================================================

describe('25-Day Tank Cycling Integration Test', () => {
  it('simulates a realistic tank cycling over 600 ticks (25 days)', () => {
    // Setup: 40L tank, 25°C, fishless cycle
    // Using higher ammonia source to trigger cycling within test period
    let state = createSimulation({
      tankCapacity: 40,
      initialTemperature: 25,
    });

    // Add direct ammonia to trigger bacterial spawning (simulates fishless cycle with ammonia dosing)
    // This simulates adding ammonia source directly as aquarists do for fishless cycling
    state = produce(state, (draft) => {
      draft.resources.ammonia = 2.0; // 2 ppm - common fishless cycle starting point
    });

    // Track key values during simulation
    const history: {
      tick: number;
      ammonia: number;
      nitrite: number;
      nitrate: number;
      aob: number;
      nob: number;
    }[] = [];

    let peakAmmonia = 0;
    let peakAmmoniaTick = -1;
    let peakNitrite = 0;
    let peakNitriteTick = -1;

    // Run for 600 ticks (25 days)
    for (let tick = 0; tick < 600; tick++) {
      // Apply nitrogen cycle system
      const nitrogenEffects = nitrogenCycleSystem.update(state);
      state = applyEffects(state, nitrogenEffects);

      // Track peaks
      if (state.resources.ammonia > peakAmmonia) {
        peakAmmonia = state.resources.ammonia;
        peakAmmoniaTick = tick;
      }
      if (state.resources.nitrite > peakNitrite) {
        peakNitrite = state.resources.nitrite;
        peakNitriteTick = tick;
      }

      // Record history every 24 ticks (once per day)
      if (tick % 24 === 0) {
        history.push({
          tick,
          ammonia: state.resources.ammonia,
          nitrite: state.resources.nitrite,
          nitrate: state.resources.nitrate,
          aob: state.resources.aob,
          nob: state.resources.nob,
        });
      }

      // Update tick counter
      state = produce(state, (draft) => {
        draft.tick = tick + 1;
      });
    }

    // Final record
    history.push({
      tick: 600,
      ammonia: state.resources.ammonia,
      nitrite: state.resources.nitrite,
      nitrate: state.resources.nitrate,
      aob: state.resources.aob,
      nob: state.resources.nob,
    });

    // Assertions
    // 1. Ammonia peaks early (bacteria spawn when ammonia >= 0.5 and start consuming it)
    expect(peakAmmoniaTick).toBeGreaterThanOrEqual(0);
    expect(peakAmmoniaTick).toBeLessThan(peakNitriteTick);

    // 2. Both ammonia and nitrite eventually drop below threshold
    expect(state.resources.ammonia).toBeLessThan(0.5);
    expect(state.resources.nitrite).toBeLessThan(0.5);

    // 3. Nitrate accumulates (the end product)
    expect(state.resources.nitrate).toBeGreaterThan(0);

    // 4. AOB and NOB populations > 0 at end (bacteria are established)
    expect(state.resources.aob).toBeGreaterThan(0);
    expect(state.resources.nob).toBeGreaterThan(0);

    // 5. No chemical exceeds bounds
    history.forEach((h) => {
      expect(h.ammonia).toBeGreaterThanOrEqual(0);
      expect(h.ammonia).toBeLessThanOrEqual(10);
      expect(h.nitrite).toBeGreaterThanOrEqual(0);
      expect(h.nitrite).toBeLessThanOrEqual(10);
      expect(h.nitrate).toBeGreaterThanOrEqual(0);
      expect(h.nitrate).toBeLessThanOrEqual(200);
    });
  });

  it('waste-to-ammonia conversion works with food decay', () => {
    // Test the full cycle from food -> waste -> ammonia -> nitrite -> nitrate
    let state = createSimulation({
      tankCapacity: 40,
      initialTemperature: 25,
    });

    // Add food
    state = produce(state, (draft) => {
      draft.resources.food = 5.0; // 5g food
    });

    // Run for 100 ticks to let food decay through the full nitrogen cycle
    for (let tick = 0; tick < 100; tick++) {
      const decayEffects = decaySystem.update(state);
      state = applyEffects(state, decayEffects);

      const nitrogenEffects = nitrogenCycleSystem.update(state);
      state = applyEffects(state, nitrogenEffects);

      state = produce(state, (draft) => {
        draft.tick = tick + 1;
      });
    }

    // Food should have largely decayed
    expect(state.resources.food).toBeLessThan(1);

    // Nitrate should have accumulated (proves ammonia was produced and processed)
    // With bacteria spawning at 0.02 ppm, ammonia gets processed to nitrite to nitrate
    expect(state.resources.nitrate).toBeGreaterThan(0);
  });
});

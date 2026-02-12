import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import {
  nitrogenCycleSystem,
  calculateMaxBacteria,
  calculateBacterialGrowth,
  calculateWasteToAmmonia,
  calculateAmmoniaToNitrite,
  calculateNitriteToNitrate,
} from './nitrogen-cycle.js';
import { createSimulation, type SimulationState } from '../state.js';
import { applyEffects } from '../core/effects.js';
import { decaySystem } from './decay.js';
import { getPpm, getMassFromPpm } from '../resources/index.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { nitrogenCycleDefaults } from '../config/nitrogen-cycle.js';

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('calculateMaxBacteria', () => {
  it('returns 0 for zero surface', () => {
    expect(calculateMaxBacteria(0)).toBe(0);
  });

  it('scales linearly with surface area', () => {
    expect(calculateMaxBacteria(1000)).toBe(1000 * nitrogenCycleDefaults.bacteriaPerCm2);
    expect(calculateMaxBacteria(5000)).toBe(5000 * nitrogenCycleDefaults.bacteriaPerCm2);
  });

  it('uses bacteriaPerCm2 constant correctly', () => {
    const surface = 10000;
    expect(calculateMaxBacteria(surface)).toBe(surface * nitrogenCycleDefaults.bacteriaPerCm2);
  });
});

describe('calculateBacterialGrowth', () => {
  it('returns 0 for zero population', () => {
    expect(calculateBacterialGrowth(0, nitrogenCycleDefaults.aobGrowthRate, 1000)).toBe(0);
  });

  it('returns 0 for zero max population', () => {
    expect(calculateBacterialGrowth(100, nitrogenCycleDefaults.aobGrowthRate, 0)).toBe(0);
  });

  it('follows logistic growth formula', () => {
    const population = 100;
    const maxPopulation = 1000;
    const expectedGrowth = population * nitrogenCycleDefaults.aobGrowthRate * (1 - population / maxPopulation);
    expect(calculateBacterialGrowth(population, nitrogenCycleDefaults.aobGrowthRate, maxPopulation)).toBeCloseTo(
      expectedGrowth,
      10
    );
  });

  it('slows down as population approaches max', () => {
    const maxPopulation = 1000;
    const growthAt10Percent = calculateBacterialGrowth(100, nitrogenCycleDefaults.aobGrowthRate, maxPopulation);
    const growthAt50Percent = calculateBacterialGrowth(500, nitrogenCycleDefaults.aobGrowthRate, maxPopulation);
    const growthAt90Percent = calculateBacterialGrowth(900, nitrogenCycleDefaults.aobGrowthRate, maxPopulation);

    // Relative growth rate should decrease
    expect(growthAt50Percent / 500).toBeLessThan(growthAt10Percent / 100);
    expect(growthAt90Percent / 900).toBeLessThan(growthAt50Percent / 500);
  });

  it('returns near-zero growth at carrying capacity', () => {
    const growth = calculateBacterialGrowth(999, nitrogenCycleDefaults.aobGrowthRate, 1000);
    expect(growth).toBeCloseTo(nitrogenCycleDefaults.aobGrowthRate * 999 * 0.001, 6);
  });
});

describe('calculateWasteToAmmonia', () => {
  it('returns zero for no waste', () => {
    const result = calculateWasteToAmmonia(0);
    expect(result.wasteConsumed).toBe(0);
    expect(result.ammoniaProduced).toBe(0);
  });

  it('converts 30% of waste per tick', () => {
    const result = calculateWasteToAmmonia(10);
    expect(result.wasteConsumed).toBeCloseTo(10 * nitrogenCycleDefaults.wasteConversionRate, 10);
  });

  it('produces ammonia mass proportional to waste consumed', () => {
    const result = calculateWasteToAmmonia(10);
    expect(result.ammoniaProduced).toBeCloseTo(
      result.wasteConsumed * nitrogenCycleDefaults.wasteToAmmoniaRatio,
      10
    );
  });

  it('produces same ammonia mass regardless of tank size (mass-based)', () => {
    // Unlike ppm-based, mass output is independent of water volume
    const result = calculateWasteToAmmonia(10);
    expect(result.ammoniaProduced).toBeCloseTo(10 * nitrogenCycleDefaults.wasteConversionRate * nitrogenCycleDefaults.wasteToAmmoniaRatio, 10);
  });
});

describe('calculateAmmoniaToNitrite', () => {
  it('returns 0 for no ammonia', () => {
    expect(calculateAmmoniaToNitrite(0, 100, 40)).toBe(0);
  });

  it('returns 0 for no bacteria', () => {
    expect(calculateAmmoniaToNitrite(1.0, 0, 40)).toBe(0);
  });

  it('returns 0 for no water', () => {
    expect(calculateAmmoniaToNitrite(1.0, 100, 0)).toBe(0);
  });

  it('processes based on bacteria population and water volume', () => {
    const bacteria = 100;
    const waterVolume = 40;
    const ammoniaMass = 100; // More mass than can be processed
    const processed = calculateAmmoniaToNitrite(ammoniaMass, bacteria, waterVolume);
    // Processing capacity = bacteria * rate * water
    expect(processed).toBeCloseTo(bacteria * nitrogenCycleDefaults.bacteriaProcessingRate * waterVolume, 10);
  });

  it('cannot process more ammonia than available', () => {
    const bacteria = 1000;
    const waterVolume = 40;
    const ammoniaMass = 0.001; // Very little ammonia mass
    const processed = calculateAmmoniaToNitrite(ammoniaMass, bacteria, waterVolume);
    expect(processed).toBe(ammoniaMass);
  });

  it('processes more mass in larger tanks (same ppm reduction)', () => {
    const bacteria = 100;
    const smallTankWater = 20;
    const largeTankWater = 100;
    const ammoniaMass = 100; // Plenty of mass

    const processedSmall = calculateAmmoniaToNitrite(ammoniaMass, bacteria, smallTankWater);
    const processedLarge = calculateAmmoniaToNitrite(ammoniaMass, bacteria, largeTankWater);

    // More water = more mass processed (but same ppm rate)
    expect(processedLarge).toBeCloseTo(processedSmall * 5, 10);
  });
});

describe('calculateNitriteToNitrate', () => {
  it('returns 0 for no nitrite', () => {
    expect(calculateNitriteToNitrate(0, 100, 40)).toBe(0);
  });

  it('returns 0 for no bacteria', () => {
    expect(calculateNitriteToNitrate(1.0, 0, 40)).toBe(0);
  });

  it('returns 0 for no water', () => {
    expect(calculateNitriteToNitrate(1.0, 100, 0)).toBe(0);
  });

  it('processes based on bacteria population and water volume', () => {
    const bacteria = 100;
    const waterVolume = 40;
    const nitriteMass = 100; // More mass than can be processed
    const processed = calculateNitriteToNitrate(nitriteMass, bacteria, waterVolume);
    expect(processed).toBeCloseTo(bacteria * nitrogenCycleDefaults.bacteriaProcessingRate * waterVolume, 10);
  });

  it('cannot process more nitrite than available', () => {
    const bacteria = 1000;
    const waterVolume = 40;
    const nitriteMass = 0.001; // Very little nitrite mass
    const processed = calculateNitriteToNitrate(nitriteMass, bacteria, waterVolume);
    expect(processed).toBe(nitriteMass);
  });
});

// ============================================================================
// PPM Helper Tests
// ============================================================================

describe('getPpm', () => {
  it('returns 0 for zero water', () => {
    expect(getPpm(10, 0)).toBe(0);
  });

  it('returns 0 for negative water', () => {
    expect(getPpm(10, -5)).toBe(0);
  });

  it('calculates ppm correctly', () => {
    // 40mg in 40L = 1 ppm
    expect(getPpm(40, 40)).toBe(1);
    // 80mg in 40L = 2 ppm
    expect(getPpm(80, 40)).toBe(2);
    // 10mg in 100L = 0.1 ppm
    expect(getPpm(10, 100)).toBe(0.1);
  });
});

describe('getMassFromPpm', () => {
  it('returns 0 for zero water', () => {
    expect(getMassFromPpm(1, 0)).toBe(0);
  });

  it('returns 0 for negative water', () => {
    expect(getMassFromPpm(1, -5)).toBe(0);
  });

  it('calculates mass correctly', () => {
    // 1 ppm in 40L = 40mg
    expect(getMassFromPpm(1, 40)).toBe(40);
    // 2 ppm in 40L = 80mg
    expect(getMassFromPpm(2, 40)).toBe(80);
    // 0.1 ppm in 100L = 10mg
    expect(getMassFromPpm(0.1, 100)).toBe(10);
  });

  it('round-trips with getPpm', () => {
    const mass = 50;
    const water = 40;
    const ppm = getPpm(mass, water);
    expect(getMassFromPpm(ppm, water)).toBeCloseTo(mass, 10);
  });
});

// ============================================================================
// System Tests
// ============================================================================

describe('nitrogenCycleSystem', () => {
  function createTestState(
    overrides: Partial<{
      waste: number;
      ammonia: number; // Mass in mg
      nitrite: number; // Mass in mg
      nitrate: number; // Mass in mg
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

  // Helper to convert ppm to mass for test setup
  function ppmToMass(ppm: number, water: number = 40): number {
    return getMassFromPpm(ppm, water);
  }

  it('has correct id and tier', () => {
    expect(nitrogenCycleSystem.id).toBe('nitrogen-cycle');
    expect(nitrogenCycleSystem.tier).toBe('passive');
  });

  describe('Waste to Ammonia', () => {
    it('converts waste to ammonia mass', () => {
      const state = createTestState({ waste: 10, water: 40 });
      const effects = nitrogenCycleSystem.update(state, DEFAULT_CONFIG);

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
      // Ammonia produced = waste consumed * ratio
      expect(ammoniaEffect!.delta).toBeCloseTo(-wasteEffect!.delta * nitrogenCycleDefaults.wasteToAmmoniaRatio, 10);
    });

    it('produces no ammonia when waste is 0', () => {
      const state = createTestState({ waste: 0 });
      const effects = nitrogenCycleSystem.update(state, DEFAULT_CONFIG);

      const ammoniaEffect = effects.find(
        (e) => e.resource === 'ammonia' && e.source === 'nitrogen-cycle-mineralization'
      );
      expect(ammoniaEffect).toBeUndefined();
    });
  });

  describe('AOB Processing', () => {
    it('processes ammonia mass when AOB present', () => {
      // Set ammonia mass (not ppm)
      const state = createTestState({ ammonia: ppmToMass(1.0), aob: 100 });
      const effects = nitrogenCycleSystem.update(state, DEFAULT_CONFIG);

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
      expect(nitriteEffect!.delta).toBe(-ammoniaEffect!.delta); // 1:1 mass conversion
    });

    it('does not process ammonia when AOB is 0', () => {
      const state = createTestState({ ammonia: ppmToMass(1.0), aob: 0 });
      const effects = nitrogenCycleSystem.update(state, DEFAULT_CONFIG);

      const ammoniaEffect = effects.find(
        (e) => e.resource === 'ammonia' && e.source === 'nitrogen-cycle-aob'
      );
      expect(ammoniaEffect).toBeUndefined();
    });
  });

  describe('NOB Processing', () => {
    it('processes nitrite mass when NOB present', () => {
      const state = createTestState({ nitrite: ppmToMass(1.0), nob: 100 });
      const effects = nitrogenCycleSystem.update(state, DEFAULT_CONFIG);

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
      expect(nitrateEffect!.delta).toBe(-nitriteEffect!.delta); // 1:1 mass conversion
    });

    it('does not process nitrite when NOB is 0', () => {
      const state = createTestState({ nitrite: ppmToMass(1.0), nob: 0 });
      const effects = nitrogenCycleSystem.update(state, DEFAULT_CONFIG);

      const nitriteEffect = effects.find(
        (e) => e.resource === 'nitrite' && e.source === 'nitrogen-cycle-nob'
      );
      expect(nitriteEffect).toBeUndefined();
    });
  });

  describe('Bacteria Spawning (ppm thresholds)', () => {
    it('spawns AOB when ammonia ppm reaches threshold', () => {
      // Use mass that produces spawn threshold ppm
      const state = createTestState({ ammonia: ppmToMass(nitrogenCycleDefaults.aobSpawnThreshold), aob: 0 });
      const effects = nitrogenCycleSystem.update(state, DEFAULT_CONFIG);

      const aobEffect = effects.find(
        (e) => e.resource === 'aob' && e.source === 'nitrogen-cycle-spawn'
      );
      expect(aobEffect).toBeDefined();
      expect(aobEffect!.delta).toBe(nitrogenCycleDefaults.spawnAmount);
    });

    it('does not spawn AOB when already present', () => {
      const state = createTestState({ ammonia: ppmToMass(nitrogenCycleDefaults.aobSpawnThreshold), aob: 1 });
      const effects = nitrogenCycleSystem.update(state, DEFAULT_CONFIG);

      const aobSpawnEffect = effects.find(
        (e) => e.resource === 'aob' && e.source === 'nitrogen-cycle-spawn'
      );
      expect(aobSpawnEffect).toBeUndefined();
    });

    it('does not spawn AOB when ammonia ppm below threshold', () => {
      const state = createTestState({ ammonia: ppmToMass(nitrogenCycleDefaults.aobSpawnThreshold - 0.01), aob: 0 });
      const effects = nitrogenCycleSystem.update(state, DEFAULT_CONFIG);

      const aobEffect = effects.find(
        (e) => e.resource === 'aob' && e.source === 'nitrogen-cycle-spawn'
      );
      expect(aobEffect).toBeUndefined();
    });

    it('spawns NOB when nitrite ppm reaches threshold', () => {
      const state = createTestState({ nitrite: ppmToMass(nitrogenCycleDefaults.nobSpawnThreshold), nob: 0 });
      const effects = nitrogenCycleSystem.update(state, DEFAULT_CONFIG);

      const nobEffect = effects.find(
        (e) => e.resource === 'nob' && e.source === 'nitrogen-cycle-spawn'
      );
      expect(nobEffect).toBeDefined();
      expect(nobEffect!.delta).toBe(nitrogenCycleDefaults.spawnAmount);
    });
  });

  describe('Bacteria Growth (ppm thresholds)', () => {
    it('AOB grows when ammonia ppm available', () => {
      const state = createTestState({
        ammonia: ppmToMass(0.5),
        aob: 100,
        surface: 100000, // Large surface so max = 1000, room to grow
      });
      const effects = nitrogenCycleSystem.update(state, DEFAULT_CONFIG);

      const growthEffect = effects.find(
        (e) => e.resource === 'aob' && e.source === 'nitrogen-cycle-growth'
      );
      expect(growthEffect).toBeDefined();
      expect(growthEffect!.delta).toBeGreaterThan(0);
    });

    it('AOB does not grow when ammonia ppm scarce', () => {
      const state = createTestState({
        ammonia: ppmToMass(nitrogenCycleDefaults.aobFoodThreshold - 0.0001),
        aob: 100,
      });
      const effects = nitrogenCycleSystem.update(state, DEFAULT_CONFIG);

      const growthEffect = effects.find(
        (e) => e.resource === 'aob' && e.source === 'nitrogen-cycle-growth'
      );
      expect(growthEffect).toBeUndefined();
    });

    it('NOB grows when nitrite ppm available', () => {
      const state = createTestState({
        nitrite: ppmToMass(0.5),
        nob: 100,
        surface: 100000, // Large surface so max = 1000, room to grow
      });
      const effects = nitrogenCycleSystem.update(state, DEFAULT_CONFIG);

      const growthEffect = effects.find(
        (e) => e.resource === 'nob' && e.source === 'nitrogen-cycle-growth'
      );
      expect(growthEffect).toBeDefined();
      expect(growthEffect!.delta).toBeGreaterThan(0);
    });
  });

  describe('Bacteria Death (ppm thresholds)', () => {
    it('AOB dies when ammonia ppm scarce', () => {
      const state = createTestState({
        ammonia: 0, // No food (0 mg = 0 ppm)
        aob: 100,
      });
      const effects = nitrogenCycleSystem.update(state, DEFAULT_CONFIG);

      const deathEffect = effects.find(
        (e) => e.resource === 'aob' && e.source === 'nitrogen-cycle-death'
      );
      expect(deathEffect).toBeDefined();
      expect(deathEffect!.delta).toBeLessThan(0);
      expect(deathEffect!.delta).toBeCloseTo(-100 * nitrogenCycleDefaults.bacteriaDeathRate, 10);
    });

    it('AOB does not die when ammonia ppm available', () => {
      const state = createTestState({
        ammonia: ppmToMass(0.5),
        aob: 100,
      });
      const effects = nitrogenCycleSystem.update(state, DEFAULT_CONFIG);

      const deathEffect = effects.find(
        (e) => e.resource === 'aob' && e.source === 'nitrogen-cycle-death'
      );
      expect(deathEffect).toBeUndefined();
    });

    it('NOB dies when nitrite ppm scarce', () => {
      const state = createTestState({
        nitrite: 0,
        nob: 100,
      });
      const effects = nitrogenCycleSystem.update(state, DEFAULT_CONFIG);

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
        surface: 10000, // Max = 100 bacteria with BACTERIA_PER_CM2 = 0.01
      });
      const effects = nitrogenCycleSystem.update(state, DEFAULT_CONFIG);

      const capEffect = effects.find(
        (e) => e.resource === 'aob' && e.source === 'nitrogen-cycle-surface-cap'
      );
      expect(capEffect).toBeDefined();
      expect(capEffect!.delta).toBe(100 - 500); // Reduce to max
    });

    it('caps NOB when surface decreases', () => {
      const state = createTestState({
        nob: 500,
        surface: 10000, // Max = 100 bacteria with BACTERIA_PER_CM2 = 0.01
      });
      const effects = nitrogenCycleSystem.update(state, DEFAULT_CONFIG);

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
        surface: 10000, // Max = 100 bacteria with BACTERIA_PER_CM2 = 0.01
      });
      const effects = nitrogenCycleSystem.update(state, DEFAULT_CONFIG);

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
// Evaporation Concentration Test (Mass-Based Benefit)
// ============================================================================

describe('Evaporation Concentration Effect', () => {
  it('evaporation concentrates nitrogen compounds (ppm increases with same mass)', () => {
    // This is the key benefit of mass-based storage
    const initialWater = 40;
    const initialAmmoniaMass = 4; // 4 mg
    const initialPpm = getPpm(initialAmmoniaMass, initialWater); // 0.1 ppm

    expect(initialPpm).toBeCloseTo(0.1, 10);

    // After evaporation, water decreases but mass stays same
    const afterEvaporationWater = 36; // 10% evaporation
    const afterPpm = getPpm(initialAmmoniaMass, afterEvaporationWater);

    // ppm should increase (same mass, less water)
    expect(afterPpm).toBeGreaterThan(initialPpm);
    expect(afterPpm).toBeCloseTo(4 / 36, 10); // ~0.111 ppm

    // Concentration increase is proportional to water decrease
    expect(afterPpm / initialPpm).toBeCloseTo(initialWater / afterEvaporationWater, 10);
  });

  it('nitrogen compounds concentrate automatically with mass-based storage', () => {
    let state = createSimulation({
      tankCapacity: 40,
      initialTemperature: 25,
    });

    // Add ammonia mass (simulating accumulated ammonia)
    const ammoniaMass = getMassFromPpm(0.5, 40); // 0.5 ppm in 40L = 20 mg
    state = produce(state, (draft) => {
      draft.resources.ammonia = ammoniaMass;
    });

    const initialPpm = getPpm(state.resources.ammonia, state.resources.water);
    expect(initialPpm).toBeCloseTo(0.5, 10);

    // Simulate evaporation (reduce water without changing ammonia mass)
    state = produce(state, (draft) => {
      draft.resources.water = 36; // 10% evaporation
    });

    // Derived ppm automatically increases
    const afterPpm = getPpm(state.resources.ammonia, state.resources.water);
    expect(afterPpm).toBeGreaterThan(initialPpm);
    expect(afterPpm).toBeCloseTo(ammoniaMass / 36, 10); // ~0.556 ppm
  });
});

// ============================================================================
// Integration Test: 25-Day Cycling Scenario
// ============================================================================

describe('25-Day Tank Cycling Integration Test', () => {
  it('simulates a realistic tank cycling over 600 ticks (25 days)', () => {
    // Setup: 40L tank, 25°C, fishless cycle
    let state = createSimulation({
      tankCapacity: 40,
      initialTemperature: 25,
    });

    // Add direct ammonia mass to trigger bacterial spawning
    // 2 ppm in 40L = 80 mg ammonia
    state = produce(state, (draft) => {
      draft.resources.ammonia = getMassFromPpm(2.0, 40);
    });

    // Track key values during simulation (as ppm for assertions)
    const history: {
      tick: number;
      ammoniaPpm: number;
      nitritePpm: number;
      nitratePpm: number;
      aob: number;
      nob: number;
    }[] = [];

    let peakAmmoniaPpm = 0;
    let peakAmmoniaTick = -1;

    // Run for 600 ticks (25 days)
    for (let tick = 0; tick < 600; tick++) {
      // Apply nitrogen cycle system
      const nitrogenEffects = nitrogenCycleSystem.update(state, DEFAULT_CONFIG);
      state = applyEffects(state, nitrogenEffects);

      // Derive ppm for tracking
      const ammoniaPpm = getPpm(state.resources.ammonia, state.resources.water);
      const nitritePpm = getPpm(state.resources.nitrite, state.resources.water);
      const nitratePpm = getPpm(state.resources.nitrate, state.resources.water);

      // Track peaks
      if (ammoniaPpm > peakAmmoniaPpm) {
        peakAmmoniaPpm = ammoniaPpm;
        peakAmmoniaTick = tick;
      }

      // Record history every 24 ticks (once per day)
      if (tick % 24 === 0) {
        history.push({
          tick,
          ammoniaPpm,
          nitritePpm,
          nitratePpm,
          aob: state.resources.aob,
          nob: state.resources.nob,
        });
      }

      // Update tick counter
      state = produce(state, (draft) => {
        draft.tick = tick + 1;
      });
    }

    // Final derived ppm
    const finalAmmoniaPpm = getPpm(state.resources.ammonia, state.resources.water);
    const finalNitritePpm = getPpm(state.resources.nitrite, state.resources.water);
    const finalNitratePpm = getPpm(state.resources.nitrate, state.resources.water);

    // Assertions
    // 1. Ammonia peaks early (bacteria spawn and start consuming it)
    expect(peakAmmoniaTick).toBeGreaterThanOrEqual(0);

    // 2. Ammonia ppm should be decreasing
    expect(finalAmmoniaPpm).toBeLessThan(peakAmmoniaPpm);

    // 3. Nitrite and/or nitrate should accumulate
    const totalProductsPpm = finalNitritePpm + finalNitratePpm;
    expect(totalProductsPpm).toBeGreaterThan(0);

    // 4. AOB population > 0 at end
    expect(state.resources.aob).toBeGreaterThan(0);

    // 5. Mass values are within bounds
    expect(state.resources.ammonia).toBeGreaterThanOrEqual(0);
    expect(state.resources.ammonia).toBeLessThanOrEqual(10000);
    expect(state.resources.nitrite).toBeGreaterThanOrEqual(0);
    expect(state.resources.nitrite).toBeLessThanOrEqual(10000);
    expect(state.resources.nitrate).toBeGreaterThanOrEqual(0);
    expect(state.resources.nitrate).toBeLessThanOrEqual(100000);
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

    // Run for 500 ticks
    for (let tick = 0; tick < 500; tick++) {
      const decayEffects = decaySystem.update(state, DEFAULT_CONFIG);
      state = applyEffects(state, decayEffects);

      const nitrogenEffects = nitrogenCycleSystem.update(state, DEFAULT_CONFIG);
      state = applyEffects(state, nitrogenEffects);

      state = produce(state, (draft) => {
        draft.tick = tick + 1;
      });
    }

    // Food should have largely decayed
    expect(state.resources.food).toBeLessThan(1);

    // Nitrogen cycle should have produced some end products (as mass)
    const totalNitrogenProductsMass = state.resources.nitrite + state.resources.nitrate;
    expect(totalNitrogenProductsMass).toBeGreaterThan(0);

    // Derived ppm should also show accumulation
    const totalNitrogenProductsPpm =
      getPpm(state.resources.nitrite, state.resources.water) +
      getPpm(state.resources.nitrate, state.resources.water);
    expect(totalNitrogenProductsPpm).toBeGreaterThan(0);
  });
});

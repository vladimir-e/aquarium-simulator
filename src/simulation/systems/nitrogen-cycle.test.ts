import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import {
  nitrogenCycleSystem,
  nitrificationFactor,
  calculateMaxBacteria,
  calculateInoculum,
  calculateColonyFlows,
  calculateWasteToAmmonia,
  calculateAmmoniaToNitrite,
  calculateNitriteToNitrate,
  aobCapacity,
  nobCapacity,
  NOB_PROCESSING_RATE_MULTIPLIER,
} from './nitrogen-cycle.js';
import { NH3_TO_NO2_MASS_RATIO, NO2_TO_NO3_MASS_RATIO } from '../core/chemistry.js';
import { createSimulation, type SimulationState } from '../state.js';
import { type SubstrateType } from '../equipment/substrate.js';
import { applyEffects, type Effect } from '../core/effects.js';
import { decaySystem } from './decay.js';
import { getPpm, getMassFromPpm } from '../resources/index.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { nitrogenCycleDefaults } from '../config/nitrogen-cycle.js';

/** The temperature every rate in the config is quoted at. */
const REF = nitrogenCycleDefaults.referenceTemp;

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('calculateMaxBacteria', () => {
  it('returns 0 for zero surface', () => {
    expect(calculateMaxBacteria(0)).toBe(0);
  });

  it('scales linearly with surface area', () => {
    expect(calculateMaxBacteria(5000)).toBeCloseTo(calculateMaxBacteria(1000) * 5, 10);
    expect(calculateMaxBacteria(1000)).toBe(1000 * nitrogenCycleDefaults.bacteriaPerCm2);
  });
});

describe('calculateInoculum', () => {
  it('scales with the water, so a ten times bigger tank seeds ten times heavier', () => {
    expect(calculateInoculum(200)).toBeCloseTo(calculateInoculum(20) * 10, 10);
  });

  it('starts a colony far below the ceiling it will grow into', () => {
    const surface = createSimulation({ tankCapacity: 40, substrate: { type: 'none' } }).resources
      .surface;

    expect(calculateInoculum(40)).toBeLessThan(calculateMaxBacteria(surface) / 1000);
  });
});

describe('nitrificationFactor', () => {
  const { q10 } = nitrogenCycleDefaults;

  it('leaves the rates alone at the temperature they are quoted at', () => {
    expect(nitrificationFactor(REF)).toBe(1);
  });

  it('multiplies by q10 per 10 °C, either way', () => {
    expect(nitrificationFactor(REF + 10)).toBeCloseTo(q10, 10);
    expect(nitrificationFactor(REF - 10)).toBeCloseTo(1 / q10, 10);
    expect(nitrificationFactor(REF + 20)).toBeCloseTo(q10 * q10, 10);
  });

  it('slows what a colony can oxidise in cold water, both stages alike', () => {
    const cold = REF - 10;
    const glut = 1e6;
    const bacteria = 100;

    expect(calculateAmmoniaToNitrite(glut, bacteria, cold).ammoniaConsumed).toBeCloseTo(
      calculateAmmoniaToNitrite(glut, bacteria, REF).ammoniaConsumed / q10,
      10
    );
    expect(calculateNitriteToNitrate(glut, bacteria, cold).nitriteConsumed).toBeCloseTo(
      calculateNitriteToNitrate(glut, bacteria, REF).nitriteConsumed / q10,
      10
    );
  });
});

describe('calculateColonyFlows', () => {
  const { aobGrowthRate: growthRate, bacteriaDeathRate: deathRate } = nitrogenCycleDefaults;
  const flows = (
    population: number,
    utilization: number,
    maxPopulation = 1000
  ): { growth: number; death: number } =>
    calculateColonyFlows(population, utilization, growthRate, deathRate, maxPopulation);

  it('has nothing to give or lose without a population', () => {
    expect(flows(0, 1)).toEqual({ growth: 0, death: 0 });
  });

  it('cannot grow onto surface that does not exist', () => {
    expect(flows(100, 1, 0).growth).toBe(0);
  });

  it('grows at the full rate only when the colony used all its capacity', () => {
    const population = 100;
    expect(flows(population, 1).growth).toBeCloseTo(growthRate * population * 0.9, 10);
  });

  it('scales growth with utilization, and gives none for an idle colony', () => {
    expect(flows(100, 0).growth).toBe(0);

    const half = flows(100, 0.5).growth;
    const full = flows(100, 1).growth;
    expect(half).toBeCloseTo(full / 2, 10);
  });

  it('is monotonic in utilization', () => {
    let previous = -1;
    for (const utilization of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      const { growth } = flows(100, utilization);
      expect(growth).toBeGreaterThan(previous);
      previous = growth;
    }
  });

  it('brakes on the logistic term as the colony fills its ceiling', () => {
    const perCapita = (population: number): number => flows(population, 1).growth / population;

    expect(perCapita(500)).toBeLessThan(perCapita(100));
    expect(perCapita(900)).toBeLessThan(perCapita(500));
    expect(perCapita(1000)).toBe(0);
  });

  it('never grows a colony past its ceiling', () => {
    for (const population of [1, 500, 900, 999, 1000]) {
      expect(population + flows(population, 1).growth).toBeLessThanOrEqual(1000);
    }
  });

  it('gives no growth for a utilization below zero, and still takes its decay', () => {
    const { growth, death } = flows(100, -1);

    expect(growth).toBe(0);
    expect(death).toBeCloseTo(100 * deathRate, 12);
  });

  it('holds the ceiling however far utilization overshoots one', () => {
    expect(100 + flows(100, 1e6).growth).toBe(1000);
  });

  it('loses the same fraction whatever the colony is eating', () => {
    for (const utilization of [0, 0.001, 0.5, 1]) {
      expect(flows(100, utilization).death).toBeCloseTo(100 * deathRate, 12);
    }
  });

  it('loses in proportion to the colony it is thinning', () => {
    expect(flows(200, 1).death).toBeCloseTo(flows(100, 1).death * 2, 12);
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
  it('returns zero consumption and production for no ammonia', () => {
    const result = calculateAmmoniaToNitrite(0, 100, REF);
    expect(result.ammoniaConsumed).toBe(0);
    expect(result.nitriteProduced).toBe(0);
  });

  it('returns zero for no bacteria', () => {
    const result = calculateAmmoniaToNitrite(1.0, 0, REF);
    expect(result.ammoniaConsumed).toBe(0);
    expect(result.nitriteProduced).toBe(0);
  });

  it('reports no utilization when a tuned-down rate leaves no capacity at all', () => {
    const noRate = { ...nitrogenCycleDefaults, bacteriaProcessingRate: 0 };
    const result = calculateAmmoniaToNitrite(1.0, 100, REF, noRate);

    expect(result.ammoniaConsumed).toBe(0);
    expect(result.utilization).toBe(0);
  });

  it('doubles the mass it clears when the colony doubles', () => {
    const glut = 1e6;
    const one = calculateAmmoniaToNitrite(glut, 100, REF).ammoniaConsumed;
    const two = calculateAmmoniaToNitrite(glut, 200, REF).ammoniaConsumed;

    expect(one).toBeGreaterThan(0);
    expect(two).toBeCloseTo(one * 2, 10);
  });

  it('clears mg per bacteria unit — the rate carries no litres', () => {
    // The unit `bacteriaProcessingRate` is quoted in. A colony's throughput is
    // a property of its cells, so nothing here can depend on how much water
    // happens to surround them.
    const bacteria = 100;
    const { ammoniaConsumed } = calculateAmmoniaToNitrite(1e6, bacteria, REF);

    expect(ammoniaConsumed).toBeCloseTo(
      bacteria * nitrogenCycleDefaults.bacteriaProcessingRate,
      10
    );
  });

  it('cannot process more ammonia than available', () => {
    const ammoniaMass = 0.001;
    const { ammoniaConsumed } = calculateAmmoniaToNitrite(ammoniaMass, 1000, REF);
    expect(ammoniaConsumed).toBe(ammoniaMass);
  });

  it('scales nitrite produced by MW_NO2 / MW_NH3 (N-mass conserved)', () => {
    const { ammoniaConsumed, nitriteProduced } = calculateAmmoniaToNitrite(100, 100, REF);

    expect(ammoniaConsumed).toBeGreaterThan(0);
    expect(nitriteProduced).toBeCloseTo(ammoniaConsumed * NH3_TO_NO2_MASS_RATIO, 10);
    // N-mass conservation: mg of N is the same before and after.
    expect(nitriteProduced * (14.01 / 46.01)).toBeCloseTo(ammoniaConsumed * (14.01 / 17.03), 10);
  });
});

describe('aobCapacity / nobCapacity', () => {
  it('is exactly what its stage saturates at, so a readout can speak for the engine', () => {
    const glut = 1e6;
    const cold = 18;

    expect(calculateAmmoniaToNitrite(glut, 250, cold).ammoniaConsumed).toBe(aobCapacity(250, cold));
    expect(calculateNitriteToNitrate(glut, 250, cold).nitriteConsumed).toBe(nobCapacity(250, cold));
  });

  it('scales with the colony and with how fast the water lets it work', () => {
    expect(aobCapacity(200, REF)).toBeCloseTo(aobCapacity(100, REF) * 2, 12);
    expect(aobCapacity(100, 18)).toBeLessThan(aobCapacity(100, REF));
    expect(nobCapacity(100, REF) / aobCapacity(100, REF)).toBeCloseTo(
      NOB_PROCESSING_RATE_MULTIPLIER,
      12
    );
  });
});

describe('calculateNitriteToNitrate', () => {
  it('returns zero consumption and production for no nitrite', () => {
    const result = calculateNitriteToNitrate(0, 100, REF);
    expect(result.nitriteConsumed).toBe(0);
    expect(result.nitrateProduced).toBe(0);
  });

  it('returns zero for no bacteria', () => {
    const result = calculateNitriteToNitrate(1.0, 0, REF);
    expect(result.nitriteConsumed).toBe(0);
    expect(result.nitrateProduced).toBe(0);
  });

  it('reports no utilization when a tuned-down rate leaves no capacity at all', () => {
    const noRate = { ...nitrogenCycleDefaults, bacteriaProcessingRate: 0 };
    const result = calculateNitriteToNitrate(1.0, 100, REF, noRate);

    expect(result.nitriteConsumed).toBe(0);
    expect(result.utilization).toBe(0);
  });

  it('runs at the AOB rate times the NOB multiplier, per bacteria unit', () => {
    const bacteria = 100;
    const { nitriteConsumed } = calculateNitriteToNitrate(1e6, bacteria, REF);

    expect(nitriteConsumed).toBeCloseTo(
      bacteria * nitrogenCycleDefaults.bacteriaProcessingRate * NOB_PROCESSING_RATE_MULTIPLIER,
      10
    );
  });

  it('cannot process more nitrite than available', () => {
    const nitriteMass = 0.001;
    const { nitriteConsumed } = calculateNitriteToNitrate(nitriteMass, 1000, REF);
    expect(nitriteConsumed).toBe(nitriteMass);
  });

  it('scales nitrate produced by MW_NO3 / MW_NO2 (N-mass conserved)', () => {
    const { nitriteConsumed, nitrateProduced } = calculateNitriteToNitrate(1000, 100, REF);

    expect(nitriteConsumed).toBeGreaterThan(0);
    expect(nitrateProduced).toBeCloseTo(nitriteConsumed * NO2_TO_NO3_MASS_RATIO, 10);
    // N-mass conservation.
    expect(nitrateProduced * (14.01 / 62.0)).toBeCloseTo(nitriteConsumed * (14.01 / 46.01), 10);
  });

  it('NOB throughput matches AOB in N-atom terms at population parity', () => {
    // Key stoichiometric property: at equal populations and non-limiting
    // substrate, NOB should consume NO2 mass equal to what AOB produces
    // from an equivalent NH3 consumption. Expressed per N atom, throughput
    // is identical.
    const bacteria = 100;
    const { ammoniaConsumed, nitriteProduced } = calculateAmmoniaToNitrite(1e6, bacteria, REF);
    const { nitriteConsumed } = calculateNitriteToNitrate(1e6, bacteria, REF);

    // NOB clears exactly the NO2 mass AOB just produced (balanced chain).
    expect(nitriteConsumed).toBeCloseTo(nitriteProduced, 8);
    // Per-N-atom: same mg of elemental N passes through each stage.
    const nFromAob = ammoniaConsumed * (14.01 / 17.03);
    const nFromNob = nitriteConsumed * (14.01 / 46.01);
    expect(nFromNob).toBeCloseTo(nFromAob, 8);
  });
});

describe('NOB_PROCESSING_RATE_MULTIPLIER', () => {
  it('is the mass a milligram of NH3 gains on its way to NO2', () => {
    expect(NOB_PROCESSING_RATE_MULTIPLIER).toBeCloseTo(46.01 / 17.03, 10);
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
      substrate: SubstrateType;
    }> = {}
  ): SimulationState {
    const state = createSimulation({
      tankCapacity: 40,
      substrate: { type: overrides.substrate ?? 'none' },
    });
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
      // NO2 mass = NH3 mass × MW_NO2 / MW_NH3 (N-mass conserved)
      expect(nitriteEffect!.delta).toBeCloseTo(-ammoniaEffect!.delta * NH3_TO_NO2_MASS_RATIO, 10);
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
      // NO3 mass = NO2 mass × MW_NO3 / MW_NO2 (N-mass conserved)
      expect(nitrateEffect!.delta).toBeCloseTo(-nitriteEffect!.delta * NO2_TO_NO3_MASS_RATIO, 10);
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

  describe('A drained tank', () => {
    // Nitrifiers oxidise what is dissolved. A persisted or API-built state may
    // carry no water at all, and a colony there has nothing to work on.
    const COLONY = 1000;
    const dry = (): Effect[] =>
      nitrogenCycleSystem.update(
        createTestState({ ammonia: 100, nitrite: 100, aob: COLONY, nob: COLONY, water: 0 }),
        DEFAULT_CONFIG
      );

    it('oxidises neither the ammonia nor the nitrite standing in it', () => {
      expect(dry().filter((e) => e.source === 'nitrogen-cycle-aob')).toEqual([]);
      expect(dry().filter((e) => e.source === 'nitrogen-cycle-nob')).toEqual([]);
    });

    it('grows no colony on work it did not do', () => {
      expect(dry().filter((e) => e.source === 'nitrogen-cycle-growth')).toEqual([]);
    });

    it('still thins both colonies — a dry bed dies off rather than waiting', () => {
      const death = (resource: 'aob' | 'nob'): number =>
        dry().find((e) => e.resource === resource && e.source === 'nitrogen-cycle-death')!.delta;

      expect(death('aob')).toBeCloseTo(-COLONY * nitrogenCycleDefaults.bacteriaDeathRate, 10);
      expect(death('nob')).toBeCloseTo(-COLONY * nitrogenCycleDefaults.bacteriaDeathRate, 10);
    });
  });

  describe('Bacteria Spawning (ppm thresholds)', () => {
    const seeded = (
      overrides: Parameters<typeof createTestState>[0] = {}
    ): SimulationState => createTestState({ substrate: 'aqua_soil', ...overrides });

    const spawn = (state: SimulationState, resource: 'aob' | 'nob'): number | undefined =>
      nitrogenCycleSystem
        .update(state, DEFAULT_CONFIG)
        .find((e) => e.resource === resource && e.source === 'nitrogen-cycle-spawn')?.delta;

    it('spawns AOB when ammonia ppm reaches threshold', () => {
      const state = seeded({ ammonia: ppmToMass(nitrogenCycleDefaults.aobSpawnThreshold), aob: 0 });

      expect(spawn(state, 'aob')).toBe(calculateInoculum(state.tank.capacity));
    });

    it('does not spawn AOB when already present', () => {
      const state = seeded({ ammonia: ppmToMass(nitrogenCycleDefaults.aobSpawnThreshold), aob: 1 });

      expect(spawn(state, 'aob')).toBeUndefined();
    });

    it('does not spawn AOB when ammonia ppm below threshold', () => {
      const state = seeded({
        ammonia: ppmToMass(nitrogenCycleDefaults.aobSpawnThreshold - 0.01),
        aob: 0,
      });

      expect(spawn(state, 'aob')).toBeUndefined();
    });

    it('spawns NOB when nitrite ppm reaches threshold', () => {
      const state = seeded({ nitrite: ppmToMass(nitrogenCycleDefaults.nobSpawnThreshold), nob: 0 });

      expect(spawn(state, 'nob')).toBe(calculateInoculum(state.tank.capacity));
    });

    it('seeds every scape alike, bare bottom included', () => {
      const onEach = (substrate: SubstrateType): number | undefined =>
        spawn(
          createTestState({
            substrate,
            ammonia: ppmToMass(nitrogenCycleDefaults.aobSpawnThreshold),
            aob: 0,
          }),
          'aob'
        );

      for (const substrate of ['sand', 'gravel', 'aqua_soil'] as SubstrateType[]) {
        expect(onEach(substrate)).toBe(onEach('none'));
      }
      expect(onEach('none')).toBeGreaterThan(0);
    });
  });

  describe('Bacteria Growth (proportional to work done)', () => {
    /** Surface big enough that the logistic ceiling is not what is being read. */
    const ROOMY = 100000;

    function growth(resource: 'aob' | 'nob', state: SimulationState): number | undefined {
      return nitrogenCycleSystem
        .update(state, DEFAULT_CONFIG)
        .find((e) => e.resource === resource && e.source === 'nitrogen-cycle-growth')?.delta;
    }

    it('grows AOB on the ammonia it oxidised', () => {
      expect(
        growth('aob', createTestState({ ammonia: ppmToMass(0.5), aob: 100, surface: ROOMY }))
      ).toBeGreaterThan(0);
    });

    it('grows NOB on the nitrite it oxidised', () => {
      expect(
        growth('nob', createTestState({ nitrite: ppmToMass(0.5), nob: 100, surface: ROOMY }))
      ).toBeGreaterThan(0);
    });

    it('grows a colony that clears its entire load', () => {
      // The inversion of the old bug: consuming everything used to leave the
      // colony under its food threshold, so success was punished with death.
      const aob = 100;
      const wholeLoad = aob * nitrogenCycleDefaults.bacteriaProcessingRate * 0.5;
      const state = createTestState({ ammonia: wholeLoad, aob, surface: ROOMY });

      const effects = nitrogenCycleSystem.update(state, DEFAULT_CONFIG);
      const consumed = effects.find(
        (e) => e.resource === 'ammonia' && e.source === 'nitrogen-cycle-aob'
      )!.delta;

      expect(-consumed).toBeCloseTo(wholeLoad, 12);
      expect(growth('aob', state)).toBeGreaterThan(0);
    });

    it('grows harder for a heavier load', () => {
      // Both loads sit under the colony's capacity, so utilization — and with
      // it growth — reads the load rather than saturating at 1.
      const capacity = 100 * nitrogenCycleDefaults.bacteriaProcessingRate;
      const light = growth('aob', createTestState({ ammonia: capacity * 0.1, aob: 100, surface: ROOMY }));
      const heavy = growth('aob', createTestState({ ammonia: capacity * 0.9, aob: 100, surface: ROOMY }));

      expect(light).toBeGreaterThan(0);
      expect(heavy!).toBeGreaterThan(light!);
    });

    it('grows a colony slower in cold water than in warm', () => {
      const at = (temperature: number): number | undefined =>
        growth(
          'aob',
          produce(createTestState({ ammonia: ppmToMass(0.5), aob: 100, surface: ROOMY }), (draft) => {
            draft.resources.temperature = temperature;
          })
        );

      expect(at(18)!).toBeLessThan(at(25)!);
      expect(at(30)!).toBeGreaterThan(at(25)!);
    });

    it('does not grow a colony with nothing to eat', () => {
      expect(growth('aob', createTestState({ ammonia: 0, aob: 100, surface: ROOMY }))).toBeUndefined();
      expect(growth('nob', createTestState({ nitrite: 0, nob: 100, surface: ROOMY }))).toBeUndefined();
    });
  });

  describe('Bacteria Death (unconditional maintenance)', () => {
    function death(resource: 'aob' | 'nob', state: SimulationState): number | undefined {
      return nitrogenCycleSystem
        .update(state, DEFAULT_CONFIG)
        .find((e) => e.resource === resource && e.source === 'nitrogen-cycle-death')?.delta;
    }

    it('thins a fixed fraction of the colony every tick', () => {
      expect(death('aob', createTestState({ ammonia: 0, aob: 100 }))).toBeCloseTo(
        -100 * nitrogenCycleDefaults.bacteriaDeathRate,
        10
      );
    });

    it('thins a well-fed colony exactly as hard as a starving one', () => {
      const fed = death('aob', createTestState({ ammonia: ppmToMass(5), aob: 100 }));
      const starving = death('aob', createTestState({ ammonia: 0, aob: 100 }));

      expect(fed).toBeCloseTo(starving!, 12);
    });

    it('thins NOB on the same terms', () => {
      const fed = death('nob', createTestState({ nitrite: ppmToMass(5), nob: 100 }));
      const starving = death('nob', createTestState({ nitrite: 0, nob: 100 }));

      expect(fed).toBeCloseTo(-100 * nitrogenCycleDefaults.bacteriaDeathRate, 10);
      expect(fed).toBeCloseTo(starving!, 12);
    });
  });

  describe('Surface Cap', () => {
    const SURFACE = 10000;
    const MAX = calculateMaxBacteria(SURFACE);

    it('caps AOB when surface decreases', () => {
      const state = createTestState({ aob: MAX * 5, surface: SURFACE });
      const effects = nitrogenCycleSystem.update(state, DEFAULT_CONFIG);

      const capEffect = effects.find(
        (e) => e.resource === 'aob' && e.source === 'nitrogen-cycle-surface-cap'
      );
      expect(capEffect).toBeDefined();
      expect(capEffect!.delta).toBe(MAX - MAX * 5);
    });

    it('caps NOB when surface decreases', () => {
      const state = createTestState({ nob: MAX * 5, surface: SURFACE });
      const effects = nitrogenCycleSystem.update(state, DEFAULT_CONFIG);

      const capEffect = effects.find(
        (e) => e.resource === 'nob' && e.source === 'nitrogen-cycle-surface-cap'
      );
      expect(capEffect).toBeDefined();
      expect(capEffect!.delta).toBe(MAX - MAX * 5);
    });

    it('does not cap when under limit', () => {
      const state = createTestState({ aob: MAX / 2, nob: MAX / 2, surface: SURFACE });
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

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import {
  nitrogenCycleSystem,
  nitrificationFactor,
  calculateMaxBacteria,
  calculateSeeding,
  calculateColonyFlows,
  colonyRates,
  restingColony,
  calculateWasteToAmmonia,
  calculateAmmoniaToNitrite,
  calculateNitriteToNitrate,
  aobCapacity,
  nobCapacity,
  nitrifierOxygenFactor,
  nobProcessingRateMultiplier,
} from './nitrogen-cycle.js';
import {
  CACO3_PER_NH3_NITRIFIED,
  MW_N,
  MW_NH3,
  NH3_TO_NO2_MASS_RATIO,
  NO2_TO_NO3_MASS_RATIO,
  O2_PER_NH3_OXIDIZED,
  O2_PER_NO2_OXIDIZED,
} from '../core/chemistry.js';
import { createSimulation, type SimulationState } from '../state.js';
import { type SubstrateType } from '../equipment/substrate.js';
import { type Effect } from '../core/effects.js';
import { getPpm, getMassFromPpm } from '../resources/index.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { AIR_SATURATED_O2, nitrogenCycleDefaults } from '../config/nitrogen-cycle.js';

const REF = nitrogenCycleDefaults.referenceTemp;
const AMPLE_O2 = 8;
const W = 100;
const SAT = { ...nitrogenCycleDefaults, aobAmmoniaHalfSaturation: 0, nobNitriteHalfSaturation: 0 };

describe('calculateMaxBacteria', () => {
  it('returns 0 for zero surface', () => {
    expect(calculateMaxBacteria(0)).toBe(0);
  });

  it('scales linearly with surface area', () => {
    expect(calculateMaxBacteria(5000)).toBeCloseTo(calculateMaxBacteria(1000) * 5, 10);
    expect(calculateMaxBacteria(1000)).toBe(1000 * nitrogenCycleDefaults.bacteriaPerCm2);
  });
});

describe('calculateSeeding', () => {
  it('scales with the water, so a ten times bigger tank seeds ten times heavier', () => {
    expect(calculateSeeding(200)).toBeCloseTo(calculateSeeding(20) * 10, 10);
  });

  it('seeds nothing into a drained tank', () => {
    expect(calculateSeeding(0)).toBe(0);
    expect(calculateSeeding(-5)).toBe(0);
  });

  it('trickles in far below the ceiling a colony grows into', () => {
    const surface = createSimulation({ tankCapacity: 40, substrate: { type: 'none' } }).resources
      .surface;

    expect(calculateSeeding(40)).toBeLessThan(calculateMaxBacteria(surface) / 1e6);
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

    expect(calculateAmmoniaToNitrite(glut, W, bacteria, cold, AMPLE_O2, SAT).ammoniaConsumed).toBeCloseTo(
      calculateAmmoniaToNitrite(glut, W, bacteria, REF, AMPLE_O2, SAT).ammoniaConsumed / q10,
      10
    );
    expect(calculateNitriteToNitrate(glut, W, bacteria, cold, AMPLE_O2, SAT).nitriteConsumed).toBeCloseTo(
      calculateNitriteToNitrate(glut, W, bacteria, REF, AMPLE_O2, SAT).nitriteConsumed / q10,
      10
    );
  });
});

describe('calculateColonyFlows', () => {
  const { aobGrowthRate: growthRate, bacteriaDeathRate: deathRate } = nitrogenCycleDefaults;
  const flows = (
    population: number,
    utilization: number,
    maxPopulation = 1000,
    seeding = 0
  ): { growth: number; death: number } =>
    calculateColonyFlows(population, utilization, growthRate, deathRate, maxPopulation, seeding);

  it('has nothing to give or lose without a population or a seed', () => {
    expect(flows(0, 1)).toEqual({ growth: 0, death: 0 });
  });

  it('starts an empty colony on the seed alone', () => {
    expect(flows(0, 1, 1000, 0.5)).toEqual({ growth: 0.5, death: 0 });
  });

  it('adds the seed to growth, idle or working', () => {
    expect(flows(100, 0, 1000, 0.5).growth).toBeCloseTo(0.5, 12);
    expect(flows(100, 1, 1000, 0.5).growth).toBeCloseTo(flows(100, 1).growth + 0.5, 12);
  });

  it('never seeds a colony past its ceiling', () => {
    expect(1000 + flows(1000, 1, 1000, 0.5).growth).toBe(1000);
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

describe('restingColony', () => {
  const temperature = 24;
  const oxygen = AIR_SATURATED_O2;
  const maxPopulation = 1e6;

  it.each(['aob', 'nob'] as const)('balances %s growth against decay on the supply it is sized to', (stage) => {
    const supply = 2;
    const population = restingColony(stage, supply, temperature, oxygen, maxPopulation);
    const capacity = (stage === 'aob' ? aobCapacity : nobCapacity)(population, temperature, oxygen);
    const { growthRate, deathRate } = colonyRates(stage, temperature, oxygen);
    const { growth, death } = calculateColonyFlows(
      population,
      supply / capacity,
      growthRate,
      deathRate,
      maxPopulation,
      0
    );

    expect(growth).toBeCloseTo(death, 9);
  });

  it('grows with the supply and stays under the ceiling', () => {
    const rest = (supply: number): number =>
      restingColony('aob', supply, temperature, oxygen, maxPopulation);

    expect(rest(0)).toBe(0);
    expect(rest(2)).toBeGreaterThan(rest(1));
    expect(rest(1e9)).toBeLessThan(maxPopulation);
  });

  it('needs a larger colony in a cold tank for the same supply', () => {
    expect(restingColony('aob', 1, 18, oxygen, maxPopulation)).toBeGreaterThan(
      restingColony('aob', 1, 28, oxygen, maxPopulation)
    );
  });
});

describe('calculateWasteToAmmonia', () => {
  it('returns zero for no waste', () => {
    const result = calculateWasteToAmmonia(0);
    expect(result.wasteConsumed).toBe(0);
    expect(result.ammoniaProduced).toBe(0);
  });

  it('converts the waste-conversion share of waste each tick', () => {
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
});

describe('calculateAmmoniaToNitrite', () => {
  it('returns zero consumption and production for no ammonia', () => {
    const result = calculateAmmoniaToNitrite(0, W, 100, REF, AMPLE_O2);
    expect(result.ammoniaConsumed).toBe(0);
    expect(result.nitriteProduced).toBe(0);
  });

  it('returns zero for no bacteria', () => {
    const result = calculateAmmoniaToNitrite(1.0, W, 0, REF, AMPLE_O2);
    expect(result.ammoniaConsumed).toBe(0);
    expect(result.nitriteProduced).toBe(0);
  });

  it('reports no utilization when a tuned-down rate leaves no capacity at all', () => {
    const noRate = { ...nitrogenCycleDefaults, bacteriaProcessingRate: 0 };
    const result = calculateAmmoniaToNitrite(1.0, W, 100, REF, AMPLE_O2, noRate);

    expect(result.ammoniaConsumed).toBe(0);
    expect(result.utilization).toBe(0);
  });

  it('spends alkalinity in proportion to the nitrogen it oxidises — 7.14 mg CaCO3 per mg N', () => {
    const glut = 1e6;
    const one = calculateAmmoniaToNitrite(glut, W, 100, REF, AMPLE_O2, SAT);
    const two = calculateAmmoniaToNitrite(glut, W, 200, REF, AMPLE_O2, SAT);
    const nitrogen = one.ammoniaConsumed * (MW_N / MW_NH3);

    expect(one.alkalinityConsumedMg / nitrogen).toBeCloseTo(7.14, 2);
    expect(two.alkalinityConsumedMg).toBeCloseTo(2 * one.alkalinityConsumedMg, 10);
  });

  it('doubles the mass it clears when the colony doubles', () => {
    const glut = 1e6;
    const one = calculateAmmoniaToNitrite(glut, W, 100, REF, AMPLE_O2, SAT).ammoniaConsumed;
    const two = calculateAmmoniaToNitrite(glut, W, 200, REF, AMPLE_O2, SAT).ammoniaConsumed;

    expect(one).toBeGreaterThan(0);
    expect(two).toBeCloseTo(one * 2, 10);
  });

  it('clears mg per bacteria unit — the rate carries no litres', () => {
    const bacteria = 100;
    const { ammoniaConsumed } = calculateAmmoniaToNitrite(1e6, W, bacteria, REF, AMPLE_O2, SAT);

    expect(ammoniaConsumed).toBeCloseTo(
      bacteria *
        nitrogenCycleDefaults.bacteriaProcessingRate *
        nitrifierOxygenFactor('aob', AMPLE_O2),
      10
    );
  });

  it('never takes more ammonia than the water holds, however large the colony', () => {
    const ammoniaMass = 0.001;
    for (const bacteria of [1e3, 1e6, 1e9]) {
      const { ammoniaConsumed } = calculateAmmoniaToNitrite(ammoniaMass, W, bacteria, REF, AMPLE_O2);
      expect(ammoniaConsumed).toBeLessThan(ammoniaMass);
    }
  });

  it('scales nitrite produced by MW_NO2 / MW_NH3 (N-mass conserved)', () => {
    const { ammoniaConsumed, nitriteProduced } = calculateAmmoniaToNitrite(100, W, 100, REF, AMPLE_O2);

    expect(ammoniaConsumed).toBeGreaterThan(0);
    expect(nitriteProduced).toBeCloseTo(ammoniaConsumed * NH3_TO_NO2_MASS_RATIO, 10);
    expect(nitriteProduced * (14.01 / 46.01)).toBeCloseTo(ammoniaConsumed * (14.01 / 17.03), 10);
  });

  it('pays for the ammonia it oxidises at the reaction rate, not at a rate of its own', () => {
    const { ammoniaConsumed, oxygenConsumedMg } = calculateAmmoniaToNitrite(100, W, 100, REF, AMPLE_O2);

    expect(oxygenConsumedMg).toBeCloseTo(ammoniaConsumed * O2_PER_NH3_OXIDIZED, 12);
  });

  it('spends nothing on an hour it converts nothing in', () => {
    expect(calculateAmmoniaToNitrite(0, W, 100, REF, AMPLE_O2).oxygenConsumedMg).toBe(0);
    expect(calculateAmmoniaToNitrite(100, W, 0, REF, AMPLE_O2).oxygenConsumedMg).toBe(0);
    expect(calculateAmmoniaToNitrite(100, W, 100, REF, 0).oxygenConsumedMg).toBe(0);
  });
});

describe('aobCapacity / nobCapacity', () => {
  it('is exactly what its stage saturates at, so a readout can speak for the engine', () => {
    const glut = 1e6;
    const cold = 18;

    expect(calculateAmmoniaToNitrite(glut, W, 250, cold, AMPLE_O2, SAT).ammoniaConsumed).toBe(aobCapacity(250, cold, AMPLE_O2));
    expect(calculateNitriteToNitrate(glut, W, 250, cold, AMPLE_O2, SAT).nitriteConsumed).toBe(nobCapacity(250, cold, AMPLE_O2));
  });

  it('scales with the colony and with how fast the water lets it work', () => {
    expect(aobCapacity(200, REF, AMPLE_O2)).toBeCloseTo(aobCapacity(100, REF, AMPLE_O2) * 2, 12);
    expect(aobCapacity(100, 18, AMPLE_O2)).toBeLessThan(aobCapacity(100, REF, AMPLE_O2));
    expect(aobCapacity(100, REF, 1)).toBeLessThan(aobCapacity(100, REF, AMPLE_O2));
    expect(nobCapacity(100, REF, AMPLE_O2) / aobCapacity(100, REF, AMPLE_O2)).toBeCloseTo(
      (nobProcessingRateMultiplier() * nitrifierOxygenFactor('nob', AMPLE_O2)) /
        nitrifierOxygenFactor('aob', AMPLE_O2),
      12
    );
  });
});

describe('calculateNitriteToNitrate', () => {
  it('returns zero consumption and production for no nitrite', () => {
    const result = calculateNitriteToNitrate(0, W, 100, REF, AMPLE_O2);
    expect(result.nitriteConsumed).toBe(0);
    expect(result.nitrateProduced).toBe(0);
  });

  it('returns zero for no bacteria', () => {
    const result = calculateNitriteToNitrate(1.0, W, 0, REF, AMPLE_O2);
    expect(result.nitriteConsumed).toBe(0);
    expect(result.nitrateProduced).toBe(0);
  });

  it('reports no utilization when a tuned-down rate leaves no capacity at all', () => {
    const noRate = { ...nitrogenCycleDefaults, bacteriaProcessingRate: 0 };
    const result = calculateNitriteToNitrate(1.0, W, 100, REF, AMPLE_O2, noRate);

    expect(result.nitriteConsumed).toBe(0);
    expect(result.utilization).toBe(0);
  });

  it('runs at the AOB rate times the NOB multiplier, per bacteria unit', () => {
    const bacteria = 100;
    const { nitriteConsumed } = calculateNitriteToNitrate(1e6, W, bacteria, REF, AMPLE_O2, SAT);

    expect(nitriteConsumed).toBeCloseTo(
      bacteria *
        nitrogenCycleDefaults.bacteriaProcessingRate *
        nobProcessingRateMultiplier() *
        nitrifierOxygenFactor('nob', AMPLE_O2),
      10
    );
  });

  it('never takes more nitrite than the water holds, however large the colony', () => {
    const nitriteMass = 0.001;
    for (const bacteria of [1e3, 1e6, 1e9]) {
      const { nitriteConsumed } = calculateNitriteToNitrate(nitriteMass, W, bacteria, REF, AMPLE_O2);
      expect(nitriteConsumed).toBeLessThan(nitriteMass);
    }
  });

  it('scales nitrate produced by MW_NO3 / MW_NO2 (N-mass conserved)', () => {
    const { nitriteConsumed, nitrateProduced } = calculateNitriteToNitrate(1000, W, 100, REF, AMPLE_O2);

    expect(nitriteConsumed).toBeGreaterThan(0);
    expect(nitrateProduced).toBeCloseTo(nitriteConsumed * NO2_TO_NO3_MASS_RATIO, 10);
    expect(nitrateProduced * (14.01 / 62.0)).toBeCloseTo(nitriteConsumed * (14.01 / 46.01), 10);
  });

  it('pays for the nitrite it oxidises at the reaction rate, not at a rate of its own', () => {
    const { nitriteConsumed, oxygenConsumedMg } = calculateNitriteToNitrate(1000, W, 100, REF, AMPLE_O2);

    expect(oxygenConsumedMg).toBeCloseTo(nitriteConsumed * O2_PER_NO2_OXIDIZED, 12);
  });

  it('spends nothing on an hour it converts nothing in', () => {
    expect(calculateNitriteToNitrate(0, W, 100, REF, AMPLE_O2).oxygenConsumedMg).toBe(0);
    expect(calculateNitriteToNitrate(1000, W, 0, REF, AMPLE_O2).oxygenConsumedMg).toBe(0);
    expect(calculateNitriteToNitrate(1000, W, 100, REF, 0).oxygenConsumedMg).toBe(0);
  });

  it('clears exactly what AOB produce at population parity, in the water both rates are quoted in', () => {
    const bacteria = 100;
    const saturated = AIR_SATURATED_O2;
    const { ammoniaConsumed, nitriteProduced } = calculateAmmoniaToNitrite(1e6, W, bacteria, REF, saturated, SAT);
    const { nitriteConsumed } = calculateNitriteToNitrate(1e6, W, bacteria, REF, saturated, SAT);

    expect(nitriteConsumed).toBeCloseTo(nitriteProduced, 10);

    const nFromAob = ammoniaConsumed * (14.01 / 17.03);
    const nFromNob = nitriteConsumed * (14.01 / 46.01);
    expect(nFromNob).toBeCloseTo(nFromAob, 10);
  });

  it('falls behind that parity in every thinner water, and by more the thinner it gets', () => {
    const bacteria = 100;
    const shortfall = (oxygen: number): number =>
      calculateNitriteToNitrate(1e6, W, bacteria, REF, oxygen, SAT).nitriteConsumed /
      calculateAmmoniaToNitrite(1e6, W, bacteria, REF, oxygen, SAT).nitriteProduced;

    let previous = 1;
    for (const oxygen of [8, 4, 2, 1, 0.5, 0.25, 0.1]) {
      const behind = shortfall(oxygen);
      expect(behind).toBeLessThan(previous);
      previous = behind;
    }
  });
});

describe('substrate saturation', () => {
  const stages = [
    {
      name: 'AOB on ammonia',
      k: nitrogenCycleDefaults.aobAmmoniaHalfSaturation,
      capacity: (bacteria: number): number => aobCapacity(bacteria, REF, AMPLE_O2),
      consumed: (mass: number, bacteria: number): number =>
        calculateAmmoniaToNitrite(mass, W, bacteria, REF, AMPLE_O2).ammoniaConsumed,
    },
    {
      name: 'NOB on nitrite',
      k: nitrogenCycleDefaults.nobNitriteHalfSaturation,
      capacity: (bacteria: number): number => nobCapacity(bacteria, REF, AMPLE_O2),
      consumed: (mass: number, bacteria: number): number =>
        calculateNitriteToNitrate(mass, W, bacteria, REF, AMPLE_O2).nitriteConsumed,
    },
  ];

  for (const stage of stages) {
    describe(stage.name, () => {
      const bacteria = 1000;
      const capacity = stage.capacity(bacteria);

      it('oxidises nothing with no substrate in the water', () => {
        expect(stage.consumed(0, bacteria)).toBe(0);
      });

      it('rises with substrate and saturates at capacity', () => {
        let previous = 0;
        for (const ppm of [0.01, 0.1, 1, 10, 100]) {
          const rate = stage.consumed(getMassFromPpm(ppm, W), bacteria);
          expect(rate).toBeGreaterThan(previous);
          previous = rate;
        }
        expect(stage.consumed(getMassFromPpm(1e5, W), bacteria)).toBeCloseTo(capacity, 4);
      });

      it('runs at half capacity when the water holds its half-saturation constant', () => {
        const leftAtK = getMassFromPpm(stage.k, W);
        expect(stage.consumed(leftAtK + capacity / 2, bacteria)).toBeCloseTo(capacity / 2, 12);
      });
    });
  }
});

describe('nitrifierOxygenFactor', () => {
  it('runs each guild at half rate at its own half-saturation constant', () => {
    expect(nitrifierOxygenFactor('aob', nitrogenCycleDefaults.aobOxygenHalfSaturation)).toBeCloseTo(
      0.5,
      12
    );
    expect(nitrifierOxygenFactor('nob', nitrogenCycleDefaults.nobOxygenHalfSaturation)).toBeCloseTo(
      0.5,
      12
    );
  });

  it('stops both guilds dead in water with no oxygen', () => {
    expect(nitrifierOxygenFactor('aob', 0)).toBe(0);
    expect(nitrifierOxygenFactor('nob', 0)).toBe(0);
  });

  it('holds NOB back harder than AOB, and by more the less oxygen there is', () => {
    let previous = 1;
    for (const oxygen of [8, 4, 2, 1, 0.5, 0.25]) {
      const gap = nitrifierOxygenFactor('nob', oxygen) / nitrifierOxygenFactor('aob', oxygen);
      expect(gap).toBeLessThan(previous);
      previous = gap;
    }
  });
});

describe('nobProcessingRateMultiplier', () => {
  const airless = {
    ...nitrogenCycleDefaults,
    aobOxygenHalfSaturation: 0,
    nobOxygenHalfSaturation: 0,
  };

  it('is the mass a milligram of NH3 gains on its way to NO2, once the air is out of it', () => {
    expect(nobProcessingRateMultiplier(airless)).toBeCloseTo(46.01 / 17.03, 10);
  });

  it('is that mass as `chemistry.ts` states it, so the two cannot drift apart', () => {
    expect(nobProcessingRateMultiplier(airless)).toBeCloseTo(NH3_TO_NO2_MASS_RATIO, 12);
  });

  it('lifts NOB above it in real water, because their own costs them more', () => {
    expect(nobProcessingRateMultiplier()).toBeGreaterThan(NH3_TO_NO2_MASS_RATIO);
  });

  it('balances the chain at air saturation whatever the two constants are', () => {
    for (const [aobK, nobK] of [
      [0.3, 1.1],
      [0.6, 0.6],
      [1.5, 0.2],
    ]) {
      const config = {
        ...SAT,
        aobOxygenHalfSaturation: aobK,
        nobOxygenHalfSaturation: nobK,
      };
      const { nitriteProduced } = calculateAmmoniaToNitrite(1e6, W, 100, REF, AIR_SATURATED_O2, config);
      const { nitriteConsumed } = calculateNitriteToNitrate(1e6, W, 100, REF, AIR_SATURATED_O2, config);

      expect(nitriteConsumed).toBeCloseTo(nitriteProduced, 10);
    }
  });
});

describe('getPpm', () => {
  it('returns 0 for zero water', () => {
    expect(getPpm(10, 0)).toBe(0);
  });

  it('returns 0 for negative water', () => {
    expect(getPpm(10, -5)).toBe(0);
  });

  it('calculates ppm correctly', () => {
    expect(getPpm(40, 40)).toBe(1);
    expect(getPpm(80, 40)).toBe(2);
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
    expect(getMassFromPpm(1, 40)).toBe(40);
    expect(getMassFromPpm(2, 40)).toBe(80);
    expect(getMassFromPpm(0.1, 100)).toBe(10);
  });

  it('round-trips with getPpm', () => {
    const mass = 50;
    const water = 40;
    const ppm = getPpm(mass, water);
    expect(getMassFromPpm(ppm, water)).toBeCloseTo(mass, 10);
  });
});

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

  function ppmToMass(ppm: number, water: number = 40): number {
    return getMassFromPpm(ppm, water);
  }

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
      expect(nitriteEffect!.delta).toBeCloseTo(-ammoniaEffect!.delta * NH3_TO_NO2_MASS_RATIO, 10);
    });

    it('spends KH for the ammonia it oxidises', () => {
      const state = createTestState({ ammonia: ppmToMass(1.0), aob: 100 });
      const effects = nitrogenCycleSystem.update(state, DEFAULT_CONFIG);

      const ammonia = effects.find((e) => e.resource === 'ammonia' && e.source === 'nitrogen-cycle-aob');
      const kh = effects.filter((e) => e.resource === 'kh');

      expect(kh).toHaveLength(1);
      expect(kh[0]!.delta).toBeCloseTo(ammonia!.delta * CACO3_PER_NH3_NITRIFIED, 10);
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

  describe('Seeding', () => {
    const gain = (state: SimulationState, resource: 'aob' | 'nob'): number =>
      nitrogenCycleSystem
        .update(state, DEFAULT_CONFIG)
        .filter((e) => e.resource === resource && e.source === 'nitrogen-cycle-growth')
        .reduce((sum, e) => sum + e.delta, 0);

    it('seeds both guilds with nothing yet to feed them', () => {
      const state = createTestState({ aob: 0, nob: 0 });

      expect(gain(state, 'aob')).toBeCloseTo(calculateSeeding(state.resources.water), 12);
      expect(gain(state, 'nob')).toBeCloseTo(calculateSeeding(state.resources.water), 12);
    });

    it('seeds every scape alike, bare bottom included', () => {
      const onEach = (substrate: SubstrateType): number =>
        gain(createTestState({ substrate, aob: 0 }), 'aob');

      for (const substrate of ['sand', 'gravel', 'aqua_soil'] as SubstrateType[]) {
        expect(onEach(substrate)).toBe(onEach('none'));
      }
      expect(onEach('none')).toBeGreaterThan(0);
    });

    it('settles nothing onto a tank with no surface to hold it', () => {
      expect(gain(createTestState({ aob: 0, nob: 0, surface: 0 }), 'aob')).toBe(0);
      expect(gain(createTestState({ aob: 0, nob: 0, surface: 0 }), 'nob')).toBe(0);
    });

    it('grows a colony with no step at any ammonia level, from the seed alone at none', () => {
      const aob = 100;
      const state = createTestState({ aob, surface: 100000 });
      const { temperature, oxygen } = state.resources;
      const capacity = aobCapacity(aob, temperature, oxygen);
      const at = (ammonia: number): number =>
        gain(produce(state, (draft) => void (draft.resources.ammonia = ammonia)), 'aob');

      const growths = Array.from({ length: 41 }, (_, i) => at((i / 20) * capacity));
      const steps = growths.slice(1).map((g, i) => g - growths[i]);
      const span = growths[growths.length - 1] - growths[0];

      expect(growths[0]).toBeCloseTo(calculateSeeding(state.resources.water), 12);
      expect(Math.min(...steps)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...steps)).toBeLessThanOrEqual(span / 20 + 1e-12);
    });
  });

  describe('Bacteria Growth (proportional to work done)', () => {
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

    it('grows on the ammonia it oxidises', () => {
      const aob = 100;
      const state = createTestState({ ammonia: aob * nitrogenCycleDefaults.bacteriaProcessingRate, aob, surface: ROOMY });

      const effects = nitrogenCycleSystem.update(state, DEFAULT_CONFIG);
      const consumed = effects.find(
        (e) => e.resource === 'ammonia' && e.source === 'nitrogen-cycle-aob'
      )!.delta;

      expect(consumed).toBeLessThan(0);
      expect(growth('aob', state)).toBeGreaterThan(0);
    });

    it('grows harder for a heavier load', () => {
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

    it('adds only the seed to a colony with nothing to eat', () => {
      const aob = createTestState({ ammonia: 0, aob: 100, surface: ROOMY });
      const nob = createTestState({ nitrite: 0, nob: 100, surface: ROOMY });

      expect(growth('aob', aob)).toBeCloseTo(calculateSeeding(aob.resources.water), 12);
      expect(growth('nob', nob)).toBeCloseTo(calculateSeeding(nob.resources.water), 12);
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

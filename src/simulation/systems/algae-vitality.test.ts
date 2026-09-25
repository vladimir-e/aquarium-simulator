import { describe, it, expect } from 'vitest';
import {
  buildAlgaeStressors,
  buildAlgaeBenefits,
  computeAlgaePopulation,
  type AlgaeVitalityContext,
} from './algae-vitality.js';
import { algaeVitalityDefaults } from '../config/algae-vitality.js';
import { nutrientsDefaults } from '../config/nutrients.js';
import { getMassFromPpm } from '../resources/helpers.js';
import type { Plant, Resources } from '../state.js';
import type { PlantSpecies } from '../plants/species.js';

function makePlant(species: PlantSpecies, overrides: Partial<Plant> = {}): Plant {
  return {
    id: `plant_${species}`,
    species,
    size: 100,
    condition: 100,
    surplus: 0,
    ...overrides,
  };
}

function makeResources(overrides: Partial<Resources> = {}): Resources {
  return {
    water: 100,
    temperature: 25,
    surface: 1000,
    flow: 100,
    light: 30,
    aeration: true,
    food: 0,
    waste: 0,
    ammonia: 0,
    nitrite: 0,
    nitrate: getMassFromPpm(nutrientsDefaults.optimalNitratePpm, 100),
    phosphate: getMassFromPpm(nutrientsDefaults.optimalPhosphatePpm, 100),
    potassium: getMassFromPpm(7, 100),
    iron: getMassFromPpm(0.15, 100),
    oxygen: 8.0,
    co2: 20.0,
    kh: 0,
    aob: 0,
    nob: 0,
    ...overrides,
  };
}

function ctx(overrides: Partial<AlgaeVitalityContext> = {}): AlgaeVitalityContext {
  return {
    plants: [],
    resources: makeResources(),
    algaeConfig: algaeVitalityDefaults,
    nutrientsConfig: nutrientsDefaults,
    ...overrides,
  };
}

describe('buildAlgaeStressors', () => {
  it('returns plant_suppression key with zero amount when no plants', () => {
    const stressors = buildAlgaeStressors(ctx());
    const suppression = stressors.find((s) => s.key === 'plant_suppression');
    expect(suppression).toBeDefined();
    expect(suppression?.amount).toBe(0);
  });

  it('does not fire suppression below the threshold', () => {
    const plants = [makePlant('java_fern', { size: 50, condition: 100 })];
    const stressors = buildAlgaeStressors(ctx({ plants }));
    expect(stressors.find((s) => s.key === 'plant_suppression')?.amount).toBe(0);
  });

  it('fires suppression once plant power exceeds threshold', () => {
    const plants = [
      makePlant('java_fern', { size: 100, condition: 100 }),
      makePlant('anubias', { size: 100, condition: 100 }),
      makePlant('amazon_sword', { size: 100, condition: 100 }),
    ];
    const stressors = buildAlgaeStressors(ctx({ plants }));
    const suppression = stressors.find((s) => s.key === 'plant_suppression');
    expect(suppression?.amount).toBeGreaterThan(0);
    expect(suppression?.amount).toBeCloseTo(
      algaeVitalityDefaults.plantSuppressionSeverity *
        (3.0 - algaeVitalityDefaults.suppressionThreshold),
      6
    );
  });

  it('weights plant power by health — sick plants do not suppress', () => {
    const healthy = [makePlant('amazon_sword', { size: 200, condition: 100 })];
    const dying = [makePlant('amazon_sword', { size: 200, condition: 0 })];

    const healthyAmount = buildAlgaeStressors(ctx({ plants: healthy })).find(
      (s) => s.key === 'plant_suppression'
    )?.amount;
    const dyingAmount = buildAlgaeStressors(ctx({ plants: dying })).find(
      (s) => s.key === 'plant_suppression'
    )?.amount;

    expect(healthyAmount).toBeGreaterThan(0);
    expect(dyingAmount).toBe(0);
  });
});

describe('buildAlgaeBenefits', () => {
  it('emits all four benefit keys every tick (zero when inactive)', () => {
    const benefits = buildAlgaeBenefits(ctx());
    const keys = benefits.map((b) => b.key);
    expect(keys).toContain('excess_light');
    expect(keys).toContain('excess_nutrients');
    expect(keys).toContain('nutrient_deficiency');
    expect(keys).toContain('low_plant_power');
  });

  it('fires excess_light only above the substrate-PAR threshold', () => {
    const lowLight = ctx({ resources: makeResources({ light: 30 }) });
    expect(buildAlgaeBenefits(lowLight).find((b) => b.key === 'excess_light')?.amount).toBe(0);

    const highLight = ctx({ resources: makeResources({ light: 80 }) });
    expect(
      buildAlgaeBenefits(highLight).find((b) => b.key === 'excess_light')?.amount
    ).toBeGreaterThan(0);
  });

  it('caps excess_light at the configured peak', () => {
    const blasted = ctx({ resources: makeResources({ light: 1000 }) });
    const amount = buildAlgaeBenefits(blasted).find((b) => b.key === 'excess_light')?.amount;
    expect(amount).toBe(algaeVitalityDefaults.excessLightPeak);
  });

  it('fires excess_nutrients when NO3 climbs above optimum', () => {
    const overdosed = ctx({
      resources: makeResources({
        nitrate: getMassFromPpm(nutrientsDefaults.optimalNitratePpm * 3, 100),
      }),
    });
    expect(
      buildAlgaeBenefits(overdosed).find((b) => b.key === 'excess_nutrients')?.amount
    ).toBeGreaterThan(0);
  });

  it('does not fire excess_nutrients when both NO3 and PO4 sit at optimum', () => {
    expect(buildAlgaeBenefits(ctx()).find((b) => b.key === 'excess_nutrients')?.amount).toBe(0);
  });

  it('fires nutrient_deficiency when nutrients fall below optimum', () => {
    const starved = ctx({
      resources: makeResources({
        nitrate: 0,
        phosphate: 0,
      }),
    });
    expect(
      buildAlgaeBenefits(starved).find((b) => b.key === 'nutrient_deficiency')?.amount
    ).toBeGreaterThan(0);
  });

  it('fires low_plant_power when plant power falls below weakness threshold', () => {
    const benefits = buildAlgaeBenefits(ctx({ plants: [] }));
    expect(benefits.find((b) => b.key === 'low_plant_power')?.amount).toBeGreaterThan(0);
  });

  it('does not fire low_plant_power when plant power sits in the deadband', () => {
    const plants = [makePlant('java_fern', { size: 50, condition: 100 })];
    const benefits = buildAlgaeBenefits(ctx({ plants }));
    expect(benefits.find((b) => b.key === 'low_plant_power')?.amount).toBe(0);
  });
});

describe('buildAlgaeBenefits — pathological config guards', () => {
  it('handles waterVolume = 0 without dividing by zero', () => {
    const benefits = buildAlgaeBenefits(ctx({ resources: makeResources({ water: 0 }) }));
    expect(benefits.find((b) => b.key === 'excess_nutrients')?.amount).toBe(0);
  });

  it('handles zero plant optimum without firing nutrient channels', () => {
    const config = {
      ...nutrientsDefaults,
      optimalNitratePpm: 0,
      optimalPhosphatePpm: 0,
    };
    const benefits = buildAlgaeBenefits(ctx({ nutrientsConfig: config }));
    expect(benefits.find((b) => b.key === 'excess_nutrients')?.amount).toBe(0);
    expect(benefits.find((b) => b.key === 'nutrient_deficiency')?.amount).toBe(0);
  });
});

describe('computeAlgaePopulation (aggregate)', () => {
  it('pure-light tank with no plants and no dosing produces a positive net', () => {
    const result = computeAlgaePopulation(
      ctx({
        plants: [],
        resources: makeResources({ light: 120, nitrate: 0, phosphate: 0 }),
      })
    );
    expect(result.net).toBeGreaterThan(0);
    expect(result.breakdown.benefitRate).toBeGreaterThan(0);
    expect(result.breakdown.damageRate).toBe(0);
  });

  it('overdosed tank with weak plants — nutrients dominate, net positive', () => {
    const plants = [makePlant('amazon_sword', { size: 100, condition: 0 })];
    const result = computeAlgaePopulation(
      ctx({
        plants,
        resources: makeResources({
          nitrate: getMassFromPpm(nutrientsDefaults.optimalNitratePpm * 3, 100),
        }),
      })
    );
    expect(result.net).toBeGreaterThan(0);
  });

  it('applies hardiness centrally to stressors but not benefits', () => {
    const plants = [
      makePlant('amazon_sword', { size: 100, condition: 100 }),
      makePlant('monte_carlo', { size: 100, condition: 100 }),
      makePlant('java_fern', { size: 100, condition: 100 }),
    ];
    const baseConfig = { ...algaeVitalityDefaults, hardiness: 0 };
    const hardyConfig = { ...algaeVitalityDefaults, hardiness: 0.5 };

    const baseResult = computeAlgaePopulation(ctx({ plants, algaeConfig: baseConfig }));
    const hardyResult = computeAlgaePopulation(ctx({ plants, algaeConfig: hardyConfig }));

    expect(hardyResult.breakdown.damageRate).toBeCloseTo(baseResult.breakdown.damageRate * 0.5, 8);
    expect(hardyResult.breakdown.benefitRate).toBeCloseTo(baseResult.breakdown.benefitRate, 8);
  });

  it('clamps hardiness to [0, 1] for pathological config values', () => {
    const plants = [
      makePlant('amazon_sword', { size: 100, condition: 100 }),
      makePlant('monte_carlo', { size: 100, condition: 100 }),
    ];
    const overHardy = { ...algaeVitalityDefaults, hardiness: 5 };
    const result = computeAlgaePopulation(ctx({ plants, algaeConfig: overHardy }));
    expect(result.breakdown.damageRate).toBe(0);
  });
});

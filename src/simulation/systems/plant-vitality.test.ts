import { describe, it, expect } from 'vitest';
import {
  buildPlantStressors,
  buildPlantBenefits,
  computePlantVitality,
  type PlantVitalityContext,
} from './plant-vitality.js';
import { calculateNutrientSufficiency } from './nutrients.js';
import { plantsDefaults } from '../config/plants.js';
import { nutrientsDefaults } from '../config/nutrients.js';
import { getMassFromPpm } from '../resources/helpers.js';
import type { Plant, PlantSpecies, Resources } from '../state.js';

function makePlant(species: PlantSpecies, overrides: Partial<Plant> = {}): Plant {
  return {
    id: `plant_${species}`,
    species,
    size: 50,
    condition: 100,
    ...overrides,
  };
}

function makeResources(overrides: Partial<Resources> = {}): Resources {
  return {
    water: 100,
    temperature: 25,
    surface: 1000,
    flow: 100,
    light: 30, // Mid-range for most species
    aeration: true,
    food: 0,
    waste: 0,
    algae: 0,
    ammonia: 0,
    nitrite: 0,
    nitrate: getMassFromPpm(15, 100), // Mid-range
    phosphate: getMassFromPpm(1, 100),
    potassium: getMassFromPpm(7, 100),
    iron: getMassFromPpm(0.15, 100),
    oxygen: 8.0,
    co2: 20.0, // Mid-range
    ph: 6.8,
    aob: 0,
    nob: 0,
    ...overrides,
  };
}

function ctx(plant: Plant, resources: Resources): PlantVitalityContext {
  // Tests compute sufficiency the same way the orchestrator does so the
  // vitality math sees the value the production path would supply.
  const nutrientSufficiency = calculateNutrientSufficiency(
    resources,
    resources.water,
    plant.species,
    nutrientsDefaults
  );
  return {
    plant,
    resources,
    waterVolume: resources.water,
    plantsConfig: plantsDefaults,
    nutrientSufficiency,
  };
}

describe('buildPlantStressors', () => {
  it('returns zero damage for an Anubias in good conditions', () => {
    const plant = makePlant('anubias');
    const resources = makeResources();
    const stressors = buildPlantStressors(ctx(plant, resources));
    for (const s of stressors) {
      expect(s.amount).toBe(0);
    }
  });

  it('flags low CO2 for high-tech species', () => {
    // MC tolerableCO2 = [10, 40]. CO2 = 5 → gap 5 mg/L below.
    const plant = makePlant('monte_carlo');
    const resources = makeResources({ co2: 5 });
    const stressors = buildPlantStressors(ctx(plant, resources));
    const co2 = stressors.find((s) => s.key === 'co2');
    expect(co2?.amount).toBeCloseTo(plantsDefaults.co2InsufficientSeverity * 5, 6);
  });

  it('does not flag low CO2 for low-tech species at the same CO2', () => {
    // Anubias tolerableCO2 = [1, 40]. CO2 = 5 → in range.
    const plant = makePlant('anubias');
    const resources = makeResources({ co2: 5 });
    const stressors = buildPlantStressors(ctx(plant, resources));
    const co2 = stressors.find((s) => s.key === 'co2');
    expect(co2?.amount).toBe(0);
  });

  it('flags low light for high-light species', () => {
    // MC tolerableLight = [15, 150]. Light = 5 → gap 10 W below.
    const plant = makePlant('monte_carlo');
    const resources = makeResources({ light: 5 });
    const stressors = buildPlantStressors(ctx(plant, resources));
    const light = stressors.find((s) => s.key === 'light');
    expect(light?.amount).toBeCloseTo(plantsDefaults.lightInsufficientSeverity * 10, 6);
    expect(light?.label).toContain('low');
  });

  it('flags excessive light for shade species', () => {
    // Anubias tolerableLight = [3, 70]. Light = 100 → gap 30 W above.
    const plant = makePlant('anubias');
    const resources = makeResources({ light: 100 });
    const stressors = buildPlantStressors(ctx(plant, resources));
    const light = stressors.find((s) => s.key === 'light');
    expect(light?.amount).toBeCloseTo(plantsDefaults.lightExcessiveSeverity * 30, 6);
    expect(light?.label).toContain('high');
  });

  it('flags temperature below tolerable range', () => {
    const plant = makePlant('amazon_sword'); // tolerableTemp [20, 28]
    const resources = makeResources({ temperature: 16 });
    const stressors = buildPlantStressors(ctx(plant, resources));
    const temp = stressors.find((s) => s.key === 'temperature');
    expect(temp?.amount).toBeCloseTo(plantsDefaults.temperatureStressSeverity * 4, 6);
  });

  it('flags pH outside tolerable range', () => {
    const plant = makePlant('monte_carlo'); // tolerablePH [6.0, 7.5]
    const resources = makeResources({ ph: 8.5 });
    const stressors = buildPlantStressors(ctx(plant, resources));
    const ph = stressors.find((s) => s.key === 'ph');
    expect(ph?.amount).toBeCloseTo(plantsDefaults.phStressSeverity * 1, 6);
  });

  it('flags nutrient deficiency proportional to (1 - sufficiency)', () => {
    // MC needs all four nutrients; with zero K, sufficiency goes to 0.
    const plant = makePlant('monte_carlo');
    const resources = makeResources({
      potassium: 0,
    });
    const stressors = buildPlantStressors(ctx(plant, resources));
    const nut = stressors.find((s) => s.key === 'nutrients');
    expect(nut?.amount).toBeCloseTo(plantsDefaults.nutrientDeficiencySeverity * 1, 6);
  });

  it('flags nutrient toxicity only above the NO3 threshold', () => {
    const plant = makePlant('amazon_sword');
    const safe = makeResources({ nitrate: getMassFromPpm(50, 100) });
    const safeStressors = buildPlantStressors(ctx(plant, safe));
    expect(safeStressors.find((s) => s.key === 'nutrientToxicity')?.amount).toBe(0);

    const overdosed = makeResources({ nitrate: getMassFromPpm(150, 100) });
    const overStressors = buildPlantStressors(ctx(plant, overdosed));
    const tox = overStressors.find((s) => s.key === 'nutrientToxicity');
    // 150 ppm − 100 threshold = 50 ppm above
    expect(tox?.amount).toBeCloseTo(plantsDefaults.nutrientToxicitySeverity * 50, 6);
  });

  it('flags algae shading only above threshold', () => {
    const plant = makePlant('amazon_sword');
    const safe = makeResources({ algae: 30 });
    expect(buildPlantStressors(ctx(plant, safe)).find((s) => s.key === 'algae')?.amount).toBe(0);

    const heavy = makeResources({ algae: 80 });
    const heavyStressors = buildPlantStressors(ctx(plant, heavy));
    const shading = heavyStressors.find((s) => s.key === 'algae');
    expect(shading?.amount).toBeCloseTo(plantsDefaults.algaeShadingSeverity * 30, 6);
  });
});

describe('buildPlantBenefits', () => {
  it('emits all five benefit factors at full peak in ideal conditions', () => {
    const plant = makePlant('anubias');
    const resources = makeResources({
      light: 30, // in anubias range [3, 70]
      co2: 5, // in anubias range [1, 40]
      temperature: 25, // in [18, 30]
      ph: 7.0, // in [6.0, 8.0]
    });
    const benefits = buildPlantBenefits(ctx(plant, resources));
    const keys = benefits.map((b) => b.key).sort();
    expect(keys).toEqual(['co2', 'light', 'nutrients', 'ph', 'temperature']);
    // Light, CO2, temp, pH all at peak; nutrients = peak × sufficiency.
    expect(benefits.find((b) => b.key === 'light')?.amount).toBe(plantsDefaults.lightBenefitPeak);
    expect(benefits.find((b) => b.key === 'co2')?.amount).toBe(plantsDefaults.co2BenefitPeak);
    expect(benefits.find((b) => b.key === 'temperature')?.amount).toBe(
      plantsDefaults.temperatureBenefitPeak
    );
    expect(benefits.find((b) => b.key === 'ph')?.amount).toBe(plantsDefaults.phBenefitPeak);
    // Anubias is low-demand → only NO3 required, with NO3 well-fed
    // sufficiency = 1.0 → full peak.
    expect(benefits.find((b) => b.key === 'nutrients')?.amount).toBe(
      plantsDefaults.nutrientBenefitPeak
    );
  });

  it('drops the CO2 benefit to zero when CO2 leaves the species range', () => {
    const plant = makePlant('monte_carlo');
    const resources = makeResources({ co2: 5 });
    const benefits = buildPlantBenefits(ctx(plant, resources));
    expect(benefits.find((b) => b.key === 'co2')?.amount).toBe(0);
  });
});

describe('computePlantVitality', () => {
  it('Anubias in ideal conditions heals when below 100 condition', () => {
    const plant = makePlant('anubias', { condition: 80 });
    const resources = makeResources();
    const result = computePlantVitality(ctx(plant, resources));
    expect(result.newCondition).toBeGreaterThan(80);
    expect(result.surplus).toBe(0); // no surplus while sub-100
  });

  it('Monte Carlo declines when CO2 falls below tolerable', () => {
    const plant = makePlant('monte_carlo', { condition: 100 });
    const resources = makeResources({ co2: 2 }); // gap 8 mg/L below tolerable [10, 40]
    const result = computePlantVitality(ctx(plant, resources));
    // Damage outweighs benefit → newCondition drops below 100.
    expect(result.newCondition).toBeLessThan(100);
    expect(result.surplus).toBe(0);
  });

  it('Anubias holds at 100 even with low CO2 (low-tech tolerance)', () => {
    const plant = makePlant('anubias', { condition: 100 });
    const resources = makeResources({ co2: 2 }); // 2 < 1 lower bound? No, 2 > 1
    const result = computePlantVitality(ctx(plant, resources));
    expect(result.newCondition).toBe(100);
    expect(result.surplus).toBeGreaterThan(0);
  });

  it('produces surplus only at full condition', () => {
    // Healthy plant in ideal conditions: net positive, condition 100,
    // surplus > 0.
    const plant = makePlant('java_fern', { condition: 100 });
    const resources = makeResources();
    const result = computePlantVitality(ctx(plant, resources));
    expect(result.newCondition).toBe(100);
    expect(result.surplus).toBeGreaterThan(0);
  });

  it('hardier species declines slower under same stress', () => {
    // Anubias hardiness 0.75, MC hardiness 0.3. Same harsh CO2 = 2.
    // Both species' tolerableCO2 lower bound differs (Anubias 1, MC 10),
    // so use a stress that hits both: pH 8.5 for Anubias [6.0, 8.0]
    // and MC [6.0, 7.5] — both above range. Anubias at gap 0.5,
    // MC at gap 1.0.
    const anubias = makePlant('anubias', { condition: 100 });
    const monte = makePlant('monte_carlo', { condition: 100 });
    const harshPh = makeResources({ ph: 8.5 });
    const aResult = computePlantVitality(ctx(anubias, harshPh));
    const mResult = computePlantVitality(ctx(monte, harshPh));
    // Anubias should fare better — higher condition retained.
    expect(aResult.newCondition).toBeGreaterThan(mResult.newCondition);
  });

  it('gross NO3 overdose triggers visible damage on plant', () => {
    const plant = makePlant('amazon_sword', { condition: 100 });
    const resources = makeResources({ nitrate: getMassFromPpm(300, 100) });
    const result = computePlantVitality(ctx(plant, resources));
    const tox = result.breakdown.stressors.find((s) => s.key === 'nutrientToxicity');
    expect(tox).toBeDefined();
    expect(tox!.amount).toBeGreaterThan(0);
    // Net should be negative (damage exceeds benefit).
    expect(result.breakdown.net).toBeLessThan(0);
  });

  describe('CO2 stress only fires during photoperiod', () => {
    // Real planted tanks see overnight CO2 drops to atmospheric
    // levels; plants don't draw CO2 at night so they don't suffer.
    // Modelling otherwise would kill MC from the natural diurnal
    // CO2 swing in any well-run high-tech tank.

    it('low CO2 with lights off → no CO2 stress', () => {
      const plant = makePlant('monte_carlo');
      const resources = makeResources({ light: 0, co2: 4 });
      const stressors = buildPlantStressors(ctx(plant, resources));
      const co2 = stressors.find((s) => s.key === 'co2');
      expect(co2?.amount).toBe(0);
    });

    it('low CO2 with lights on → CO2 stress active', () => {
      const plant = makePlant('monte_carlo');
      const resources = makeResources({ light: 30, co2: 4 });
      const stressors = buildPlantStressors(ctx(plant, resources));
      const co2 = stressors.find((s) => s.key === 'co2');
      expect(co2?.amount).toBeGreaterThan(0);
    });

    it('low light with lights off → no light insufficient stress (plant is dormant)', () => {
      const plant = makePlant('monte_carlo');
      const resources = makeResources({ light: 0 });
      const stressors = buildPlantStressors(ctx(plant, resources));
      const light = stressors.find((s) => s.key === 'light');
      expect(light?.amount).toBe(0);
    });
  });
});

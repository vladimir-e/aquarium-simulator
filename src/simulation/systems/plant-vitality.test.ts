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
import type { Plant, Resources } from '../state.js';
import {
  getSaturationIrradiance,
  PLANT_SPECIES_DATA,
  type PlantSpecies,
} from '../plants/species.js';
import { lightSaturationFactor } from '../core/kinetics.js';

function makePlant(species: PlantSpecies, overrides: Partial<Plant> = {}): Plant {
  return {
    id: `plant_${species}`,
    species,
    size: 50,
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
    light: 40, // Mid-range PAR for all five species
    aeration: true,
    food: 0,
    waste: 0,
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

function ctx(
  plant: Plant,
  resources: Resources,
  algaeMass: number = 0,
  plantsConfig = plantsDefaults
): PlantVitalityContext {
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
    plantsConfig,
    nutrientSufficiency,
    algaeMass,
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
    // MC tolerableLight = [30, 200]. Light = 5 → gap 25 PAR below.
    const plant = makePlant('monte_carlo');
    const resources = makeResources({ light: 5 });
    const stressors = buildPlantStressors(ctx(plant, resources));
    const light = stressors.find((s) => s.key === 'light');
    expect(light?.amount).toBeCloseTo(plantsDefaults.lightInsufficientSeverity * 25, 6);
    expect(light?.label).toContain('low');
  });

  it('flags excessive light for shade species', () => {
    // Anubias tolerableLight = [8, 70]. Light = 100 → gap 30 PAR above.
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
    const resources = makeResources();
    // Threshold defaults to 30 — at exactly 30 the stressor is still
    // zero (gap is 0), and below 30 it's also zero.
    expect(
      buildPlantStressors(ctx(plant, resources, 30)).find((s) => s.key === 'algae')?.amount
    ).toBe(0);

    // 80 - 30 = 50 above threshold.
    const heavyStressors = buildPlantStressors(ctx(plant, resources, 80));
    const shading = heavyStressors.find((s) => s.key === 'algae');
    expect(shading?.amount).toBeCloseTo(plantsDefaults.algaeShadingSeverity * 50, 6);
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
    // CO2, temp, pH at peak; nutrients = peak × sufficiency; light is a rate on
    // the same curve photosynthesis runs, so it reaches the peak only
    // asymptotically — 30 PAR is 1.9 Ik for an anubias, which is most of it.
    expect(benefits.find((b) => b.key === 'light')?.amount).toBeCloseTo(
      plantsDefaults.lightBenefitPeak *
        lightSaturationFactor(30, getSaturationIrradiance('anubias')),
      12
    );
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

  describe('the light benefit is income, not a comfort band', () => {
    const lightBenefit = (species: PlantSpecies, light: number): number => {
      const benefits = buildPlantBenefits(ctx(makePlant(species), makeResources({ light })));
      return benefits.find((b) => b.key === 'light')?.amount ?? 0;
    };

    it('pays a brighter plant more than a dim one, both inside the band', () => {
      // Anubias tolerates 8–70 PAR, so both readings used to earn the same flat
      // award — which is why photoperiod alone decided growth.
      expect(lightBenefit('anubias', 60)).toBeGreaterThan(lightBenefit('anubias', 12));
    });

    it('climbs with PAR the whole way and never passes the peak', () => {
      let previous = 0;
      for (const par of [1, 5, 15, 30, 70, 150, 400]) {
        const benefit = lightBenefit('anubias', par);
        expect(benefit).toBeGreaterThan(previous);
        expect(benefit).toBeLessThanOrEqual(plantsDefaults.lightBenefitPeak);
        previous = benefit;
      }
    });

    it('has no cliff at the top of the band', () => {
      // Anubias burns above 70 PAR, and used to lose its entire light income
      // there on top of the excess stressor. The two channels are separate now:
      // crossing costs a plant damage, not its earnings.
      const [, hi] = PLANT_SPECIES_DATA.anubias.tolerableLight;
      const under = lightBenefit('anubias', hi - 0.01);
      const over = lightBenefit('anubias', hi + 0.01);

      expect(over).toBeGreaterThan(under);
      expect(over - under).toBeLessThan(1e-4);
    });

    it('pays nothing in the dark', () => {
      expect(lightBenefit('anubias', 0)).toBe(0);
    });

    it('pays each species on its own Ik, so a shade plant is nearer its ceiling', () => {
      const species = Object.keys(PLANT_SPECIES_DATA) as PlantSpecies[];

      for (const one of species) {
        for (const other of species) {
          if (getSaturationIrradiance(one) < getSaturationIrradiance(other)) {
            expect(lightBenefit(one, 50)).toBeGreaterThan(lightBenefit(other, 50));
          }
        }
      }
    });

    it('reads Ik off the tuned factor rather than a constant of its own', () => {
      // The knob has to reach this channel: raising it moves a species'
      // saturation up, so one fixture buys a smaller share of the peak.
      const earned = (saturationIrradianceFactor: number): number => {
        const benefits = buildPlantBenefits(
          ctx(makePlant('anubias'), makeResources({ light: 20 }), 0, {
            ...plantsDefaults,
            saturationIrradianceFactor,
          })
        );
        return benefits.find((b) => b.key === 'light')?.amount ?? 0;
      };

      expect(earned(4)).toBeLessThan(earned(2));
      expect(earned(2)).toBeLessThan(earned(1));
      // A species that saturates at no light at all is one nothing holds back.
      expect(earned(0)).toBe(plantsDefaults.lightBenefitPeak);
    });
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

  it('never writes a negative surplus when the cap is negative', () => {
    // A negative surplusCap floors to 0 rather than banking a negative
    // surplus, which the persisted `surplus >= 0` schema would reject.
    const resources = makeResources(); // light > 0 → accrual on
    const negCap = { ...plantsDefaults, surplusCap: -50 };
    const accruing = computePlantVitality({
      ...ctx(makePlant('java_fern', { condition: 100, surplus: 0 }), resources),
      plantsConfig: negCap,
    });
    expect(accruing.surplus).toBe(0);
    const buffered = computePlantVitality({
      ...ctx(makePlant('java_fern', { condition: 100, surplus: 20 }), resources),
      plantsConfig: negCap,
    });
    expect(buffered.surplus).toBe(0);
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

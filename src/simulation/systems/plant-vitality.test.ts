import { describe, it, expect } from 'vitest';
import {
  buildPlantStressors,
  buildPlantBenefits,
  computePlantVitality,
  plantHealingRate,
  type PlantVitalityContext,
} from './plant-vitality.js';
import { calculateNutrientSufficiency } from './nutrients.js';
import { getRespirationTemperatureFactor } from './respiration.js';
import { toleranceFactor } from '../livestock/tolerance.js';
import { calculateCo2Factor } from './photosynthesis.js';
import { MAX_SUFFICIENCY_EDGE, plantsDefaults } from '../config/plants.js';
import { nutrientsDefaults } from '../config/nutrients.js';
import { getMassFromPpm } from '../resources/helpers.js';
import type { Plant, Resources } from '../state.js';
import { lightAtHeight, type CanopyLight } from '../plants/canopy.js';
import type { VitalityFactor } from './vitality.js';
import { withPh, type ResourceOverrides } from '../tests/resources.js';
import { getGhMass } from '../resources/helpers.js';
import {
  CARE_SHEET_PHOTOPERIOD,
  dailyLightEdge,
  getSaturationIrradiance,
  PLANT_SPECIES_DATA,
  type PlantSpecies,
} from '../plants/species.js';
import { lightSaturationFactor } from '../core/kinetics.js';
import { plantRecord } from '../tests/plant.js';
import { VIGOUR_SPAN } from '../plants/create-plant.js';

function makePlant(species: PlantSpecies, overrides: Partial<Plant> = {}): Plant {
  return plantRecord({
    id: `plant_${species}`,
    species,
    size: 50,
    condition: 100,
    surplus: 0,
    ...overrides,
  });
}

/** A day of `hours` lit at `par`, the rest dark. */
function litDay(par: number, hours: number): number[] {
  return Array.from({ length: 24 }, (_, hour) => (hour < hours ? par : 0));
}

function makeResources(overrides: ResourceOverrides = {}): Resources {
  return withPh({
    water: 100,
    temperature: 25,
    surface: 1000,
    flow: 100,
    light: 40,
    lightByHour: litDay(40, 8),
    aeration: true,
    food: 0,
    waste: 0,
    ammonia: 0,
    nitrite: 0,
    nitrate: getMassFromPpm(15, 100),
    phosphate: getMassFromPpm(1, 100),
    potassium: getMassFromPpm(7, 100),
    iron: getMassFromPpm(0.15, 100),
    oxygen: 8.0,
    co2: 20.0,
    kh: 0,
    gh: getGhMass(6, 100),
    aob: 0,
    nob: 0,
  }, { ph: 6.8, ...overrides });
}

function ctx(
  plant: Plant,
  resources: Resources,
  algaeMass: number = 0,
  plantsConfig = plantsDefaults,
  canopy: CanopyLight = { leaf: 1, top: 1 }
): PlantVitalityContext {
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
    light: lightAtHeight(plant, canopy, resources, 50),
  };
}

describe('buildPlantStressors', () => {
  const amount = (
    species: PlantSpecies,
    key: string,
    resources: ResourceOverrides,
    algaeMass = 0
  ): number =>
    buildPlantStressors(ctx(makePlant(species), makeResources(resources), algaeMass)).find(
      (s) => s.key === key
    )?.amount ?? 0;

  it('charges a fed Anubias in good conditions nothing', () => {
    const plant = makePlant('anubias', { surplus: plantsDefaults.surplusCap });
    const fed = { ...ctx(plant, makeResources()), nutrientSufficiency: plantsDefaults.sufficiencyEdge };
    for (const s of buildPlantStressors(fed)) expect(s.amount).toBe(0);
  });

  it.each<[string, PlantSpecies, (gap: number) => ResourceOverrides]>([
    ['light', 'anubias', (gap): Partial<Resources> => ({ light: PLANT_SPECIES_DATA.anubias.tolerableLight[1] + gap })],
    ['temperature', 'amazon_sword', (gap): Partial<Resources> => ({ temperature: PLANT_SPECIES_DATA.amazon_sword.tolerableTemp[0] - gap })],
    ['ph', 'monte_carlo', (gap): ResourceOverrides => ({ ph: PLANT_SPECIES_DATA.monte_carlo.tolerablePH[1] + gap / 4 })],
    ['gh', 'amazon_sword', (gap): Partial<Resources> => ({ gh: getGhMass(PLANT_SPECIES_DATA.amazon_sword.tolerableGH[1] + gap, 100) })],
  ])('charges %s on %s in proportion to the gap outside its range', (key, species, at) => {
    expect(amount(species, key, at(0))).toBe(0);
    const one = amount(species, key, at(1));
    expect(one).toBeGreaterThan(0);
    expect(amount(species, key, at(2))).toBeCloseTo(2 * one, 10);
  });

  it.each([plantsDefaults.sufficiencyEdge, MAX_SUFFICIENCY_EDGE])(
    'charges deficiency from nothing at a sufficiency edge of %s, linear under it',
    (edge) => {
      const plantsConfig = { ...plantsDefaults, sufficiencyEdge: edge };
      const at = (nutrientSufficiency: number): number =>
        buildPlantStressors({
          ...ctx(makePlant('monte_carlo'), makeResources(), 0, plantsConfig),
          nutrientSufficiency,
        }).find((s) => s.key === 'nutrients')!.amount;

      expect(at(1)).toBe(0);
      expect(at(edge)).toBe(0);
      expect(at(edge / 2)).toBeCloseTo(at(0) / 2, 12);
      expect(at(edge / 4)).toBeCloseTo((3 * at(0)) / 4, 12);
    }
  );

  it('charges a gone nutrient at full severity on the light curve, and nothing in the dark', () => {
    for (const light of [0, 20, 60, 400]) {
      expect(amount('monte_carlo', 'nutrients', { potassium: 0, light })).toBeCloseTo(
        lightSaturationFactor(light, getSaturationIrradiance('monte_carlo', plantsDefaults)) *
          plantsDefaults.nutrientDeficiencySeverity *
          (1 - PLANT_SPECIES_DATA.monte_carlo.hardiness),
        10
      );
    }
    expect(amount('monte_carlo', 'nutrients', { potassium: 0, light: 0 })).toBe(0);
  });

  describe('nitrate, on log dose past an edge hardiness carries out', () => {
    const at = (species: PlantSpecies, ppm: number): number =>
      amount(species, 'nitrate', { nitrate: getMassFromPpm(ppm, 100) });
    const edge = (species: PlantSpecies): number =>
      plantsDefaults.nitrateEdge * toleranceFactor(PLANT_SPECIES_DATA[species].hardiness);

    it('is zero up to the edge and adds the same for every doubling past it', () => {
      const e = edge('amazon_sword');
      expect(at('amazon_sword', e)).toBe(0);
      expect(at('amazon_sword', 2 * e)).toBeCloseTo(plantsDefaults.nitrateStressSeverity * Math.LN2, 10);
      expect(at('amazon_sword', 4 * e) - at('amazon_sword', 2 * e)).toBeCloseTo(at('amazon_sword', 2 * e), 10);
    });

    it('moves the edge with hardiness rather than scaling the harm', () => {
      expect(edge('anubias')).toBeGreaterThan(edge('monte_carlo'));
      expect(at('anubias', 2 * edge('anubias'))).toBeCloseTo(at('monte_carlo', 2 * edge('monte_carlo')), 10);
    });
  });

  it('charges algae shading only above the threshold, linear past it', () => {
    const at = (algae: number): number => amount('amazon_sword', 'algae', {}, algae);
    const threshold = plantsDefaults.algaeShadingThreshold;

    expect(at(threshold)).toBe(0);
    expect(at(threshold + 20)).toBeCloseTo(2 * at(threshold + 10), 10);
    expect(at(threshold + 10)).toBeGreaterThan(0);
  });

  describe('light starvation, on the daily light integral', () => {
    const starved = (species: PlantSpecies, resources: ResourceOverrides): number =>
      amount(species, 'lightStarvation', resources);
    const lo = PLANT_SPECIES_DATA.monte_carlo.tolerableLight[0];

    it('costs nothing at or above the species edge, lamps on or off', () => {
      for (const light of [0, 60]) {
        expect(starved('monte_carlo', { light, lightByHour: litDay(lo, CARE_SHEET_PHOTOPERIOD) })).toBe(0);
        expect(starved('monte_carlo', { light, lightByHour: litDay(3 * lo, 12) })).toBe(0);
      }
    });

    it('rises linearly with the shortfall below the edge, to full severity in a dark day', () => {
      const dark = starved('monte_carlo', { lightByHour: litDay(0, 0) });
      const half = starved('monte_carlo', { lightByHour: litDay(lo, CARE_SHEET_PHOTOPERIOD / 2) });
      const factor = getRespirationTemperatureFactor(25, plantsDefaults) * (1 - PLANT_SPECIES_DATA.monte_carlo.hardiness);

      expect(dark).toBeCloseTo(plantsDefaults.lightStarvationSeverity * factor, 12);
      expect(half).toBeCloseTo(dark / 2, 12);
    });

    it('reads the day, not the hour: a lit hour inside a dark day starves, a dark hour of a good day does not', () => {
      expect(starved('monte_carlo', { light: 200, lightByHour: litDay(0, 0) })).toBeGreaterThan(0);
      expect(starved('monte_carlo', { light: 0, lightByHour: litDay(90, 12) })).toBe(0);
    });

    it('runs on respiration Q10', () => {
      const dark = (temperature: number): number =>
        starved('monte_carlo', { temperature, lightByHour: litDay(0, 0) });
      expect(dark(plantsDefaults.respirationReferenceTemp + 10)).toBeCloseTo(
        dark(plantsDefaults.respirationReferenceTemp) * plantsDefaults.respirationQ10,
        12
      );
    });

    it('asks a sun species for more light than a shade species', () => {
      expect(dailyLightEdge('monte_carlo')).toBeGreaterThan(dailyLightEdge('anubias'));
      const dim = litDay(20, CARE_SHEET_PHOTOPERIOD);
      expect(starved('anubias', { lightByHour: dim })).toBe(0);
      expect(starved('monte_carlo', { lightByHour: dim })).toBeGreaterThan(0);
    });
  });

  it('charges no damage for low CO2: carbon is income, not a threshold', () => {
    const stressors = buildPlantStressors(ctx(makePlant('monte_carlo'), makeResources({ co2: 1 })));
    expect(stressors.some((s) => s.key === 'co2')).toBe(false);
  });
});

describe('buildPlantBenefits', () => {
  const budget = (
    species: PlantSpecies,
    resources: Resources,
    plantsConfig = plantsDefaults
  ): number =>
    buildPlantBenefits(ctx(makePlant(species), resources, 0, plantsConfig)).reduce(
      (sum, b) => sum + b.amount,
      0
    );

  const PEAK: Record<string, number> = {
    co2: plantsDefaults.co2BenefitPeak,
    temperature: plantsDefaults.temperatureBenefitPeak,
    ph: plantsDefaults.phBenefitPeak,
  };

  const PEAKS = Object.values(PEAK).reduce((sum, peak) => sum + peak, 0);

  const centre = ([lo, hi]: readonly [number, number]): number => (lo + hi) / 2;
  const atCentre = (species: PlantSpecies): ResourceOverrides => ({
    temperature: centre(PLANT_SPECIES_DATA[species].tolerableTemp),
    ph: centre(PLANT_SPECIES_DATA[species].tolerablePH),
  });

  it('emits every channel at its peak share of the light term and the Liebig sufficiency', () => {
    const plant = makePlant('anubias');
    const resources = makeResources({ light: 30, co2: 5, ...atCentre('anubias') });
    const context = ctx(plant, resources);
    const benefits = buildPlantBenefits(context);
    expect(benefits.map((b) => b.key).sort()).toEqual(['co2', 'ph', 'temperature']);

    const drive =
      lightSaturationFactor(30, getSaturationIrradiance('anubias', plantsDefaults)) * context.nutrientSufficiency;
    const carbon = calculateCo2Factor(5, 'anubias');
    for (const benefit of benefits) {
      const share = benefit.key === 'co2' ? carbon : 1;
      expect(benefit.amount).toBeCloseTo(PEAK[benefit.key]! * drive * share, 12);
    }
  });

  it('earns in proportion to sufficiency, and nothing on a nutrient run dry', () => {
    const at = (nutrientSufficiency: number): VitalityFactor[] =>
      buildPlantBenefits({ ...ctx(makePlant('anubias'), makeResources(atCentre('anubias'))), nutrientSufficiency });

    at(0).forEach((benefit) => expect(benefit.amount).toBe(0));
    at(0.5).forEach((benefit, i) => {
      expect(benefit.amount).toBeGreaterThan(0);
      expect(benefit.amount).toBeCloseTo(at(1)[i]!.amount / 2, 12);
    });
  });

  it('scales every channel by 1 + vigour, and no stressor at all', () => {
    const mild = makeResources({ light: 30, co2: 5, ...atCentre('anubias') });
    const harsh = makeResources({ light: 200, co2: 1, temperature: 33, ph: 8.5 });
    const at = (vigour: number, resources: Resources): PlantVitalityContext =>
      ctx(makePlant('anubias', { vigour }), resources);

    for (const vigour of [-VIGOUR_SPAN, 0.07, VIGOUR_SPAN]) {
      const plain = buildPlantBenefits(at(0, mild));
      buildPlantBenefits(at(vigour, mild)).forEach((benefit, i) => {
        expect(benefit.amount).toBeGreaterThan(0);
        expect(benefit.amount).toBeCloseTo(plain[i]!.amount * (1 + vigour), 12);
      });
      expect(buildPlantStressors(at(vigour, harsh))).toEqual(buildPlantStressors(at(0, harsh)));
    }
  });

  it('earns the CO2 channel on the species carbon Monod, so a carpet earns less of it', () => {
    const co2Benefit = (species: PlantSpecies, co2: number): number =>
      buildPlantBenefits(ctx(makePlant(species), makeResources({ co2 }))).find(
        (b) => b.key === 'co2'
      )?.amount ?? 0;

    expect(co2Benefit('monte_carlo', 4)).toBeGreaterThan(0);
    expect(co2Benefit('monte_carlo', 25)).toBeGreaterThan(co2Benefit('monte_carlo', 4));
    expect(co2Benefit('monte_carlo', 4)).toBeLessThan(co2Benefit('anubias', 4));
  });

  it.each<['temperature' | 'ph', 'tolerableTemp' | 'tolerablePH']>([
    ['temperature', 'tolerableTemp'],
    ['ph', 'tolerablePH'],
  ])('ramps the %s benefit from nothing at either edge to its peak at the band centre', (key, band) => {
    const [lo, hi] = PLANT_SPECIES_DATA.amazon_sword[band];
    const earnedAt = (reading: number): number =>
      buildPlantBenefits(ctx(makePlant('amazon_sword'), makeResources({ [key]: reading }))).find(
        (b) => b.key === key
      )!.amount;
    const harmAt = (reading: number): number =>
      buildPlantStressors(ctx(makePlant('amazon_sword'), makeResources({ [key]: reading }))).find(
        (s) => s.key === key
      )!.amount;
    const mid = (lo + hi) / 2;
    const quarter = (hi - lo) / 4;

    expect(earnedAt(lo)).toBe(0);
    expect(earnedAt(hi)).toBe(0);
    expect(harmAt(lo)).toBe(0);
    expect(harmAt(hi)).toBe(0);
    expect(earnedAt(lo + 1e-6)).toBeLessThan(1e-5);
    expect(earnedAt(mid + quarter)).toBeCloseTo(earnedAt(mid - quarter), 12);
    expect(earnedAt(mid - quarter)).toBeCloseTo(0.75 * earnedAt(mid), 12);
  });

  describe('the budget is income realised through photosynthesis', () => {
    const earned = (species: PlantSpecies, light: number): number =>
      budget(species, makeResources({ light, ...atCentre(species) }));

    it('pays a brighter plant more than a dim one, both inside the band', () => {
      expect(earned('anubias', 60)).toBeGreaterThan(earned('anubias', 12));
    });

    it('climbs with PAR the whole way and never passes the summed peaks', () => {
      let previous = 0;
      for (const par of [1, 5, 15, 30, 70, 150, 400]) {
        const income = earned('anubias', par);
        expect(income).toBeGreaterThan(previous);
        expect(income).toBeLessThanOrEqual(PEAKS);
        previous = income;
      }
    });

    it('has no cliff at the top of the band', () => {
      const [, hi] = PLANT_SPECIES_DATA.anubias.tolerableLight;
      const under = earned('anubias', hi - 0.01);
      const over = earned('anubias', hi + 0.01);

      expect(over).toBeGreaterThan(under);
      expect(over - under).toBeLessThan(1e-4);
    });

    it('pays nothing in the dark, whatever the water is doing', () => {
      const perfect = makeResources({ light: 0, co2: 20, temperature: 25, ph: 7.0 });
      expect(budget('anubias', perfect)).toBe(0);
      for (const benefit of buildPlantBenefits(ctx(makePlant('anubias'), perfect))) {
        expect(benefit.amount).toBe(0);
      }
    });

    it('pays each species on its own Ik, so a shade plant is nearer its ceiling', () => {
      const species = Object.keys(PLANT_SPECIES_DATA) as PlantSpecies[];

      for (const one of species) {
        for (const other of species) {
          if (
            getSaturationIrradiance(one, plantsDefaults) <
            getSaturationIrradiance(other, plantsDefaults)
          ) {
            expect(earned(one, 50)).toBeGreaterThan(earned(other, 50));
          }
        }
      }
    });

    it('reads Ik off the tuned factor rather than a constant of its own', () => {
      const atFactor = (saturationIrradianceFactor: number): number =>
        budget('anubias', makeResources({ light: 20, ...atCentre('anubias') }), {
          ...plantsDefaults,
          saturationIrradianceFactor,
        });

      expect(atFactor(4)).toBeLessThan(atFactor(2));
      expect(atFactor(2)).toBeLessThan(atFactor(1));
      const carbonShort = PEAK.co2! * (1 - calculateCo2Factor(20, 'anubias'));
      const resources = makeResources({ light: 20, ...atCentre('anubias') });
      const sufficiency = calculateNutrientSufficiency(resources, resources.water, 'anubias', nutrientsDefaults);
      expect(atFactor(0)).toBeCloseTo(sufficiency * (PEAKS - carbonShort), 12);
    });
  });
});

describe('light at the plant\'s own height', () => {
  const plant = makePlant('amazon_sword');
  const factor = (factors: VitalityFactor[], key: string): number =>
    factors.find((f) => f.key === key)?.amount ?? 0;
  const read = (resources: ResourceOverrides, canopy: CanopyLight): PlantVitalityContext =>
    ctx(plant, makeResources({ potassium: 0, ...resources }), 0, plantsDefaults, canopy);

  it('starves on the day at its mean leaf: the substrate day times its leaf scale', () => {
    const day = litDay(15, CARE_SHEET_PHOTOPERIOD);
    const shaded = read({ lightByHour: day }, { leaf: 0.6, top: 1 });
    const dimmer = read({ lightByHour: day.map((par) => par * 0.6) }, { leaf: 1, top: 1 });

    expect(factor(buildPlantStressors(shaded), 'lightStarvation')).toBeGreaterThan(0);
    expect(factor(buildPlantStressors(shaded), 'lightStarvation')).toBeCloseTo(
      factor(buildPlantStressors(dimmer), 'lightStarvation'),
      12
    );
  });

  it('earns, and asks for nutrients, on the PAR at its mean leaf', () => {
    const fed = { potassium: getMassFromPpm(7, 100) };
    expect(buildPlantBenefits(read({ light: 50, ...fed }, { leaf: 0.4, top: 1 }))).toEqual(
      buildPlantBenefits(read({ light: 20, ...fed }, { leaf: 1, top: 1 }))
    );

    const shaded = read({ light: 50 }, { leaf: 0.4, top: 1 });
    const dimmer = read({ light: 20 }, { leaf: 1, top: 1 });
    expect(factor(buildPlantStressors(shaded), 'nutrients')).toBeCloseTo(
      factor(buildPlantStressors(dimmer), 'nutrients'),
      12
    );
  });

  it('burns on the PAR at its crown top, whatever reaches its mean leaf', () => {
    const edge = PLANT_SPECIES_DATA.amazon_sword.tolerableLight[1];
    const burnt = (light: number, canopy: CanopyLight): number =>
      factor(buildPlantStressors(read({ light }, canopy)), 'light');

    expect(burnt(edge, { leaf: 2, top: 1 })).toBe(0);
    expect(burnt(edge, { leaf: 0.5, top: 1.2 })).toBeCloseTo(burnt(edge * 1.2, { leaf: 1, top: 1 }), 12);
    expect(burnt(edge, { leaf: 0.5, top: 1.2 })).toBeCloseTo(burnt(edge, { leaf: 3, top: 1.2 }), 12);
  });
});

describe('computePlantVitality', () => {
  it('spends income on condition first and banks only what overflows 100', () => {
    const hurt = computePlantVitality(ctx(makePlant('anubias', { condition: 80 }), makeResources()));
    expect(hurt.newCondition).toBeGreaterThan(80);
    expect(hurt.surplus).toBe(0);

    const full = computePlantVitality(ctx(makePlant('anubias', { condition: 100 }), makeResources()));
    expect(full.newCondition).toBe(100);
    expect(full.surplus).toBeGreaterThan(0);
  });

  it('heals from the bank at the pace the species grows', () => {
    const dark = makeResources({ light: 0 });
    const healed = (species: PlantSpecies): number =>
      computePlantVitality(ctx(makePlant(species, { condition: 50, surplus: 10 }), dark)).breakdown.healed;

    expect(plantHealingRate(makePlant('amazon_sword'), plantsDefaults)).toBeCloseTo(
      PLANT_SPECIES_DATA.amazon_sword.growthRate * plantsDefaults.healingDrawRate,
      12
    );
    expect(healed('amazon_sword')).toBeCloseTo(10 * plantHealingRate(makePlant('amazon_sword'), plantsDefaults), 12);
    expect(healed('monte_carlo')).toBeGreaterThan(healed('anubias'));
  });

  it('costs a plant nothing through a scheduled night', () => {
    const night = makeResources({ light: 0, lightByHour: litDay(90, 12) });
    const result = computePlantVitality(ctx(makePlant('monte_carlo', { surplus: 10 }), night));
    expect(result.breakdown.damageRate).toBe(0);
    expect(result.newCondition).toBe(100);
    expect(result.surplus).toBe(10);
  });

  it('Anubias holds at 100 even with low CO2 (low-tech tolerance)', () => {
    const plant = makePlant('anubias', { condition: 100 });
    const resources = makeResources({ co2: 2 });
    const result = computePlantVitality(ctx(plant, resources));
    expect(result.newCondition).toBe(100);
    expect(result.surplus).toBeGreaterThan(0);
  });

  it('never writes a negative surplus when the cap is negative', () => {
    const resources = makeResources();
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
});

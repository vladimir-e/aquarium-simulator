import { describe, it, expect } from 'vitest';
import {
  buildPlantStressors,
  buildPlantUpkeep,
  buildPlantBenefits,
  computePlantVitality,
  type PlantVitalityContext,
} from './plant-vitality.js';
import type { VitalityResult } from './vitality.js';
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

describe('buildPlantUpkeep', () => {
  const charge = (
    key: 'upkeep',
    plant: Plant,
    resources = makeResources(),
    plantsConfig = plantsDefaults
  ): number =>
    buildPlantUpkeep(ctx(plant, resources, 0, plantsConfig)).find((f) => f.key === key)!.amount;

  it('scales upkeep on the same Q10 the gas layer respires on', () => {
    const plant = makePlant('anubias', { surplus: plantsDefaults.surplusCap });
    const cost = (temperature: number): number =>
      charge('upkeep', plant, makeResources({ temperature }));

    expect(cost(plantsDefaults.respirationReferenceTemp)).toBe(plantsDefaults.upkeepCost);
    expect(cost(plantsDefaults.respirationReferenceTemp + 10)).toBeCloseTo(
      plantsDefaults.upkeepCost * plantsDefaults.respirationQ10,
      12
    );
    expect(cost(35)).toBeGreaterThan(cost(15));
  });

  describe('the reserve upkeep keeps back from damage', () => {
    /** A tank that damages a plant rather than starving it: bright, but sour. */
    const sour = makeResources({ ph: 4.5 });

    /**
     * The reading `create-plant.test.ts` takes of the same line, against a
     * named tank: the banked units that buy `upkeepReserveHours` of this
     * species' own drain in this water.
     */
    const line = (species: PlantSpecies, resources = sour): number =>
      computePlantVitality(ctx(makePlant(species), resources)).breakdown.reserved;

    const tick = (
      species: PlantSpecies,
      surplus: number,
      resources = sour,
      plantsConfig = plantsDefaults
    ): VitalityResult =>
      computePlantVitality(ctx(makePlant(species, { surplus }), resources, 0, plantsConfig));

    it('spends the spare above the line and leaves condition alone', () => {
      const result = tick('anubias', plantsDefaults.surplusCap);

      expect(result.newCondition).toBe(100);
      expect(result.breakdown.drained).toBeGreaterThan(0);
      expect(result.surplus).toBeLessThan(plantsDefaults.surplusCap);
    });

    it('stops at the line and takes the rest out of condition', () => {
      const result = tick('anubias', line('anubias'));

      expect(result.surplus).toBe(line('anubias'));
      expect(result.breakdown.drained).toBe(0);
      expect(result.newCondition).toBeLessThan(100);
    });

    it('leaves the upkeep payable at the line, which is what the line is for', () => {
      // The whole point of the reservation: however hard a plant is being
      // damaged, it never wakes up unable to pay for being alive — so it
      // takes the damage on condition and sheds nothing.
      expect(tick('anubias', line('anubias')).breakdown.starved).toBe(0);
    });

    it('measures the line in hours — one duration, a different stock per species', () => {
      for (const species of ['anubias', 'java_fern', 'monte_carlo'] as const) {
        const own = line(species);
        expect(tick(species, own).breakdown.drained).toBe(0);
        expect(tick(species, own + 1).breakdown.drained).toBeGreaterThan(0);
      }
    });

    it('asks a warm tank for more reserve than a cool one', () => {
      // The line is hours of maintenance, and a warm plant burns faster — so
      // the same bank is spare at 25 °C and already survival rations at 35 °C.
      const banked = 1.5 * line('anubias');

      expect(tick('anubias', banked).breakdown.drained).toBeGreaterThan(0);
      expect(
        tick('anubias', banked, makeResources({ ph: 4.5, temperature: 35 })).breakdown.drained
      ).toBe(0);
    });

    it('lets damage spend the whole bank when nothing is charged for staying alive', () => {
      const free = { ...plantsDefaults, upkeepCost: 0 };
      const result = tick('anubias', 0.001, sour, free);

      expect(result.surplus).toBe(0);
      expect(result.breakdown.drained).toBeCloseTo(0.001, 12);
    });
  });
});

describe('buildPlantStressors', () => {
  const amount = (
    species: PlantSpecies,
    key: string,
    resources: Partial<Resources>,
    algaeMass = 0
  ): number =>
    buildPlantStressors(ctx(makePlant(species), makeResources(resources), algaeMass)).find(
      (s) => s.key === key
    )?.amount ?? 0;

  it('charges an Anubias in good conditions nothing at all', () => {
    const plant = makePlant('anubias', { surplus: plantsDefaults.surplusCap });
    for (const s of buildPlantStressors(ctx(plant, makeResources()))) {
      expect(s.amount).toBe(0);
    }
  });

  it.each<[string, PlantSpecies, (gap: number) => Partial<Resources>]>([
    ['co2', 'monte_carlo', (gap) => ({ co2: PLANT_SPECIES_DATA.monte_carlo.tolerableCO2[0] - gap })],
    ['light', 'monte_carlo', (gap) => ({ light: PLANT_SPECIES_DATA.monte_carlo.tolerableLight[0] - gap })],
    ['light', 'anubias', (gap) => ({ light: PLANT_SPECIES_DATA.anubias.tolerableLight[1] + gap })],
    ['temperature', 'amazon_sword', (gap) => ({ temperature: PLANT_SPECIES_DATA.amazon_sword.tolerableTemp[0] - gap })],
    ['ph', 'monte_carlo', (gap) => ({ ph: PLANT_SPECIES_DATA.monte_carlo.tolerablePH[1] + gap / 4 })],
  ])('charges %s on %s in proportion to the gap outside its range', (key, species, at) => {
    expect(amount(species, key, at(0))).toBe(0);
    const one = amount(species, key, at(1));
    expect(one).toBeGreaterThan(0);
    expect(amount(species, key, at(2))).toBeCloseTo(2 * one, 10);
  });

  it('labels the side of the light band a plant is off', () => {
    const label = (species: PlantSpecies, light: number): string | undefined =>
      buildPlantStressors(ctx(makePlant(species), makeResources({ light }))).find(
        (s) => s.key === 'light'
      )?.label;

    expect(label('monte_carlo', 5)).toContain('low');
    expect(label('anubias', 200)).toContain('high');
  });

  it('charges nutrient deficiency at full severity when a required nutrient is gone', () => {
    expect(amount('monte_carlo', 'nutrients', { potassium: 0 })).toBeCloseTo(
      plantsDefaults.nutrientDeficiencySeverity,
      10
    );
  });

  it('charges nitrate toxicity only above the threshold, linear past it', () => {
    const at = (ppm: number): number =>
      amount('amazon_sword', 'nutrientToxicity', { nitrate: getMassFromPpm(ppm, 100) });
    const threshold = plantsDefaults.nutrientToxicityThresholdNitrate;

    expect(at(threshold)).toBe(0);
    expect(at(threshold + 20)).toBeCloseTo(2 * at(threshold + 10), 10);
    expect(at(threshold + 10)).toBeGreaterThan(0);
  });

  it('charges algae shading only above the threshold, linear past it', () => {
    const at = (algae: number): number => amount('amazon_sword', 'algae', {}, algae);
    const threshold = plantsDefaults.algaeShadingThreshold;

    expect(at(threshold)).toBe(0);
    expect(at(threshold + 20)).toBeCloseTo(2 * at(threshold + 10), 10);
    expect(at(threshold + 10)).toBeGreaterThan(0);
  });

  it('charges neither low CO2 nor low light in the dark', () => {
    expect(amount('monte_carlo', 'co2', { light: 0, co2: 4 })).toBe(0);
    expect(amount('monte_carlo', 'light', { light: 0 })).toBe(0);
    expect(amount('monte_carlo', 'co2', { light: 30, co2: 4 })).toBeGreaterThan(0);
  });

  it('spares a low-tech species the CO2 a high-tech one needs', () => {
    expect(amount('anubias', 'co2', { co2: 5 })).toBe(0);
    expect(amount('monte_carlo', 'co2', { co2: 5 })).toBeGreaterThan(0);
  });
});

describe('buildPlantBenefits', () => {
  /** Every channel summed — the income the plant actually earns that tick. */
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
    nutrients: plantsDefaults.nutrientBenefitPeak,
  };

  const PEAKS = Object.values(PEAK).reduce((sum, peak) => sum + peak, 0);

  it('emits all four channels at their peak share of the light term', () => {
    const plant = makePlant('anubias');
    const resources = makeResources({
      light: 30, // in anubias range [8, 70]
      co2: 5, // in anubias range [1, 40]
      temperature: 25, // in [18, 30]
      ph: 7.0, // in [6.0, 8.0]
    });
    const benefits = buildPlantBenefits(ctx(plant, resources));
    const keys = benefits.map((b) => b.key).sort();
    expect(keys).toEqual(['co2', 'nutrients', 'ph', 'temperature']);

    // Anubias is low-demand → only NO3 required, and NO3 is well fed, so every
    // channel is at its peak. What each one pays is that peak times the share
    // of photosynthesis the light supports: 30 PAR is 1.9 Ik for an anubias.
    const saturation = lightSaturationFactor(
      30,
      getSaturationIrradiance('anubias', plantsDefaults)
    );
    for (const benefit of benefits) {
      expect(benefit.amount).toBeCloseTo(PEAK[benefit.key]! * saturation, 12);
    }
  });

  it('drops the CO2 benefit to zero when CO2 leaves the species range', () => {
    const plant = makePlant('monte_carlo');
    const resources = makeResources({ co2: 5 });
    const benefits = buildPlantBenefits(ctx(plant, resources));
    expect(benefits.find((b) => b.key === 'co2')?.amount).toBe(0);
  });

  describe('the budget is income realised through photosynthesis', () => {
    const earned = (species: PlantSpecies, light: number): number =>
      budget(species, makeResources({ light }));

    it('pays a brighter plant more than a dim one, both inside the band', () => {
      // Both readings sit inside the 8–70 PAR anubias tolerates, so a band-shaped
      // award would pay them the same and only the photoperiod would decide growth.
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
      // Anubias burns above 70 PAR, and that charge is `lightExcessiveSeverity`'s
      // alone: crossing the top of the band costs a plant damage, not its income,
      // which by then is a thousandth off the peak either side.
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
      // The knob has to reach this channel: raising it moves a species'
      // saturation up, so one fixture buys a smaller share of the peaks.
      const atFactor = (saturationIrradianceFactor: number): number =>
        budget('anubias', makeResources({ light: 20 }), {
          ...plantsDefaults,
          saturationIrradianceFactor,
        });

      expect(atFactor(4)).toBeLessThan(atFactor(2));
      expect(atFactor(2)).toBeLessThan(atFactor(1));
      // A species that saturates at no light at all is one nothing holds back.
      expect(atFactor(0)).toBeCloseTo(PEAKS, 12);
    });
  });
});

describe('computePlantVitality', () => {
  it('banks for an Anubias below 100 rather than repairing it on the spot', () => {
    // Repair is a withdrawal (`spendSurplus`), not a use of income: what a
    // damaged plant earns goes to the bank, which is what leaves it something
    // to pay the night with while it recovers.
    const plant = makePlant('anubias', { condition: 80 });
    const result = computePlantVitality(ctx(plant, makeResources()));
    expect(result.newCondition).toBe(80);
    expect(result.surplus).toBeGreaterThan(0);
  });

  it('banks the same at the bottom of the upkeep slider', () => {
    // `upkeepCost` declares `min: 0`, and a plant tuned there still owns an
    // energy ledger — so the storing arm cannot be keyed off a rate a reachable
    // config drives to zero, or the bank freezes and growth stalls with it.
    const free = { ...plantsDefaults, upkeepCost: 0 };
    const result = computePlantVitality(
      ctx(makePlant('anubias', { condition: 80 }), makeResources(), 0, free)
    );

    expect(result.breakdown.upkeepRate).toBe(0);
    expect(result.newCondition).toBe(80);
    expect(result.surplus).toBeGreaterThan(0);
  });

  it('Anubias holds at 100 even with low CO2 (low-tech tolerance)', () => {
    const plant = makePlant('anubias', { condition: 100 });
    const resources = makeResources({ co2: 2 }); // 2 < 1 lower bound? No, 2 > 1
    const result = computePlantVitality(ctx(plant, resources));
    expect(result.newCondition).toBe(100);
    expect(result.surplus).toBeGreaterThan(0);
  });

  it('produces surplus out of whatever income the upkeep left', () => {
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
});

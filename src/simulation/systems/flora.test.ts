import { describe, it, expect } from 'vitest';
import {
  CARE_SHEET_PHOTOPERIOD,
  bankConversion,
  bankDraw,
  dailyLightEdge,
  floraBenefits,
  floraHealingRate,
  floraStressors,
  growthTaper,
  metabolicRateUnits,
  saturationIrradiance,
  type FloraHour,
} from './flora.js';
import { getRespirationTemperatureFactor } from './respiration.js';
import { lightSaturationFactor, monodFactor } from '../core/kinetics.js';
import { parHoursToDli } from '../equipment/light.js';
import { plantsDefaults } from '../config/plants.js';
import { PLANT_SPECIES_DATA, plantTraits, type PlantSpecies } from '../plants/species.js';
import { ALGAE } from '../algae/traits.js';
import { createSimulation } from '../state.js';

const config = plantsDefaults;
const ROSTER = Object.keys(PLANT_SPECIES_DATA) as PlantSpecies[];

describe('saturationIrradiance', () => {
  it('orders the roster the way the bands do', () => {
    for (const one of ROSTER) {
      for (const other of ROSTER) {
        if (PLANT_SPECIES_DATA[one].tolerableLight[0] < PLANT_SPECIES_DATA[other].tolerableLight[0]) {
          expect(saturationIrradiance(plantTraits(one), config)).toBeLessThan(saturationIrradiance(plantTraits(other), config));
        }
      }
    }
  });

  it('is the tuned multiple of the low end of the band, for a bloom as for a plant', () => {
    const at = (saturationIrradianceFactor: number): number =>
      saturationIrradiance(plantTraits('java_fern'), { ...config, saturationIrradianceFactor });
    expect(at(3)).toBeCloseTo(2 * at(1.5), 10);
    for (const traits of Object.values(ALGAE)) {
      expect(saturationIrradiance(traits, config)).toBe(config.saturationIrradianceFactor * traits.lowLight);
    }
  });
});

describe('dailyLightEdge', () => {
  it('holds the low end of the band for a care-sheet day', () => {
    for (const traits of Object.values(ALGAE)) {
      expect(dailyLightEdge(traits)).toBe(parHoursToDli(traits.lowLight, CARE_SHEET_PHOTOPERIOD));
    }
    expect(dailyLightEdge(plantTraits('monte_carlo'))).toBeGreaterThan(dailyLightEdge(plantTraits('anubias')));
  });
});

describe('floraHealingRate', () => {
  it('heals at the rate it grows', () => {
    for (const traits of [...ROSTER.map(plantTraits), ...Object.values(ALGAE)]) {
      expect(floraHealingRate(traits, config)).toBe(traits.growthRate * config.healingDrawRate);
    }
  });
});

describe('growthTaper', () => {
  it('is whole when empty, closed when full, and linear in between', () => {
    expect(growthTaper(0)).toBe(1);
    expect(growthTaper(100)).toBe(0);
    expect(growthTaper(25)).toBe(0.75);
    expect(growthTaper(75)).toBe(0.25);
  });
});

describe('bankDraw', () => {
  it('draws 1 − e^−growthDrawRate of the bank through the taper, and nothing from an empty or negative one', () => {
    expect(bankDraw(10, 40, config)).toBeCloseTo(10 * (1 - Math.exp(-config.growthDrawRate)) * 0.6, 12);
    expect(bankDraw(20, 40, config)).toBeCloseTo(2 * bankDraw(10, 40, config), 12);
    expect(bankDraw(0, 40, config)).toBe(0);
    expect(bankDraw(-1, 40, config)).toBe(0);
  });

  it('never draws more than the bank, at any rate', () => {
    for (const growthDrawRate of [1, 50, 1e6]) {
      expect(bankDraw(10, 0, { ...config, growthDrawRate })).toBeLessThanOrEqual(10);
    }
  });
});

describe('bankConversion', () => {
  it('is the growth rate on the plants’ size per bank point', () => {
    for (const traits of Object.values(ALGAE)) {
      expect(bankConversion(traits, config)).toBe(traits.growthRate * config.sizePerSurplus);
    }
    expect(bankConversion(plantTraits('monte_carlo'), config)).toBe(PLANT_SPECIES_DATA.monte_carlo.growthRate * config.sizePerSurplus);
  });
});

describe('metabolicRateUnits', () => {
  it('runs the rate units its tissue is at its growth rate, a plant’s as a bloom’s', () => {
    for (const traits of [...ROSTER.map(plantTraits), ...Object.values(ALGAE)]) {
      expect(metabolicRateUnits(3, traits)).toBe(3 * traits.growthRate);
      expect(metabolicRateUnits(3, { ...traits, growthRate: 2 * traits.growthRate })).toBe(2 * metabolicRateUnits(3, traits));
    }
  });
});

describe('the channels a plant and a bloom share', () => {
  const resources = { ...createSimulation({ tankCapacity: 100 }).resources, temperature: 25, co2: 4 };
  const hour = (overrides: Partial<FloraHour> = {}): FloraHour => ({
    traits: plantTraits('amazon_sword'),
    resources,
    plantsConfig: config,
    light: { par: 50, dailyLight: 0 },
    nutrientSufficiency: 1,
    co2HalfSaturation: 3,
    vigour: 0,
    ...overrides,
  });
  const amount = (factors: { key: string; amount: number }[], key: string): number =>
    factors.find((f) => f.key === key)!.amount;

  it('charges starvation at respiration’s cost, in proportion to the feeder’s growth rate', () => {
    for (const traits of [...ROSTER.map(plantTraits), ...Object.values(ALGAE)]) {
      expect(amount(floraStressors(hour({ traits })), 'lightStarvation')).toBeCloseTo(
        config.lightStarvationSeverity * traits.growthRate * getRespirationTemperatureFactor(25, config),
        12
      );
    }
  });

  it('earns on the light curve, the sufficiency and vigour, and CO₂ on the feeder’s own half-saturation', () => {
    const earned = (overrides: Partial<FloraHour>): number => amount(floraBenefits(hour(overrides)), 'co2');
    const drive = lightSaturationFactor(50, saturationIrradiance(plantTraits('amazon_sword'), config));
    expect(earned({})).toBeCloseTo(drive * config.co2BenefitPeak * monodFactor(4, 3), 12);
    expect(earned({ nutrientSufficiency: 0.5, vigour: 0.2 })).toBeCloseTo(earned({}) * 0.5 * 1.2, 12);
    expect(earned({ co2HalfSaturation: 0.3 })).toBeCloseTo((earned({}) * monodFactor(4, 0.3)) / monodFactor(4, 3), 12);
  });
});

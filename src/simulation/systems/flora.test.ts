import { describe, it, expect } from 'vitest';
import {
  CARE_SHEET_PHOTOPERIOD,
  dailyLightEdge,
  floraBenefits,
  floraStressors,
  growthTaper,
  loseFlora,
  metabolicRateUnits,
  saturationIrradiance,
  shedShare,
  type FloraHour,
} from './flora.js';
import { monodFactor } from '../core/kinetics.js';
import { stocked } from './flora-budget.js';
import { plantParams } from '../flora/params.js';
import { addOrganics } from '../core/organics.js';
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

describe('growthTaper', () => {
  it('is whole when empty, closed when full or past it, and linear in between', () => {
    expect(growthTaper(0)).toBe(1);
    expect(growthTaper(100)).toBe(0);
    expect(growthTaper(130)).toBe(0);
    expect(growthTaper(25)).toBe(0.75);
    expect(growthTaper(75)).toBe(0.25);
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

describe('shedShare', () => {
  it('is nothing at full condition and maxSheddingRate at 0', () => {
    expect(shedShare(100, config)).toBe(0);
    expect(shedShare(0, config)).toBe(config.maxSheddingRate);
  });

  it('follows the square of the condition deficit', () => {
    expect(shedShare(50, config)).toBeCloseTo(shedShare(0, config) / 4, 12);
    expect(shedShare(90, config)).toBeCloseTo(shedShare(0, config) / 100, 12);
  });

  it('is smooth in condition: no step anywhere, and flat as it leaves 100', () => {
    const top = config.maxSheddingRate;
    let previous = shedShare(100, config);
    for (let condition = 99.9; condition > 0; condition -= 0.1) {
      const now = shedShare(condition, config);
      expect(now).toBeGreaterThan(previous);
      expect(now - previous).toBeLessThan(top * 0.0021);
      previous = now;
    }
    expect(shedShare(99.9, config) / top).toBeLessThan(1e-5);
  });
});

describe('loseFlora', () => {
  const p = plantParams('java_fern', config);
  const budget = stocked(2, p);

  it('sheds nothing at full condition and its shedShare of the structure below it', () => {
    expect(loseFlora(budget, p, 100, config).shed.grams).toBe(0);
    const loss = loseFlora(budget, p, 50, config);
    expect(loss.survivor!.structure).toBeCloseTo(2 * (1 - shedShare(50, config)), 15);
  });

  it('kills at condition 0, leaving every gram as waste and the stores in the water', () => {
    const loss = loseFlora(budget, p, 0, config);
    const lost = addOrganics(loss.shed, loss.died);
    expect(loss.survivor).toBeNull();
    expect(lost.grams).toBeCloseTo(budget.structure + budget.reserve + budget.offshootBuffer, 12);
    for (const n of ['nitrate', 'phosphate', 'potassium', 'iron'] as const) {
      expect(lost.nutrients[n] + loss.leachate[n]).toBeCloseTo(p.qMin[n] * budget.structure + budget.stores[n], 9);
    }
  });
});

describe('the channels a plant and a bloom share', () => {
  const resources = { ...createSimulation({ tankCapacity: 100 }).resources, temperature: 25, co2: 4 };
  const hour = (overrides: Partial<FloraHour> = {}): FloraHour => ({
    traits: plantTraits('amazon_sword'),
    resources,
    plantsConfig: config,
    wellFed: 1,
    droop: 1,
    fullDroop: 1,
    starvation: 0,
    co2HalfSaturation: 3,
    ...overrides,
  });
  const amount = (factors: { key: string; amount: number }[], key: string): number =>
    factors.find((f) => f.key === key)!.amount;

  it('charges starvation in proportion to the share of upkeep unpaid', () => {
    expect(amount(floraStressors(hour()), 'starvation')).toBe(0);
    expect(amount(floraStressors(hour({ starvation: 0.4 })), 'starvation')).toBeCloseTo(0.4 * config.starvationSeverity, 15);
  });

  it('charges nutrient deficiency on the Droop limit under its edge’s share of full stores’, linear to full at an empty store', () => {
    const full = 0.8;
    const edge = config.droopEdge * full;
    const charged = (droop: number): number => amount(floraStressors(hour({ droop, fullDroop: full })), 'nutrients');
    expect(charged(full)).toBe(0);
    expect(charged(edge)).toBe(0);
    expect(charged(edge / 2)).toBeCloseTo(config.nutrientDeficiencySeverity / 2, 15);
    expect(charged(0)).toBeCloseTo(config.nutrientDeficiencySeverity, 15);
  });

  it('earns on reserve density and the Droop limit, and CO₂ on the feeder’s own half-saturation', () => {
    const earned = (overrides: Partial<FloraHour>): number => amount(floraBenefits(hour(overrides)), 'co2');
    expect(earned({})).toBeCloseTo(config.co2BenefitPeak * monodFactor(4, 3), 12);
    expect(earned({ wellFed: 0.5, droop: 0.6 })).toBeCloseTo(earned({}) * 0.5 * 0.6, 12);
    expect(earned({ co2HalfSaturation: 0.3 })).toBeCloseTo((earned({}) * monodFactor(4, 0.3)) / monodFactor(4, 3), 12);
    expect(earned({ wellFed: 0 })).toBe(0);
  });
});

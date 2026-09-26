import { describe, it, expect } from 'vitest';
import {
  calculateNutrientSufficiency,
  nutrientShare,
  speciesDemand,
  speciesHalfSaturation,
} from './nutrients.js';
import { NUTRIENTS, demandMeta, nutrientsDefaults, type NutrientVector } from '../config/nutrients.js';
import type { Resources } from '../state.js';

const WATER = 40;

function resourcesAt(ppm: Partial<NutrientVector>): Resources {
  return {
    water: WATER,
    temperature: 25,
    surface: 1000,
    flow: 100,
    light: 0,
    lightByHour: new Array(24).fill(0),
    aeration: false,
    food: 0,
    waste: 0,
    ammonia: 0,
    nitrite: 0,
    nitrate: (ppm.nitrate ?? 0) * WATER,
    oxygen: 8,
    co2: 5,
    kh: 0,
    gh: 0,
    aob: 1,
    nob: 1,
    phosphate: (ppm.phosphate ?? 0) * WATER,
    potassium: (ppm.potassium ?? 0) * WATER,
    iron: (ppm.iron ?? 0) * WATER,
  };
}

const multiplesOfHalfSaturation = (multiple: number): NutrientVector =>
  Object.fromEntries(
    NUTRIENTS.map((n) => [n, nutrientsDefaults.halfSaturation[n] * multiple])
  ) as NutrientVector;

describe('nutrientShare', () => {
  it('meets half the need at the species half-saturation', () => {
    const k = speciesHalfSaturation('monte_carlo', 'phosphate');
    expect(nutrientShare(k, 'monte_carlo', 'phosphate')).toBeCloseTo(0.5, 10);
  });

  it('saturates: each doubling buys less, and it never passes 1', () => {
    const at = (ppm: number): number => nutrientShare(ppm, 'monte_carlo', 'nitrate');
    expect(at(2) - at(1)).toBeGreaterThan(at(4) - at(2));
    expect(at(1000)).toBeLessThan(1);
    expect(at(1000)).toBeGreaterThan(0.99);
  });

  it('scales the half-saturation by the species demand', () => {
    for (const n of NUTRIENTS) {
      expect(speciesHalfSaturation('amazon_sword', n)).toBeCloseTo(
        speciesDemand('amazon_sword')[n] * nutrientsDefaults.halfSaturation[n],
        12
      );
    }
  });

  it('has no cliff as demand falls to its floor: the same trace meets a smaller need more fully, and none meets none', () => {
    const at = (ppm: number, iron: number): number =>
      nutrientShare(ppm, 'monte_carlo', 'iron', {
        ...nutrientsDefaults,
        demand: { ...nutrientsDefaults.demand, high: { ...nutrientsDefaults.demand.high, iron } },
      });
    const floor = demandMeta.find((m) => m.key === 'iron')!.min;
    const demands = [1, 0.3, 0.1, 0.03, floor];
    const shares = demands.map((demand) => at(0.001, demand));
    for (let i = 1; i < shares.length; i++) expect(shares[i]).toBeGreaterThan(shares[i - 1]);
    expect(shares[shares.length - 1]).toBeLessThan(1);
    for (const demand of demands) expect(at(0, demand)).toBe(0);
  });
});

describe('calculateNutrientSufficiency', () => {
  it('is zero with no water', () => {
    expect(calculateNutrientSufficiency(resourcesAt(multiplesOfHalfSaturation(10)), 0, 'java_fern')).toBe(0);
  });

  it('follows Liebig: the scarcest nutrient sets it', () => {
    const water = resourcesAt({ ...multiplesOfHalfSaturation(20), iron: nutrientsDefaults.halfSaturation.iron });
    expect(calculateNutrientSufficiency(water, WATER, 'monte_carlo')).toBeCloseTo(
      nutrientShare(nutrientsDefaults.halfSaturation.iron, 'monte_carlo', 'iron'),
      10
    );
  });

  it('asks less of a low-demand plant than a high-demand one on the same water', () => {
    const lean = resourcesAt(multiplesOfHalfSaturation(1));
    expect(calculateNutrientSufficiency(lean, WATER, 'java_fern')).toBeGreaterThan(
      calculateNutrientSufficiency(lean, WATER, 'monte_carlo')
    );
  });

  it('reads every species on all four nutrients, and none on water that holds none of one', () => {
    for (const species of ['java_fern', 'amazon_sword', 'monte_carlo'] as const) {
      for (const n of NUTRIENTS) {
        expect(speciesDemand(species)[n]).toBeGreaterThan(0);
        const without = resourcesAt({ ...multiplesOfHalfSaturation(10), [n]: 0 });
        expect(calculateNutrientSufficiency(without, WATER, species)).toBe(0);
      }
    }
  });

  it('rises smoothly with supply rather than stepping at a threshold', () => {
    const at = (multiple: number): number =>
      calculateNutrientSufficiency(resourcesAt(multiplesOfHalfSaturation(multiple)), WATER, 'monte_carlo');
    const steps = [0.25, 0.5, 1, 2, 4, 8].map(at);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
    expect(at(1)).toBeCloseTo(0.5, 10);
  });
});

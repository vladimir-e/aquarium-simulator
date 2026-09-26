import { describe, it, expect } from 'vitest';
import {
  calculateNutrientSufficiency,
  drawTissue,
  GH_HALF_SATURATION,
  GH_PER_NITRATE_DRAWN,
  nutrientShare,
  organicNutrients,
  speciesDemand,
  speciesHalfSaturation,
  type TissueNeed,
} from './nutrients.js';
import { NUTRIENTS, demandMeta, nutrientsDefaults, type NutrientVector } from '../config/nutrients.js';
import { livestockDefaults } from '../config/livestock.js';
import { MW_N, MW_NO3 } from '../core/chemistry.js';
import { monodEndStock, monodFactor, monodUptake } from '../core/kinetics.js';
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

describe('organicNutrients', () => {
  const recipe = organicNutrients(livestockDefaults, nutrientsDefaults);

  it('carries the nitrogen of food, as the nitrate it ends up as', () => {
    expect((recipe.nitrate * MW_N) / MW_NO3 / 1000).toBeCloseTo(livestockDefaults.foodNitrogenFraction, 12);
  });

  it('carries the minerals of food', () => {
    for (const n of ['phosphate', 'potassium', 'iron'] as const) {
      expect(recipe[n]).toBe(nutrientsDefaults.foodMineralContent[n]);
    }
  });
});

describe('drawTissue', () => {
  const recipe = organicNutrients(livestockDefaults, nutrientsDefaults);
  const need = (species: TissueNeed['species'], grams = 0.5): TissueNeed => ({ species, grams });
  const at = (multiple: number, extra: Partial<Resources> = {}): Resources => ({
    ...resourcesAt(multiplesOfHalfSaturation(multiple)),
    ...extra,
  });

  it('takes every nutrient in the recipe’s ratio, for exactly the tissue it supplied', () => {
    const needs = [need('monte_carlo'), need('anubias', 0.2)];
    const { supplied, drawn } = drawTissue(needs, at(3), recipe);
    const grams = needs.reduce((sum, n, i) => sum + n.grams * supplied[i], 0);
    for (const n of NUTRIENTS) expect(drawn[n]).toBeCloseTo(grams * recipe[n], 12);
  });

  it('supplies a lone plant its scarcest nutrient’s Monod share, read where the pool ends the tick', () => {
    const water = at(0.5);
    const { supplied } = drawTissue([need('amazon_sword')], water, recipe);
    const shares = NUTRIENTS.map((n) => {
      const k = speciesHalfSaturation('amazon_sword', n) * WATER;
      const end = monodEndStock(water[n], [{ capacity: 0.5 * recipe[n], halfSaturation: k }]);
      return monodFactor(end, k);
    });
    expect(supplied[0]).toBeCloseTo(Math.min(...shares), 12);
  });

  it('slows as the water thins, never quite stopping, and nears full supply in rich water', () => {
    const share = (multiple: number): number => drawTissue([need('java_fern')], at(multiple), recipe).supplied[0];
    const shares = [0.01, 0.1, 1, 10, 1000].map(share);
    for (let i = 1; i < shares.length; i++) expect(shares[i]).toBeGreaterThan(shares[i - 1]);
    expect(shares[0]).toBeGreaterThan(0);
    expect(shares[shares.length - 1]).toBeGreaterThan(0.99);
  });

  it('keeps a lean species growing on water a hungry one starves on', () => {
    const { supplied } = drawTissue([need('anubias'), need('monte_carlo')], at(0.05), recipe);
    expect(supplied[0]).toBeGreaterThan(supplied[1]);
  });

  it('never draws a pool past what it holds, however large the crowd', () => {
    const crowd = Array.from({ length: 500 }, () => need('monte_carlo', 5));
    for (const multiple of [1e-6, 0.1, 10]) {
      const water = at(multiple);
      const { drawn, supplied } = drawTissue(crowd, water, recipe);
      for (const n of NUTRIENTS) expect(drawn[n]).toBeLessThanOrEqual(water[n]);
      for (const share of supplied) expect(share).toBeGreaterThanOrEqual(0);
    }
  });

  it('is never held back by a nutrient its recipe carries none of', () => {
    const ironless = { ...recipe, iron: 0 };
    const water = at(2, { iron: 0 });
    const { supplied, drawn } = drawTissue([need('monte_carlo')], water, ironless);
    expect(supplied[0]).toBeGreaterThan(0);
    expect(drawn.iron).toBe(0);
  });

  it('draws calcium and magnesium on their own Monod, off the nitrate it drew', () => {
    for (const gh of [0, 0.01, 10000]) {
      const { drawn } = drawTissue([need('java_fern')], at(2, { gh }), recipe);
      expect(drawn.gh).toBeCloseTo(
        monodUptake(gh, drawn.nitrate * GH_PER_NITRATE_DRAWN, GH_HALF_SATURATION * WATER),
        12
      );
      expect(drawn.gh).toBeLessThanOrEqual(gh);
    }
  });

  it('supplies nothing and draws nothing with no water', () => {
    const { supplied, drawn } = drawTissue([need('java_fern')], at(2, { water: 0 }), recipe);
    expect(supplied).toEqual([0]);
    for (const n of [...NUTRIENTS, 'gh'] as const) expect(drawn[n]).toBe(0);
  });
});

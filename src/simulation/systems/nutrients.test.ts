import { describe, it, expect } from 'vitest';
import {
  calculateNutrientSufficiency,
  drawTissue,
  ghDrawn,
  GH_HALF_SATURATION,
  GH_PER_NITRATE_DRAWN,
  liebig,
  nutrientShare,
  nutrientShares,
  organicNutrients,
  plantShares,
  poolDraws,
  speciesDemand,
  speciesHalfSaturation,
  tankPools,
  type TankPools,
  type TissueNeed,
} from './nutrients.js';
import {
  demandMeta,
  mapNutrients,
  NUTRIENTS,
  nutrientsDefaults,
  ZERO_NUTRIENTS,
  type NutrientVector,
} from '../config/nutrients.js';
import { livestockDefaults } from '../config/livestock.js';
import { plantsDefaults } from '../config/plants.js';
import { MW_N, MW_NO3 } from '../core/chemistry.js';
import { monodUptake } from '../core/kinetics.js';
import { createSimulation, type Resources } from '../state.js';
import { growthFormOf, type PlantSpecies } from '../plants/species.js';
import { purchase, sizeBought } from './plant-growth.js';
import { createPlant, MIN_PLANTABLE_SIZE } from '../plants/create-plant.js';
import { createRng } from '../core/rng.js';
import { tissueMass } from './plant-lifecycle.js';
import { mirroredPools } from '../tests/pools.js';

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
  mapNutrients((n) => nutrientsDefaults.halfSaturation[n] * multiple);

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

/** The water at these multiples of the full half-saturations, over a bed holding those multiples. */
const poolsAt = (water: number, bed: number): TankPools => [
  { stock: resourcesAt(multiplesOfHalfSaturation(water)), volume: WATER },
  { stock: resourcesAt(multiplesOfHalfSaturation(bed)), volume: WATER },
];

describe('calculateNutrientSufficiency', () => {
  it('is zero for a water feeder with no water', () => {
    const dry = { ...resourcesAt(multiplesOfHalfSaturation(10)), water: 0 };
    expect(calculateNutrientSufficiency(mirroredPools(dry), 'java_fern')).toBe(0);
  });

  it('is zero for a root feeder in a dry tank, however charged its bed', () => {
    const [water, bed] = poolsAt(10, 10);
    expect(calculateNutrientSufficiency([{ ...water, volume: 0 }, bed], 'amazon_sword')).toBe(0);
  });

  it('follows Liebig: the scarcest nutrient sets it', () => {
    const water = resourcesAt({ ...multiplesOfHalfSaturation(20), iron: nutrientsDefaults.halfSaturation.iron });
    expect(calculateNutrientSufficiency(mirroredPools(water), 'monte_carlo')).toBeCloseTo(
      nutrientShare(nutrientsDefaults.halfSaturation.iron, 'monte_carlo', 'iron'),
      10
    );
  });

  it('asks less of a low-demand plant than a high-demand one on the same water', () => {
    const lean = mirroredPools(resourcesAt(multiplesOfHalfSaturation(1)));
    expect(calculateNutrientSufficiency(lean, 'java_fern')).toBeGreaterThan(
      calculateNutrientSufficiency(lean, 'monte_carlo')
    );
  });

  it('reads every species on all four nutrients, and none on pools that hold none of one', () => {
    for (const species of ['java_fern', 'amazon_sword', 'monte_carlo'] as const) {
      for (const n of NUTRIENTS) {
        expect(speciesDemand(species)[n]).toBeGreaterThan(0);
        const without = resourcesAt({ ...multiplesOfHalfSaturation(10), [n]: 0 });
        expect(calculateNutrientSufficiency(mirroredPools(without), species)).toBe(0);
      }
    }
  });

  it('rises smoothly with supply rather than stepping at a threshold', () => {
    const at = (multiple: number): number =>
      calculateNutrientSufficiency(mirroredPools(resourcesAt(multiplesOfHalfSaturation(multiple))), 'monte_carlo');
    const steps = [0.25, 0.5, 1, 2, 4, 8].map(at);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
    expect(at(1)).toBeCloseTo(0.5, 10);
  });
});

describe('where a plant feeds', () => {
  it('weights each pool’s share by its growth form’s root share: a sword leans on the bed, a carpet and a fern on the water alone', () => {
    const pools = poolsAt(1, 5);
    for (const species of ['amazon_sword', 'monte_carlo', 'java_fern'] as const) {
      const roots = growthFormOf(species).rootShare;
      const water = nutrientShares(pools[0], species);
      const bed = nutrientShares(pools[1], species);
      const shares = plantShares(poolDraws(pools, species));
      for (const n of NUTRIENTS) expect(shares[n]).toBeCloseTo(roots * bed[n] + (1 - roots) * water[n], 12);
    }
    expect(growthFormOf('amazon_sword').rootShare).toBeGreaterThan(0);
    expect(growthFormOf('monte_carlo').rootShare).toBe(0);
    expect(growthFormOf('java_fern').rootShare).toBe(0);
  });

  it('holds a sword on a bare bed under the deficiency edge however rich the water, and a tabbed bed lifts it past', () => {
    const edge = plantsDefaults.sufficiencyEdge;
    const bare = calculateNutrientSufficiency(poolsAt(1000, 0), 'amazon_sword');
    expect(bare).toBeCloseTo(1 - growthFormOf('amazon_sword').rootShare, 2);
    expect(bare).toBeLessThan(edge);
    expect(calculateNutrientSufficiency(poolsAt(1000, 1000), 'amazon_sword')).toBeGreaterThan(edge);
  });

  it('reads the bed against the tank’s capacity and the water against what is left of it', () => {
    const tank = createSimulation({ tankCapacity: 100, substrate: { type: 'aqua_soil' } });
    const evaporated = { ...tank, resources: { ...tank.resources, water: 60 } };
    const [water, bed] = tankPools(evaporated);
    expect(water.volume).toBe(60);
    expect(bed.volume).toBe(100);
    expect(bed.stock).toBe(evaporated.equipment.substrate.nutrients);
  });

  it('reads the bed against its own volume, as the water is read against its own', () => {
    const [water] = poolsAt(2, 0);
    const bed = { stock: water.stock, volume: WATER };
    expect(nutrientShares(bed, 'amazon_sword')).toEqual(nutrientShares(water, 'amazon_sword'));
    expect(nutrientShares({ ...bed, volume: 2 * WATER }, 'amazon_sword').nitrate).toBeLessThan(
      nutrientShares(bed, 'amazon_sword').nitrate
    );
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
  /** Grams of tissue a young plant's half-full bank buys in an hour. */
  const anHour = (species: PlantSpecies): number => {
    const young = createPlant({ species, size: MIN_PLANTABLE_SIZE, rng: createRng(1) });
    return tissueMass(species, sizeBought(purchase({ ...young, surplus: plantsDefaults.surplusCap / 2 })));
  };
  const need = (species: PlantSpecies, pools: TankPools, grams = anHour(species)): TissueNeed => ({
    grams,
    draws: poolDraws(pools, species),
  });
  const shares = ({ draws }: TissueNeed): NutrientVector => plantShares(draws);
  const total = (drawn: readonly NutrientVector[], n: (typeof NUTRIENTS)[number]): number =>
    drawn.reduce((sum, pool) => sum + pool[n], 0);

  it('takes every nutrient in the recipe’s ratio, across both pools, for exactly the tissue it supplied', () => {
    const pools = poolsAt(3, 2);
    const needs = [need('monte_carlo', pools, 0.5), need('amazon_sword', pools, 0.4), need('anubias', pools, 0.2)];
    const { supplied, drawn } = drawTissue(needs, pools, recipe);
    const grams = needs.reduce((sum, n, i) => sum + n.grams * supplied[i], 0);
    for (const n of NUTRIENTS) expect(total(drawn, n)).toBeCloseTo(grams * recipe[n], 12);
  });

  it('supplies a lone water feeder its scarcest nutrient’s monodUptake share of its tissue', () => {
    const pools = mirroredPools(resourcesAt(multiplesOfHalfSaturation(0.5)));
    const { supplied } = drawTissue([need('monte_carlo', pools, 0.5)], pools, recipe);
    const met = NUTRIENTS.map(
      (n) =>
        monodUptake(pools[0].stock[n], 0.5 * recipe[n], speciesHalfSaturation('monte_carlo', n) * WATER) /
        (0.5 * recipe[n])
    );
    expect(supplied[0]).toBeCloseTo(Math.min(...met), 12);
  });

  it('meets every request of an hour’s growth on dosed water, so a plant grows at its own sufficiency', () => {
    const pools = poolsAt(10, 10);
    const needs = [need('monte_carlo', pools), need('amazon_sword', pools), need('anubias', pools)];
    const { supplied } = drawTissue(needs, pools, recipe);
    needs.forEach((n, i) => expect(supplied[i]).toBeCloseTo(liebig(shares(n)), 3));
  });

  it('meets two plants short of the same nutrient at the same fraction of their shares', () => {
    const water = resourcesAt({ ...multiplesOfHalfSaturation(100), phosphate: 0.05 * nutrientsDefaults.halfSaturation.phosphate });
    const pools = mirroredPools(water);
    const needs = [need('monte_carlo', pools, 1), need('anubias', pools, 1)];
    const { supplied } = drawTissue(needs, pools, recipe);
    expect(supplied[0]).toBeLessThan(shares(needs[0]).phosphate);
    expect(supplied[0] / supplied[1]).toBeCloseTo(shares(needs[0]).phosphate / shares(needs[1]).phosphate, 12);
  });

  it('slows as the water thins, never quite stopping, and nears full supply in rich water', () => {
    const share = (multiple: number): number => {
      const pools = mirroredPools(resourcesAt(multiplesOfHalfSaturation(multiple)));
      return drawTissue([need('java_fern', pools, 0.5)], pools, recipe).supplied[0];
    };
    const shares = [0.01, 0.1, 1, 10, 1000].map(share);
    for (let i = 1; i < shares.length; i++) expect(shares[i]).toBeGreaterThan(shares[i - 1]);
    expect(shares[0]).toBeGreaterThan(0);
    expect(shares[shares.length - 1]).toBeGreaterThan(0.99);
  });

  it('keeps a lean species growing on water a hungry one starves on', () => {
    const pools = mirroredPools(resourcesAt(multiplesOfHalfSaturation(0.05)));
    const { supplied } = drawTissue([need('anubias', pools, 0.5), need('monte_carlo', pools, 0.5)], pools, recipe);
    expect(supplied[0]).toBeGreaterThan(supplied[1]);
  });

  it('never supplies a plant more than its sufficiency', () => {
    for (const multiple of [0.01, 1, 100]) {
      const pools = poolsAt(multiple, multiple / 2);
      const needs = [need('anubias', pools, 3), need('amazon_sword', pools), need('java_fern', pools, 0.01)];
      const { supplied } = drawTissue(needs, pools, recipe);
      needs.forEach((n, i) => expect(supplied[i]).toBeLessThanOrEqual(liebig(shares(n))));
    }
  });

  it('splits a root feeder’s draw between the pools as each met it, and takes nothing from a bed it doesn’t root in', () => {
    const pools = poolsAt(2, 2);
    const sword = drawTissue([need('amazon_sword', pools)], pools, recipe).drawn;
    const roots = growthFormOf('amazon_sword').rootShare;
    for (const n of NUTRIENTS) expect(sword[1][n] / total(sword, n)).toBeCloseTo(roots, 3);

    const carpet = drawTissue([need('monte_carlo', pools)], pools, recipe).drawn;
    expect(carpet[1]).toEqual(ZERO_NUTRIENTS);
  });

  it('never draws a pool past what it holds, however large the crowd or the lump', () => {
    for (const multiple of [1e-6, 0.1, 10]) {
      const pools = poolsAt(multiple, multiple);
      const crowd = Array.from({ length: 500 }, (_, i) => need(i % 2 ? 'monte_carlo' : 'amazon_sword', pools, 5));
      for (const needs of [crowd, [need('amazon_sword', pools, 1000)]]) {
        const { drawn, supplied } = drawTissue(needs, pools, recipe);
        pools.forEach((pool, p) => {
          for (const n of NUTRIENTS) expect(drawn[p][n]).toBeLessThanOrEqual(pool.stock[n]);
        });
        for (const share of supplied) expect(share).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('is never held back by a nutrient its recipe carries none of', () => {
    const ironless = { ...recipe, iron: 0 };
    const pools = mirroredPools(resourcesAt({ ...multiplesOfHalfSaturation(2), iron: 0 }));
    const { supplied, drawn } = drawTissue([need('monte_carlo', pools)], pools, ironless);
    expect(supplied[0]).toBeGreaterThan(0);
    expect(total(drawn, 'iron')).toBe(0);
  });

  it('supplies a water feeder nothing and draws nothing with no water', () => {
    const pools = mirroredPools({ ...resourcesAt(multiplesOfHalfSaturation(2)), water: 0 });
    const { supplied, drawn } = drawTissue([need('java_fern', pools)], pools, recipe);
    expect(supplied).toEqual([0]);
    expect(drawn).toEqual([ZERO_NUTRIENTS, ZERO_NUTRIENTS]);
  });

  it('supplies a root feeder nothing and leaves its charged bed whole in a dry tank', () => {
    const [water, bed] = poolsAt(2, 2);
    const pools: TankPools = [{ ...water, volume: 0 }, bed];
    const { supplied, drawn } = drawTissue([need('amazon_sword', pools)], pools, recipe);
    expect(supplied).toEqual([0]);
    expect(drawn).toEqual([ZERO_NUTRIENTS, ZERO_NUTRIENTS]);
  });
});

describe('ghDrawn', () => {
  it('draws calcium and magnesium on their own Monod, off the nitrate the tissue drew', () => {
    for (const gh of [0, 0.01, 10000]) {
      const water = { gh, water: WATER };
      expect(ghDrawn(50, water)).toBeCloseTo(monodUptake(gh, 50 * GH_PER_NITRATE_DRAWN, GH_HALF_SATURATION * WATER), 12);
      expect(ghDrawn(50, water)).toBeLessThanOrEqual(gh);
    }
  });
});

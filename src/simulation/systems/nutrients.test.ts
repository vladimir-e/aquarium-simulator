import { describe, it, expect } from 'vitest';
import { NO_ORGANICS } from '../core/organics.js';
import {
  bedPool,
  drawNutrients,
  formShares,
  ghDrawn,
  GH_HALF_SATURATION,
  leach,
  GH_PER_NITRATE_DRAWN,
  nutrientsIn,
  plantFeeder,
  poolDraws,
  speciesDemand,
  tankPools,
  uptakeAlkalinity,
  type NutrientRequest,
  type TankPools,
} from './nutrients.js';
import {
  demandMeta,
  FORMS_OF,
  mapForms,
  mapNutrients,
  NUTRIENT_FORMS,
  NUTRIENT_OF,
  NUTRIENTS,
  nutrientsDefaults,
  ZERO_FORMS,
  type FormVector,
  type NutrientVector,
} from '../config/nutrients.js';
import { CACO3_PER_EQUIVALENT, MW_NH3, MW_NO3, NO2_TO_NO3_MASS_RATIO } from '../core/chemistry.js';
import { calculateAmmoniaToNitrite } from './nitrogen-cycle.js';
import { monodUptake } from '../core/kinetics.js';
import { createSimulation, type Resources } from '../state.js';
import { growthFormOf, type PlantSpecies } from '../plants/species.js';
import { mirroredPools } from '../tests/pools.js';

const WATER = 40;

function resourcesAt(ppm: Partial<FormVector>): Resources {
  return {
    water: WATER,
    temperature: 25,
    surface: 1000,
    flow: 100,
    light: 0,
    lightByHour: new Array(24).fill(0),
    aeration: false,
    food: NO_ORGANICS,
    waste: NO_ORGANICS,
    ammonia: (ppm.ammonia ?? 0) * WATER,
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

/** Every nutrient at this multiple of its full half-saturation, and no ammonia. */
const multiplesOfHalfSaturation = (multiple: number): NutrientVector =>
  mapNutrients((n) => nutrientsDefaults.halfSaturation[n] * multiple);

/** ppm at which a species takes a form at half its need for the nutrient the form carries. */
const halfSaturation = (species: PlantSpecies, form: (typeof NUTRIENT_FORMS)[number]): number =>
  plantFeeder(species).halfSaturation[form];

/** Share of a species' need for each form's nutrient that this water's forms each meet on their own. */
const sharesIn = (water: Resources, species: PlantSpecies, config = nutrientsDefaults): FormVector =>
  formShares({ stock: water, volume: water.water }, plantFeeder(species, config));

describe('a feeder’s half-saturations', () => {
  it('meets half the need at the species half-saturation', () => {
    const k = halfSaturation('monte_carlo', 'phosphate');
    expect(sharesIn(resourcesAt({ phosphate: k }), 'monte_carlo').phosphate).toBeCloseTo(0.5, 10);
  });

  it('saturates: each doubling buys less, and it never passes 1', () => {
    const at = (ppm: number): number => sharesIn(resourcesAt({ nitrate: ppm }), 'monte_carlo').nitrate;
    expect(at(2) - at(1)).toBeGreaterThan(at(4) - at(2));
    expect(at(1000)).toBeLessThan(1);
    expect(at(1000)).toBeGreaterThan(0.99);
  });

  it('scales every form’s half-saturation by the species’ demand for the nutrient it carries', () => {
    for (const f of NUTRIENT_FORMS) {
      expect(halfSaturation('amazon_sword', f)).toBeCloseTo(
        speciesDemand('amazon_sword')[NUTRIENT_OF[f]] * nutrientsDefaults.halfSaturation[f],
        12
      );
    }
  });

  it('has no cliff as demand falls to its floor: the same trace meets a smaller need more fully, and none meets none', () => {
    const at = (ppm: number, iron: number): number =>
      sharesIn(resourcesAt({ iron: ppm }), 'monte_carlo', {
        ...nutrientsDefaults,
        demand: { ...nutrientsDefaults.demand, high: { ...nutrientsDefaults.demand.high, iron } },
      }).iron;
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

describe('where a plant feeds', () => {
  it('weights each pool by its growth form’s root share, at the share each pool’s forms meet: a sword and a carpet draw on the bed, a fern on the water alone', () => {
    const pools = poolsAt(1, 5);
    for (const species of ['amazon_sword', 'monte_carlo', 'java_fern'] as const) {
      const roots = growthFormOf(species).rootShare;
      const [water, bed] = poolDraws(pools, plantFeeder(species));
      expect(water).toEqual({ weight: 1 - roots, shares: formShares(pools[0], plantFeeder(species)) });
      expect(bed).toEqual({ weight: roots, shares: formShares(pools[1], plantFeeder(species)) });
    }
    expect(growthFormOf('amazon_sword').rootShare).toBeGreaterThan(0);
    expect(growthFormOf('java_fern').rootShare).toBe(0);
  });

  it('feeds nothing from either pool in a dry tank, however charged its bed', () => {
    const [water, bed] = poolsAt(10, 10);
    const draws = poolDraws([{ ...water, volume: 0 }, bed], plantFeeder('amazon_sword'));
    expect(draws.map((draw) => draw.weight)).toEqual([0, 0]);
  });

  it('holds a sword on a bare bed to the water’s share of its ask however rich the water, and a charged bed lifts it past', () => {
    const met = (pools: TankPools): NutrientVector => {
      const asked = mapNutrients(() => 1e-6);
      const [delivered] = drawNutrients([{ asked, draws: poolDraws(pools, plantFeeder('amazon_sword')) }], pools).delivered;
      return mapNutrients((n) => delivered[n] / asked[n]);
    };
    const water = 1 - growthFormOf('amazon_sword').rootShare;
    for (const n of NUTRIENTS) {
      expect(met(poolsAt(1000, 0))[n]).toBeCloseTo(water, 2);
      expect(met(poolsAt(1000, 1000))[n]).toBeGreaterThan(water);
    }
  });

  it('reads the bed against the tank’s capacity and the water against what is left of it', () => {
    const tank = createSimulation({ tankCapacity: 100, substrate: { type: 'aqua_soil' } });
    const evaporated = { ...tank, resources: { ...tank.resources, water: 60 } };
    const [water, bed] = tankPools(evaporated);
    expect(water.volume).toBe(60);
    expect(bed.volume).toBe(100);
    expect(bed.stock).toEqual({ ...evaporated.equipment.substrate.nutrients, ammonia: 0 });
  });

  it('reads the bed against its own volume, as the water is read against its own', () => {
    const [water] = poolsAt(2, 0);
    const bed = { stock: water.stock, volume: WATER };
    const sword = plantFeeder('amazon_sword');
    expect(formShares(bed, sword)).toEqual(formShares(water, sword));
    expect(formShares({ ...bed, volume: 2 * WATER }, sword).nitrate).toBeLessThan(formShares(bed, sword).nitrate);
  });
});

describe('nitrogen in two forms', () => {
  const K = (form: 'ammonia' | 'nitrate'): number => halfSaturation('java_fern', form);
  /** Water rich in everything but nitrogen, which it holds at these multiples of the fern's own half-saturations. */
  const nitrogenAt = (ammonia: number, nitrate: number): TankPools =>
    mirroredPools(
      resourcesAt({ ...multiplesOfHalfSaturation(1000), ammonia: ammonia * K('ammonia'), nitrate: nitrate * K('nitrate') })
    );
  const feed = (species: PlantSpecies, pools: TankPools, nitrogen: number): NutrientRequest => ({
    asked: { ...mapNutrients(() => 0), nitrate: nitrogen },
    draws: poolDraws(pools, plantFeeder(species)),
  });
  const fern = (pools: TankPools, nitrogen: number): NutrientRequest => feed('java_fern', pools, nitrogen);

  it('feeds a plant on either form alone, and better on both', () => {
    const nitrogen = (pools: TankPools): number => drawNutrients([fern(pools, 1e-6)], pools).delivered[0].nitrate / 1e-6;
    expect(nitrogen(nitrogenAt(1, 0))).toBeCloseTo(0.5, 6);
    expect(nitrogen(nitrogenAt(0, 1))).toBeCloseTo(0.5, 6);
    expect(nitrogen(nitrogenAt(1, 1))).toBeCloseTo(0.75, 6);
    expect(nitrogen(nitrogenAt(0, 0))).toBe(0);
  });

  it('takes a lone feeder’s nitrogen from ammonia at the share ammonia meets, and from nitrate for the rest nitrate meets', () => {
    const pools = nitrogenAt(1, 3);
    const [[water]] = drawNutrients([fern(pools, 1e-6)], pools).uptake;
    const fromAmmonia = nutrientsIn({ ...ZERO_FORMS, ammonia: water.ammonia }).nitrate;
    const a = 0.5;
    const b = 0.75;
    expect(fromAmmonia / (fromAmmonia + water.nitrate)).toBeCloseTo(a / (a + (1 - a) * b), 4);
  });

  it('asks nitrate for the nitrogen an ammonia pool too small for the hour could not deliver', () => {
    const lump = 500;
    const pools = nitrogenAt(10, 1000);
    const draw = drawNutrients([fern(pools, lump)], pools);
    expect(nutrientsIn({ ...ZERO_FORMS, ammonia: pools[0].stock.ammonia }).nitrate).toBeLessThan(0.1 * lump);
    const nitrateOnly = nitrogenAt(0, 1000);
    expect(draw.delivered[0].nitrate).toBeCloseTo(drawNutrients([fern(nitrateOnly, lump)], nitrateOnly).delivered[0].nitrate, 0);
  });

  it('carries the same nitrogen whichever form it arrives in', () => {
    expect(nutrientsIn({ ...ZERO_FORMS, ammonia: MW_NH3 }).nitrate).toBeCloseTo(MW_NO3, 12);
    const pools = nitrogenAt(2, 2);
    const draw = drawNutrients([fern(pools, 20), feed('monte_carlo', pools, 15)], pools);
    draw.uptake.forEach((feeder, i) => {
      const nitrogen = feeder.reduce((sum, pool) => sum + nutrientsIn(pool).nitrate, 0);
      expect(nitrogen).toBeCloseTo(draw.delivered[i].nitrate, 10);
    });
  });

  it('holds no ammonia in the bed, so roots take their nitrogen there as nitrate', () => {
    const tank = createSimulation({ tankCapacity: 100, substrate: { type: 'aqua_soil' } });
    const pools = tankPools({ ...tank, resources: { ...tank.resources, ammonia: 50 } });
    expect(pools[1]).toEqual(bedPool(tank.equipment.substrate.nutrients, 100));
    const [[water, bed]] = drawNutrients([feed('amazon_sword', pools, 25)], pools).uptake;
    expect(water.ammonia).toBeGreaterThan(0);
    expect(bed.ammonia).toBe(0);
  });

  it('never draws ammonia past what the water holds, however large the crowd or the lump', () => {
    for (const multiple of [1e-6, 0.1, 10]) {
      const pools = nitrogenAt(multiple, multiple);
      const crowd = Array.from({ length: 200 }, () => fern(pools, 250));
      for (const requests of [crowd, [fern(pools, 50000)]]) {
        const ammonia = drawNutrients(requests, pools).uptake.reduce((sum, [water]) => sum + water.ammonia, 0);
        expect(ammonia).toBeLessThanOrEqual(pools[0].stock.ammonia);
      }
    }
  });
});

describe('drawNutrients', () => {
  /** mg of each nutrient a store of each species asks in an hour, at these multiples of a reference ask. */
  const ASK: NutrientVector = { nitrate: 20, phosphate: 2, potassium: 10, iron: 0.05 };
  const request = (species: PlantSpecies, pools: TankPools, scale = 1): NutrientRequest => ({
    asked: mapNutrients((n) => scale * ASK[n]),
    draws: poolDraws(pools, plantFeeder(species)),
  });
  /** Share of each nutrient's need its pools meet: each pool's forms in turn, weighted by where it feeds. */
  const shares = ({ draws }: NutrientRequest): NutrientVector =>
    mapNutrients((n) =>
      draws.reduce((sum, { weight, shares }) => sum + weight * (1 - FORMS_OF[n].reduce((unmet, f) => unmet * (1 - shares[f]), 1)), 0)
    );
  /** Share of its ask each nutrient arrived at. */
  const met = (delivered: NutrientVector, { asked }: NutrientRequest): NutrientVector =>
    mapNutrients((n) => (asked[n] > 0 ? delivered[n] / asked[n] : 0));
  /** mg of each form every feeder together took from each pool. */
  const pooled = ({ uptake }: { uptake: readonly (readonly FormVector[])[] }): FormVector[] =>
    [0, 1].map((p) => mapForms((f) => uptake.reduce((sum, feeder) => sum + feeder[p][f], 0)));
  /** mg of a nutrient, as the recipe counts it, taken across both pools. */
  const total = (drawn: readonly FormVector[], n: (typeof NUTRIENTS)[number]): number =>
    drawn.reduce((sum, pool) => sum + nutrientsIn(pool)[n], 0);

  it('takes out of the pools exactly what it delivers, nutrient by nutrient', () => {
    const pools = poolsAt(3, 2);
    const requests = [request('monte_carlo', pools, 0.5), request('amazon_sword', pools, 0.4), request('anubias', pools, 0.2)];
    const draw = drawNutrients(requests, pools);
    const drawn = pooled(draw);
    for (const n of NUTRIENTS) {
      expect(total(drawn, n)).toBeCloseTo(draw.delivered.reduce((sum, delivered) => sum + delivered[n], 0), 12);
    }
  });

  it('delivers a lone water feeder each nutrient’s monodUptake share of its ask', () => {
    const pools = mirroredPools(resourcesAt(multiplesOfHalfSaturation(0.5)));
    const fern = request('java_fern', pools);
    const [delivered] = drawNutrients([fern], pools).delivered;
    for (const n of ['phosphate', 'potassium', 'iron'] as const) {
      expect(delivered[n]).toBeCloseTo(monodUptake(pools[0].stock[n], ASK[n], halfSaturation('java_fern', n) * WATER), 12);
    }
  });

  it('meets an hour’s ask on dosed water at the feeder’s own share of each nutrient', () => {
    const pools = poolsAt(10, 10);
    const requests = [request('monte_carlo', pools, 0.01), request('amazon_sword', pools, 0.01), request('anubias', pools, 0.01)];
    const { delivered } = drawNutrients(requests, pools);
    requests.forEach((r, i) => {
      const got = met(delivered[i], r);
      for (const n of NUTRIENTS) expect(got[n]).toBeCloseTo(shares(r)[n], 3);
    });
  });

  it('serves no feeder before another: the order of the requests only orders the delivery', () => {
    const pools = poolsAt(0.3, 0.2);
    const requests = [request('monte_carlo', pools, 50), request('amazon_sword', pools, 50), request('anubias', pools, 25)];
    const forward = drawNutrients(requests, pools).delivered;
    const backward = drawNutrients([...requests].reverse(), pools).delivered.reverse();
    forward.forEach((delivered, i) => {
      for (const n of NUTRIENTS) expect(backward[i][n]).toBeCloseTo(delivered[n], 12);
    });
  });

  it('meets two feeders short of the same nutrient at the same fraction of their shares', () => {
    const water = resourcesAt({ ...multiplesOfHalfSaturation(100), phosphate: 0.05 * nutrientsDefaults.halfSaturation.phosphate });
    const pools: TankPools = [mirroredPools(water)[0], { stock: ZERO_FORMS, volume: WATER }];
    const requests = [request('monte_carlo', pools, 50), request('anubias', pools, 50)];
    const [a, b] = drawNutrients(requests, pools).delivered.map((delivered, i) => met(delivered, requests[i]).phosphate);
    expect(a).toBeLessThan(shares(requests[0]).phosphate);
    expect(a / b).toBeCloseTo(shares(requests[0]).phosphate / shares(requests[1]).phosphate, 12);
  });

  it('slows as the water thins, never quite stopping, and nears the whole ask in rich water', () => {
    const share = (multiple: number): number => {
      const pools = mirroredPools(resourcesAt(multiplesOfHalfSaturation(multiple)));
      const fern = request('java_fern', pools);
      return met(drawNutrients([fern], pools).delivered[0], fern).phosphate;
    };
    const shares = [0.01, 0.1, 1, 10, 1000].map(share);
    for (let i = 1; i < shares.length; i++) expect(shares[i]).toBeGreaterThan(shares[i - 1]);
    expect(shares[0]).toBeGreaterThan(0);
    expect(shares[shares.length - 1]).toBeGreaterThan(0.99);
  });

  it('never delivers a feeder more of a nutrient than its share of its ask', () => {
    for (const multiple of [0.01, 1, 100]) {
      const pools = poolsAt(multiple, multiple / 2);
      const requests = [request('anubias', pools, 150), request('amazon_sword', pools), request('java_fern', pools, 0.5)];
      const { delivered } = drawNutrients(requests, pools);
      requests.forEach((r, i) => {
        for (const n of NUTRIENTS) expect(met(delivered[i], r)[n]).toBeLessThanOrEqual(shares(r)[n] + 1e-12);
      });
    }
  });

  it('splits a root feeder’s draw between the pools as each met it, and takes nothing from a bed it doesn’t root in', () => {
    const pools = poolsAt(2, 2);
    for (const species of ['amazon_sword', 'monte_carlo'] as const) {
      const drawn = pooled(drawNutrients([request(species, pools, 0.01)], pools));
      const roots = growthFormOf(species).rootShare;
      for (const n of NUTRIENTS) expect(drawn[1][n] / total(drawn, n)).toBeCloseTo(roots, 3);
    }

    const fern = pooled(drawNutrients([request('java_fern', pools)], pools));
    expect(fern[1]).toEqual(ZERO_FORMS);
  });

  it('never draws a pool past what it holds, however large the crowd or the lump', () => {
    for (const multiple of [1e-6, 0.1, 10]) {
      const pools = poolsAt(multiple, multiple);
      const crowd = Array.from({ length: 500 }, (_, i) => request(i % 2 ? 'monte_carlo' : 'amazon_sword', pools, 250));
      for (const requests of [crowd, [request('amazon_sword', pools, 50000)]]) {
        const draw = drawNutrients(requests, pools);
        const drawn = pooled(draw);
        pools.forEach((pool, p) => {
          for (const f of NUTRIENT_FORMS) expect(drawn[p][f]).toBeLessThanOrEqual(pool.stock[f]);
        });
        for (const delivered of draw.delivered) for (const n of NUTRIENTS) expect(delivered[n]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('delivers nothing of a nutrient nobody asks for', () => {
    const pools = mirroredPools(resourcesAt(multiplesOfHalfSaturation(2)));
    const ironless: NutrientRequest = { ...request('monte_carlo', pools), asked: { ...ASK, iron: 0 } };
    const draw = drawNutrients([ironless], pools);
    expect(draw.delivered[0].phosphate).toBeGreaterThan(0);
    expect(total(pooled(draw), 'iron')).toBe(0);
  });

  it('delivers a water feeder nothing and draws nothing with no water', () => {
    const pools = mirroredPools({ ...resourcesAt(multiplesOfHalfSaturation(2)), water: 0 });
    const draw = drawNutrients([request('java_fern', pools)], pools);
    expect(draw.delivered).toEqual([mapNutrients(() => 0)]);
    expect(pooled(draw)).toEqual([ZERO_FORMS, ZERO_FORMS]);
  });

  it('delivers a root feeder nothing and leaves its charged bed whole in a dry tank', () => {
    const [water, bed] = poolsAt(2, 2);
    const pools: TankPools = [{ ...water, volume: 0 }, bed];
    const draw = drawNutrients([request('amazon_sword', pools)], pools);
    expect(draw.delivered).toEqual([mapNutrients(() => 0)]);
    expect(pooled(draw)).toEqual([ZERO_FORMS, ZERO_FORMS]);
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

describe('uptakeAlkalinity', () => {
  it('spends an equivalent per mole of nitrogen taken as ammonia and returns one per mole taken as nitrate', () => {
    expect(uptakeAlkalinity({ ...ZERO_FORMS, ammonia: MW_NH3 })).toBeCloseTo(-CACO3_PER_EQUIVALENT, 10);
    expect(uptakeAlkalinity({ ...ZERO_FORMS, nitrate: MW_NO3 })).toBeCloseTo(CACO3_PER_EQUIVALENT, 10);
    expect(uptakeAlkalinity({ ...ZERO_FORMS, phosphate: 5, potassium: 5, iron: 5 })).toBe(0);
  });

  it('moves as much on ammonia taken directly as on ammonia nitrified and taken as nitrate', () => {
    const nitrified = calculateAmmoniaToNitrite(3, 100, 1e6, 25, 8);
    const nitrate = nitrified.nitriteProduced * NO2_TO_NO3_MASS_RATIO;

    expect(nitrified.ammoniaConsumed).toBeGreaterThan(0);
    expect(uptakeAlkalinity({ ...ZERO_FORMS, nitrate }) + nitrified.alkalinityMoved).toBeCloseTo(
      uptakeAlkalinity({ ...ZERO_FORMS, ammonia: nitrified.ammoniaConsumed }),
      10
    );
  });
});

describe('leach', () => {
  const total = (leachate: NutrientVector, resource: string): number =>
    leach(leachate)
      .filter((effect) => effect.resource === resource)
      .reduce((sum, effect) => sum + (effect.delta as number), 0);

  it('puts every nutrient back in the water, its nitrogen as nitrate, and undoes the KH that nitrate’s uptake moved', () => {
    const leachate = { nitrate: 12, phosphate: 1, potassium: 4, iron: 0.1 };
    for (const n of NUTRIENTS) expect(total(leachate, n)).toBe(leachate[n]);
    expect(total(leachate, 'kh')).toBeCloseTo(-uptakeAlkalinity({ ...ZERO_FORMS, nitrate: 12 }), 12);
    expect(leach(leachate).every((effect) => effect.source === 'leaching')).toBe(true);
  });

  it('moves nothing when nothing leaches', () => {
    expect(leach(mapNutrients(() => 0))).toEqual([]);
  });
});

import { beforeAll, describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { createSimulation, type Fish, type SimulationState } from '../state.js';
import { tick } from '../tick.js';
import { applyAction } from '../actions/index.js';
import { DEFAULT_CONFIG, configRange, withTunable, type TunableConfig } from '../config/index.js';
import { nitrogenCycleDefaults } from '../config/nitrogen-cycle.js';
import { NUTRIENTS, WASTE_NUTRIENTS, type WasteNutrient } from '../config/nutrients.js';
import { CACO3_PER_EQUIVALENT, MW_N, MW_NH3, MW_NO2, MW_NO3 } from '../core/chemistry.js';
import { tissueMass } from '../systems/plant-lifecycle.js';
import { ALGAE, ALGAE_KINDS, bloomTissue, habitatSize } from '../algae/index.js';
import { purchase } from '../systems/plant-growth.js';
import { nutrientShare, organicNutrients } from '../systems/nutrients.js';
import { freshSubstrate } from '../equipment/substrate.js';
import { getPpm } from '../resources/index.js';
import { plantRecord } from './plant.js';
import { leaves, nonFinitePaths } from './leaves.js';
// The scenario setups are the shared definition of a real tank, so the engine invariants run over them.
import { SETUPS, type Setup } from '../../cli/scenarios/setups.js';
import { keepTank } from '../../cli/scenarios/run.js';

function run(state: SimulationState, hours: number, config = DEFAULT_CONFIG): SimulationState {
  let running = state;
  for (let hour = 0; hour < hours; hour++) running = tick(running, config);
  return running;
}

/** Grams of tissue every kind of bloom holds, over its own habitat. */
function bloomsTissue(state: SimulationState): number {
  return ALGAE_KINDS.reduce(
    (sum, kind) => sum + bloomTissue(state.algae[kind].mass, habitatSize(ALGAE[kind].habitat, state), ALGAE[kind]),
    0
  );
}

/** Grams of organic matter in the tank: food, waste, the bed's reserve, plant tissue and the blooms'. */
function organics(state: SimulationState): number {
  const { resources, equipment, plants } = state;
  const tissue = plants.reduce((sum, plant) => sum + tissueMass(plant.species, plant.size), 0);
  return resources.food + resources.waste + equipment.substrate.organicReserve + tissue + bloomsTissue(state);
}

/** Nitrogen in the water column, dissolved, mg as N. */
function dissolvedNitrogen({ resources }: SimulationState): number {
  const { ammonia, nitrite, nitrate } = resources;
  return (ammonia / MW_NH3 + nitrite / MW_NO2 + nitrate / MW_NO3) * MW_N;
}

const SEEDED = { mass: 5, condition: 100, surplus: 0 };

function nitrogenInPools(state: SimulationState): number {
  const { ammonia, nitrite, nitrate } = state.resources;
  const bed = state.equipment.substrate.nutrients.nitrate;
  return (
    organics(state) * DEFAULT_CONFIG.livestock.foodNitrogenFraction +
    ((ammonia / MW_NH3 + nitrite / MW_NO2 + (nitrate + bed) / MW_NO3) * MW_N) / 1000
  );
}

function mineralsInPools(state: SimulationState, n: WasteNutrient): number {
  return (
    organics(state) * DEFAULT_CONFIG.nutrients.foodMineralContent[n] +
    state.resources[n] +
    state.equipment.substrate.nutrients[n]
  );
}

function alkalinityNetOfNitrogen({ resources, equipment }: SimulationState): number {
  const { kh, ammonia, nitrite, nitrate } = resources;
  const charge = ammonia / MW_NH3 - nitrite / MW_NO2 - (nitrate + equipment.substrate.nutrients.nitrate) / MW_NO3;
  return kh - charge * CACO3_PER_EQUIVALENT;
}

function tetra(id: string): Fish {
  return {
    id,
    species: 'neon_tetra',
    mass: 0.5,
    health: 100,
    age: 0,
    satiation: 50,
    sex: 'male',
    stage: 'adult',
    hardinessOffset: 0,
    surplus: 0,
  };
}

function cycledBareTank(tankCapacity = 150): SimulationState {
  const state = createSimulation({ tankCapacity });
  const colony = state.resources.surface * nitrogenCycleDefaults.bacteriaPerCm2;
  return produce(state, (draft) => {
    draft.resources.aob = colony;
    draft.resources.nob = colony;
  });
}

const keep = (setup: Setup, days: number): SimulationState =>
  keepTank(setup, { config: DEFAULT_CONFIG, untilTick: days * 24 });

describe('nitrogen mass', () => {
  it('is conserved through NH3 → NO2 → NO3', () => {
    const start = produce(cycledBareTank(), (draft) => {
      draft.resources.ammonia = 50;
    });
    const end = run(start, 1000);

    expect(end.resources.ammonia + end.resources.nitrite).toBeLessThan(1);
    expect(nitrogenInPools(end) / nitrogenInPools(start)).toBeCloseTo(1, 2);
  });

  it('is conserved through waste mineralization and the chain', () => {
    const start = produce(cycledBareTank(), (draft) => {
      draft.resources.waste = 10;
    });
    const end = run(start, 2000);

    expect(end.resources.waste).toBeLessThan(0.05);
    expect(nitrogenInPools(end) / nitrogenInPools(start)).toBeCloseTo(1, 2);
  });

  it('is conserved as uneaten food decays and its waste mineralizes', () => {
    const start = produce(cycledBareTank(), (draft) => {
      draft.resources.food = 5;
    });
    const end = run(start, 2000);

    expect(end.resources.food + end.resources.waste).toBeLessThan(0.05);
    expect(nitrogenInPools(end) / nitrogenInPools(start)).toBeCloseTo(1, 10);
  });

  it('is conserved through the bed, as waste settles in and leaches back out', () => {
    const start = produce(cycledBareTank(), (draft) => {
      draft.equipment.substrate.type = 'gravel';
      draft.resources.waste = 10;
    });
    const mid = run(start, 24);
    const end = run(mid, 2000);

    expect(mid.equipment.substrate.organicReserve).toBeGreaterThan(0);
    expect(nitrogenInPools(mid) / nitrogenInPools(start)).toBeCloseTo(1, 2);
    expect(nitrogenInPools(end) / nitrogenInPools(start)).toBeCloseTo(1, 2);
  });
});

describe('mineral mass', () => {
  function expectConserved(start: SimulationState, end: SimulationState): void {
    for (const n of WASTE_NUTRIENTS) {
      expect(mineralsInPools(end, n) / mineralsInPools(start, n)).toBeCloseTo(1, 6);
    }
  }

  it('is conserved as uneaten food decays and its waste mineralizes', () => {
    const start = produce(cycledBareTank(), (draft) => {
      draft.resources.food = 5;
    });
    const end = run(start, 2000);

    expect(end.resources.food + end.resources.waste).toBeLessThan(0.05);
    expectConserved(start, end);
  });

  it('is conserved through the bed, as waste settles in and leaches back out', () => {
    const start = produce(cycledBareTank(), (draft) => {
      draft.equipment.substrate.type = 'gravel';
      draft.resources.waste = 10;
    });
    const mid = run(start, 24);
    const end = run(mid, 2000);

    expect(mid.equipment.substrate.organicReserve).toBeGreaterThan(0);
    expectConserved(start, mid);
    expectConserved(start, end);
  });

  it('is conserved through the fish that eat the food', () => {
    const start = produce(cycledBareTank(), (draft) => {
      draft.fish = [tetra('a'), tetra('b'), tetra('c')];
      draft.resources.food = 0.5;
    });
    const end = run(start, 48);

    expect(end.fish).toHaveLength(3);
    expectConserved(start, end);
  });
});

describe('a planting over a charged bed', () => {
  const GROWING_DAYS = 10;
  const LIT_DAYS = 30;
  const BLACKOUT_DAYS = 90;
  let start: SimulationState;
  let growing: SimulationState;
  let grown: SimulationState;
  let dark: SimulationState;
  beforeAll(() => {
    start = produce(cycledBareTank(), (draft) => {
      draft.equipment.substrate = freshSubstrate('aqua_soil', draft.tank.capacity);
      draft.plants = (['java_fern', 'amazon_sword', 'monte_carlo', 'anubias'] as const).map((species) =>
        plantRecord({ id: species, species, size: 40, condition: 100, surplus: 0 })
      );
      draft.resources.nitrate = 10 * draft.resources.water;
      draft.resources.phosphate = 1 * draft.resources.water;
      draft.resources.potassium = 10 * draft.resources.water;
      draft.resources.iron = 0.2 * draft.resources.water;
    });
    growing = run(start, GROWING_DAYS * 24);
    grown = run(growing, (LIT_DAYS - GROWING_DAYS) * 24);
    dark = run(
      produce(grown, (draft) => {
        draft.equipment.light.enabled = false;
      }),
      BLACKOUT_DAYS * 24
    );
  });

  const tissue = (state: SimulationState): number =>
    state.plants.reduce((sum, plant) => sum + tissueMass(plant.species, plant.size), 0);

  it('grows under the lamp, the sword drawing the bed down past its leak', () => {
    const leakedOnly =
      start.equipment.substrate.nutrients.phosphate * (1 - DEFAULT_CONFIG.nutrients.bedLeakRate) ** (GROWING_DAYS * 24);
    expect(tissue(growing)).toBeGreaterThan(tissue(start));
    expect(growing.equipment.substrate.nutrients.phosphate).toBeLessThan(leakedOnly);
  });

  it('conserves nitrogen through the bed’s leak, growth, spores, shedding and death, the bloom drawing beside the plants', () => {
    for (const state of [growing, grown, dark]) {
      expect(nitrogenInPools(state) / nitrogenInPools(start)).toBeCloseTo(1, 10);
    }
  });

  it('conserves every mineral the same way', () => {
    for (const state of [growing, grown, dark]) {
      for (const n of WASTE_NUTRIENTS) expect(mineralsInPools(state, n) / mineralsInPools(start, n)).toBeCloseTo(1, 10);
    }
  });

  it('never takes a nutrient below zero or off the number line', () => {
    for (const state of [growing, grown, dark]) {
      for (const n of NUTRIENTS) {
        expect(state.resources[n]).toBeGreaterThanOrEqual(0);
        expect(state.equipment.substrate.nutrients[n]).toBeGreaterThanOrEqual(0);
      }
      expect(nonFinitePaths(state)).toEqual([]);
    }
  });
});

describe('blooms and their crash', () => {
  const LIT_DAYS = 10;
  const BLACKOUT_DAYS = 5;
  let start: SimulationState;
  let bloomed: SimulationState;
  let crashed: SimulationState;
  let peakAmmonia = 0;
  beforeAll(() => {
    start = produce(cycledBareTank(), (draft) => {
      for (const kind of ALGAE_KINDS) draft.algae[kind] = { ...SEEDED };
      draft.resources.nitrate = 10 * draft.resources.water;
      draft.resources.phosphate = 1 * draft.resources.water;
      draft.resources.potassium = 10 * draft.resources.water;
      draft.resources.iron = 0.2 * draft.resources.water;
    });
    bloomed = run(start, LIT_DAYS * 24);
    crashed = produce(bloomed, (draft) => {
      draft.equipment.light.enabled = false;
    });
    for (let hour = 0; hour < BLACKOUT_DAYS * 24; hour++) {
      crashed = tick(crashed);
      peakAmmonia = Math.max(peakAmmonia, crashed.resources.ammonia);
    }
  });

  it('grow on the water and die back in the dark, every kind, their tissue fouling the water', () => {
    const dieBacks = crashed.logs.slice(bloomed.logs.length).filter((log) => log.event === 'algae-died');
    expect(bloomsTissue(bloomed)).toBeGreaterThan(bloomsTissue(start));
    expect(bloomed.resources.nitrate).toBeLessThan(start.resources.nitrate);
    for (const kind of ALGAE_KINDS) {
      expect(dieBacks.some((log) => log.message.startsWith(ALGAE[kind].name))).toBe(true);
    }
    expect(peakAmmonia).toBeGreaterThan(bloomed.resources.ammonia);
  });

  it('conserves nitrogen and every mineral through the blooms and the crash', () => {
    for (const state of [bloomed, crashed]) {
      expect(nitrogenInPools(state) / nitrogenInPools(start)).toBeCloseTo(1, 10);
      for (const n of WASTE_NUTRIENTS) expect(mineralsInPools(state, n) / mineralsInPools(start, n)).toBeCloseTo(1, 10);
    }
  });
});

describe('a bloom fed on ammonia', () => {
  let start: SimulationState;
  let fed: SimulationState;
  beforeAll(() => {
    start = produce(createSimulation({ tankCapacity: 150 }), (draft) => {
      draft.algae.greenWater = { mass: 5, condition: 100, surplus: 20 };
      draft.resources.ammonia = 2 * draft.resources.water;
      draft.resources.phosphate = 1 * draft.resources.water;
      draft.resources.potassium = 10 * draft.resources.water;
      draft.resources.iron = 0.2 * draft.resources.water;
    });
    fed = run(start, 3 * 24);
  });

  it('builds the ammonia the water loses into its tissue, with no nitrate to take', () => {
    const tissueNitrogen = (state: SimulationState): number =>
      bloomsTissue(state) * DEFAULT_CONFIG.livestock.foodNitrogenFraction;
    const ammoniaNitrogen = (state: SimulationState): number => (state.resources.ammonia / MW_NH3) * MW_N / 1000;

    const gained = tissueNitrogen(fed) - tissueNitrogen(start);
    const lost = ammoniaNitrogen(start) - ammoniaNitrogen(fed);

    expect(start.resources.nitrate).toBe(0);
    expect(gained / lost).toBeCloseTo(1, 2);
  });

  it('conserves nitrogen through the ammonia it builds into tissue', () => {
    expect(nitrogenInPools(fed) / nitrogenInPools(start)).toBeCloseTo(1, 10);
  });
});

describe('alkalinity around the nitrogen loop', () => {
  const LIT_DAYS = 10;
  const BLACKOUT_DAYS = 5;
  let start: SimulationState;
  let lit: SimulationState;
  let dark: SimulationState;
  beforeAll(() => {
    start = produce(cycledBareTank(), (draft) => {
      draft.equipment.substrate = {
        ...freshSubstrate('gravel', draft.tank.capacity),
        nutrients: { ...DEFAULT_CONFIG.nutrients.rootTab },
      };
      draft.fish = [tetra('a'), tetra('b'), tetra('c')];
      draft.resources.food = 2;
      draft.plants = (['java_fern', 'amazon_sword', 'monte_carlo'] as const).map((species) =>
        plantRecord({ id: species, species, size: 40, condition: 100, surplus: 0 })
      );
      for (const kind of ALGAE_KINDS) draft.algae[kind] = { ...SEEDED };
      draft.resources.nitrate = 10 * draft.resources.water;
      draft.resources.phosphate = 1 * draft.resources.water;
      draft.resources.potassium = 10 * draft.resources.water;
      draft.resources.iron = 0.2 * draft.resources.water;
    });
    lit = run(start, LIT_DAYS * 24);
    dark = run(
      produce(lit, (draft) => {
        draft.equipment.light.enabled = false;
      }),
      BLACKOUT_DAYS * 24
    );
  });

  it('moves KH exactly as far as the charge on the inorganic nitrogen moves, through gills, decay, growth from the water and the bed, shedding and rot', () => {
    const leakedOnly =
      start.equipment.substrate.nutrients.nitrate * (1 - DEFAULT_CONFIG.nutrients.bedLeakRate) ** (LIT_DAYS * 24);
    expect(lit.equipment.substrate.nutrients.nitrate).toBeLessThan(leakedOnly);

    for (const state of [lit, dark]) {
      expect(Math.abs(state.resources.kh - start.resources.kh)).toBeGreaterThan(1);
      expect(alkalinityNetOfNitrogen(state) / alkalinityNetOfNitrogen(start)).toBeCloseTo(1, 10);
    }
  });
});

describe('blooms at every tunable’s maximum', () => {
  const maxed = leaves(DEFAULT_CONFIG).flatMap(([path]): [string, TunableConfig][] => {
    const range = configRange(path);
    return range === undefined ? [] : [[path, withTunable(DEFAULT_CONFIG, path, range.max)]];
  });
  const crowded = produce(cycledBareTank(), (draft) => {
    for (const kind of ALGAE_KINDS) draft.algae[kind] = { mass: 95, condition: 100, surplus: 100 };
    for (const n of NUTRIENTS) draft.resources[n] = 1000 * DEFAULT_CONFIG.nutrients.halfSaturation[n] * draft.resources.water;
  });

  it.each(maxed)('keep mass within [0, 100], condition within [0, 100] and the bank ≥ 0 with %s at its max', (_path, config) => {
    let state = crowded;
    for (let hour = 0; hour < 48; hour++) {
      state = tick(state, config);
      for (const kind of ALGAE_KINDS) {
        const { mass, condition, surplus } = state.algae[kind];
        expect(mass).toBeGreaterThanOrEqual(0);
        expect(mass).toBeLessThanOrEqual(100);
        expect(condition).toBeGreaterThanOrEqual(0);
        expect(condition).toBeLessThanOrEqual(100);
        expect(surplus).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('the keeper’s hands on the blooms', () => {
  const coated = produce(cycledBareTank(), (draft) => {
    for (const kind of ALGAE_KINDS) draft.algae[kind] = { mass: 50, condition: 100, surplus: 5 };
    draft.resources.ammonia = 0.5 * draft.resources.water;
    draft.resources.nitrate = 20 * draft.resources.water;
  });
  const tissueNitrogen = (state: SimulationState): number =>
    bloomsTissue(state) * DEFAULT_CONFIG.livestock.foodNitrogenFraction * 1000;

  it('export with a water change exactly the nitrogen the water and the green water in it carry out', () => {
    const share = 0.3;
    const changed = applyAction(coated, { type: 'waterChange', amount: share }).state;
    const greenWater = (state: SimulationState): number =>
      bloomTissue(state.algae.greenWater.mass, habitatSize('column', state), ALGAE.greenWater) *
      DEFAULT_CONFIG.livestock.foodNitrogenFraction *
      1000;
    const exported = share * (dissolvedNitrogen(coated) + greenWater(coated));

    expect(changed.algae.film).toEqual(coated.algae.film);
    expect((nitrogenInPools(coated) - nitrogenInPools(changed)) * 1000).toBeCloseTo(exported, 9);
    expect(tissueNitrogen(coated) - tissueNitrogen(changed)).toBeCloseTo(share * greenWater(coated), 9);
  });

  it('keep every gram of a scrub in the tank, as waste', () => {
    const scrubbed = applyAction(coated, { type: 'scrubAlgae', randomPercent: 0.2 }).state;
    expect(scrubbed.algae.greenWater).toEqual(coated.algae.greenWater);
    expect(nitrogenInPools(scrubbed) / nitrogenInPools(coated)).toBeCloseTo(1, 12);
  });
});

describe('an offshoot bought on thin water', () => {
  let start: SimulationState;
  let budded: SimulationState;
  beforeAll(() => {
    start = produce(cycledBareTank(20), (draft) => {
      draft.plants = [
        plantRecord({ id: 'fern', species: 'java_fern', size: 99, condition: 100, surplus: DEFAULT_CONFIG.plants.surplusCap }),
      ];
      draft.resources.nitrate = 10 * draft.resources.water;
      draft.resources.phosphate = 0.04 * draft.resources.water;
      draft.resources.potassium = 10 * draft.resources.water;
      draft.resources.iron = 0.2 * draft.resources.water;
    });
    budded = tick(start);
  });

  it('is a lump a draw read at the start of the tick would overdraw, and the pool meets it in part without going below zero', () => {
    const { plants, livestock, nutrients } = DEFAULT_CONFIG;
    const { offshootSize } = purchase(start.plants[0], plants);
    const share = nutrientShare(getPpm(start.resources.phosphate, start.resources.water), 'java_fern', 'phosphate');
    expect(tissueMass('java_fern', offshootSize) * organicNutrients(livestock, nutrients).phosphate * share).toBeGreaterThan(
      start.resources.phosphate
    );

    expect(budded.plants).toHaveLength(2);
    expect(budded.plants[1].size).toBeLessThan(offshootSize);
    expect(budded.resources.phosphate).toBeGreaterThan(0);
  });

  it('conserves nitrogen and every mineral through the lump', () => {
    expect(nitrogenInPools(budded) / nitrogenInPools(start)).toBeCloseTo(1, 10);
    for (const n of WASTE_NUTRIENTS) expect(mineralsInPools(budded, n) / mineralsInPools(start, n)).toBeCloseTo(1, 10);
  });
});

describe.each(SETUPS.map((setup) => [setup.name, setup] as const))('the %s tank', (_name, setup) => {
  const DAYS = 90;
  let state: SimulationState;
  beforeAll(() => {
    state = keep(setup, DAYS);
  });

  it('never holds a non-finite number', () => {
    expect(nonFinitePaths(state)).toEqual([]);
  });

  it('runs the same life twice on one rng seed', () => {
    expect(keep(setup, DAYS)).toStrictEqual(state);
  });
});

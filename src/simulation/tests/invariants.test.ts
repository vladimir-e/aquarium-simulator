import { beforeAll, describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { createSimulation, type Fish, type SimulationState } from '../state.js';
import { tick } from '../tick.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { nitrogenCycleDefaults } from '../config/nitrogen-cycle.js';
import { NUTRIENTS, WASTE_NUTRIENTS, type WasteNutrient } from '../config/nutrients.js';
import { MW_N, MW_NH3, MW_NO2, MW_NO3 } from '../core/chemistry.js';
import { tissueMass } from '../systems/plant-lifecycle.js';
import { purchase } from '../systems/plant-growth.js';
import { nutrientShare, organicNutrients } from '../systems/nutrients.js';
import { freshSubstrate } from '../equipment/substrate.js';
import { getPpm } from '../resources/index.js';
import { plantRecord } from './plant.js';
// The scenario setups are the shared definition of a real tank, so the engine invariants run over them.
import { SETUPS, type Setup } from '../../cli/scenarios/setups.js';
import { keepTank } from '../../cli/scenarios/run.js';

function run(state: SimulationState, hours: number): SimulationState {
  let running = state;
  for (let hour = 0; hour < hours; hour++) running = tick(running);
  return running;
}

/** Grams of organic matter in the tank: food, waste, the bed's reserve and plant tissue. */
function organics({ resources, equipment, plants }: SimulationState): number {
  const tissue = plants.reduce((sum, plant) => sum + tissueMass(plant.species, plant.size), 0);
  return resources.food + resources.waste + equipment.substrate.organicReserve + tissue;
}

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

function nonFinitePaths(value: unknown, path = 'state'): string[] {
  if (typeof value === 'number') return Number.isFinite(value) ? [] : [path];
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => nonFinitePaths(child, `${path}.${key}`));
}

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
  const LIT_DAYS = 30;
  const BLACKOUT_DAYS = 90;
  let start: SimulationState;
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
    grown = run(start, LIT_DAYS * 24);
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
      start.equipment.substrate.nutrients.phosphate * (1 - DEFAULT_CONFIG.nutrients.bedLeakRate) ** (LIT_DAYS * 24);
    expect(tissue(grown)).toBeGreaterThan(tissue(start));
    expect(grown.equipment.substrate.nutrients.phosphate).toBeLessThan(leakedOnly);
  });

  it('conserves nitrogen through the bed’s leak, growth, offshoots, shedding and death', () => {
    expect(nitrogenInPools(grown) / nitrogenInPools(start)).toBeCloseTo(1, 10);
    expect(nitrogenInPools(dark) / nitrogenInPools(start)).toBeCloseTo(1, 10);
  });

  it('conserves every mineral the same way', () => {
    for (const n of WASTE_NUTRIENTS) {
      expect(mineralsInPools(grown, n) / mineralsInPools(start, n)).toBeCloseTo(1, 10);
      expect(mineralsInPools(dark, n) / mineralsInPools(start, n)).toBeCloseTo(1, 10);
    }
  });

  it('never takes a nutrient below zero or off the number line', () => {
    for (const state of [grown, dark]) {
      for (const n of NUTRIENTS) {
        expect(state.resources[n]).toBeGreaterThanOrEqual(0);
        expect(state.equipment.substrate.nutrients[n]).toBeGreaterThanOrEqual(0);
      }
      expect(nonFinitePaths(state)).toEqual([]);
    }
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

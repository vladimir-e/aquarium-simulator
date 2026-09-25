import { beforeAll, describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { createSimulation, type Fish, type SimulationState } from '../state.js';
import { tick } from '../tick.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { nitrogenCycleDefaults } from '../config/nitrogen-cycle.js';
import { WASTE_NUTRIENTS, type WasteNutrient } from '../config/nutrients.js';
import { MW_N, MW_NH3, MW_NO2, MW_NO3 } from '../core/chemistry.js';
// The scenario setups are the shared definition of a real tank, so the engine invariants run over them.
import { SETUPS, type Setup } from '../../cli/scenarios/setups.js';
import { keepTank } from '../../cli/scenarios/run.js';

function run(state: SimulationState, hours: number): SimulationState {
  let running = state;
  for (let hour = 0; hour < hours; hour++) running = tick(running);
  return running;
}

function nitrogenInPools({ resources, equipment }: SimulationState): number {
  const { food, waste, ammonia, nitrite, nitrate } = resources;
  const organics = food + waste + equipment.substrate.organicReserve;
  return (
    organics * DEFAULT_CONFIG.livestock.foodNitrogenFraction +
    ((ammonia / MW_NH3 + nitrite / MW_NO2 + nitrate / MW_NO3) * MW_N) / 1000
  );
}

function mineralsInPools({ resources, equipment }: SimulationState, n: WasteNutrient): number {
  const organics = resources.food + resources.waste + equipment.substrate.organicReserve;
  return organics * DEFAULT_CONFIG.nutrients.foodMineralContent[n] + resources[n];
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

function cycledBareTank(): SimulationState {
  const state = createSimulation({ tankCapacity: 150 });
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

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { applyAction } from '../actions/index.js';
import { createSimulation, type SimulationState } from '../state.js';
import { tick } from '../tick.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { nitrogenCycleDefaults } from '../config/nitrogen-cycle.js';
import { MW_N, MW_NH3, MW_NO2, MW_NO3 } from '../core/chemistry.js';
import { SETUPS, toConfig, toSeed, type Setup } from '../../cli/scenarios/setups.js';
import { dueActions } from '../../cli/scenarios/keeper.js';

function run(state: SimulationState, hours: number): SimulationState {
  let running = state;
  for (let hour = 0; hour < hours; hour++) running = tick(running);
  return running;
}

function nitrogenInPools({ resources }: SimulationState): number {
  const { food, waste, ammonia, nitrite, nitrate } = resources;
  const { livestock, nitrogenCycle } = DEFAULT_CONFIG;
  return (
    food * livestock.foodNitrogenFraction +
    (waste * nitrogenCycle.wasteToAmmoniaRatio * MW_N) / MW_NH3 / 1000 +
    ((ammonia / MW_NH3 + nitrite / MW_NO2 + nitrate / MW_NO3) * MW_N) / 1000
  );
}

function cycledBareTank(): SimulationState {
  const state = createSimulation({ tankCapacity: 150 });
  const colony = state.resources.surface * nitrogenCycleDefaults.bacteriaPerCm2;
  return produce(state, (draft) => {
    draft.resources.aob = colony;
    draft.resources.nob = colony;
  });
}

function keep(setup: Setup, days: number): SimulationState {
  let state = createSimulation(toConfig(setup), toSeed(setup), 1234);
  for (let hour = 0; hour < days * 24; hour++) {
    for (const action of dueActions(setup.schedule, state)) {
      state = applyAction(state, action).state;
    }
    state = tick(state);
  }
  return state;
}

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
});

describe.each(SETUPS.map((setup) => [setup.name, setup] as const))('the %s tank', (_name, setup) => {
  const DAYS = 90;
  const state = keep(setup, DAYS);

  it('never holds a non-finite number', () => {
    expect(nonFinitePaths(state)).toEqual([]);
  });

  it('runs the same life twice on one rng seed', () => {
    expect(keep(setup, DAYS)).toEqual(state);
  });
});

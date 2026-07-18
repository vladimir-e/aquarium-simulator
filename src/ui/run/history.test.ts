import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import {
  snapshotFromState,
  appendRunSnapshot,
  RUN_HISTORY_CAP,
  type RunSnapshot,
} from './history';
import { createSimulation, type SimulationState } from '../../simulation/index.js';
import type { Plant } from '../../simulation/state.js';

function makeState(mutate: (draft: SimulationState) => void): SimulationState {
  return produce(createSimulation({ tankCapacity: 100 }), mutate);
}

function makePlant(size: number): Plant {
  return { id: `p-${size}`, species: 'java_fern', size, condition: 80, surplus: 0 };
}

function makeSnapshot(tick: number): RunSnapshot {
  return {
    tick,
    ammonia: 0,
    nitrite: 0,
    nitrate: 0,
    ph: 7,
    oxygen: 8,
    co2: 5,
    temperature: 25,
    waterPct: 100,
    fishCount: 0,
    plantAvgSize: 0,
    algaeMass: 0,
    food: 0,
  };
}

describe('snapshotFromState', () => {
  it('captures the tank vitals from resources', () => {
    const state = makeState((d) => {
      d.tick = 12;
      d.resources.ammonia = 0.5;
      d.resources.nitrite = 0.2;
      d.resources.nitrate = 10;
      d.resources.ph = 6.8;
      d.resources.oxygen = 7.5;
      d.resources.co2 = 18;
      d.resources.temperature = 24.5;
      d.resources.food = 0.3;
      d.algae.mass = 4;
    });

    const snap = snapshotFromState(state);
    expect(snap).toMatchObject({
      tick: 12,
      ammonia: 0.5,
      nitrite: 0.2,
      nitrate: 10,
      ph: 6.8,
      oxygen: 7.5,
      co2: 18,
      temperature: 24.5,
      food: 0.3,
      algaeMass: 4,
    });
  });

  it('computes water as a percentage of capacity', () => {
    const state = makeState((d) => {
      d.tank.capacity = 200;
      d.resources.water = 150;
    });
    expect(snapshotFromState(state).waterPct).toBe(75);
  });

  it('reports zero water percentage when capacity is zero', () => {
    const state = makeState((d) => {
      d.tank.capacity = 0;
      d.resources.water = 0;
    });
    expect(snapshotFromState(state).waterPct).toBe(0);
  });

  it('counts fish and averages plant size', () => {
    const state = makeState((d) => {
      d.plants = [makePlant(40), makePlant(60), makePlant(80)];
    });
    const snap = snapshotFromState(state);
    expect(snap.fishCount).toBe(state.fish.length);
    expect(snap.plantAvgSize).toBe(60);
  });

  it('averages plant size to zero when there are no plants', () => {
    const state = makeState((d) => {
      d.plants = [];
    });
    expect(snapshotFromState(state).plantAvgSize).toBe(0);
  });
});

describe('appendRunSnapshot', () => {
  it('appends below the cap and preserves order', () => {
    let history: RunSnapshot[] = [];
    history = appendRunSnapshot(history, makeSnapshot(0));
    history = appendRunSnapshot(history, makeSnapshot(1));
    history = appendRunSnapshot(history, makeSnapshot(2));
    expect(history.map((s) => s.tick)).toEqual([0, 1, 2]);
  });

  it('does not mutate the input array', () => {
    const history: RunSnapshot[] = [makeSnapshot(0)];
    const next = appendRunSnapshot(history, makeSnapshot(1));
    expect(history).toHaveLength(1);
    expect(next).toHaveLength(2);
  });

  it('drops the oldest entries once past the cap', () => {
    let history: RunSnapshot[] = [];
    for (let tick = 0; tick < RUN_HISTORY_CAP + 5; tick++) {
      history = appendRunSnapshot(history, makeSnapshot(tick));
    }
    expect(history).toHaveLength(RUN_HISTORY_CAP);
    // Oldest five dropped; window ends on the newest tick.
    expect(history[0].tick).toBe(5);
    expect(history[history.length - 1].tick).toBe(RUN_HISTORY_CAP + 4);
  });

  it('keeps exactly the cap on the boundary', () => {
    let history: RunSnapshot[] = [];
    for (let tick = 0; tick < RUN_HISTORY_CAP; tick++) {
      history = appendRunSnapshot(history, makeSnapshot(tick));
    }
    expect(history).toHaveLength(RUN_HISTORY_CAP);
    expect(history[0].tick).toBe(0);
  });
});

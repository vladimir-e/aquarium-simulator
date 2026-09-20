import { describe, it, expect } from 'vitest';
import { readTank, type ReadingBook } from './index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import {
  applyAction,
  createSimulation,
  tick,
  type SimulationState,
} from '../../simulation/index.js';
import { HIGH_AMMONIA_THRESHOLD } from '../../simulation/alerts/index.js';
import { snapshotFromState, type RunSnapshot } from '../run/index.js';

interface Run {
  state: SimulationState;
  history: RunSnapshot[];
}

function run(state: SimulationState, hours: number): Run {
  const history = [snapshotFromState(state)];
  let current = state;
  for (let hour = 0; hour < hours; hour++) {
    if (hour % 24 === 0) current = applyAction(current, { type: 'feed', amount: 0.5 }).state;
    current = tick(current, DEFAULT_CONFIG);
    history.push(snapshotFromState(current));
  }
  return { state: current, history };
}

function bare(): Run {
  const state = createSimulation({ tankCapacity: 200 });
  return { state, history: [snapshotFromState(state)] };
}

function stocked(hours = 24 * 10): Run {
  let state = createSimulation({ tankCapacity: 200 });
  for (let i = 0; i < 6; i++) {
    state = applyAction(state, { type: 'addFish', species: 'neon_tetra' }).state;
  }
  state = applyAction(state, { type: 'addPlant', species: 'anubias' }).state;
  return run(state, hours);
}

function read({ state, history }: Run, units: 'metric' | 'imperial' = 'metric'): ReadingBook {
  return readTank({ state, config: DEFAULT_CONFIG, history, units });
}

describe('readTank', () => {
  it('bands temperature and pH on what is stocked, and not at all when nothing is', () => {
    expect(read(stocked()).byId.temperature.band).not.toBeNull();
    expect(read(stocked()).byId.ph.band).not.toBeNull();

    expect(read(bare()).byId.temperature.band).toBeNull();
    expect(read(bare()).byId.ph.band).toBeNull();
  });

  it('takes the ammonia band off the engine threshold, and states it', () => {
    const { byId } = read(stocked());
    expect(byId.ammonia.sentence).toContain(HIGH_AMMONIA_THRESHOLD.toFixed(2));
  });

  it('reads nitrate twice — against the alert line, and against plant demand', () => {
    const book = read(stocked());
    const asFood = book.demand.find((reading) => reading.id === 'nitrate')!;

    expect(asFood.value).toBe(book.byId.nitrate.value);
    expect(asFood.band).not.toEqual(book.byId.nitrate.band);
    expect(asFood.note).toMatch(/^need /);
  });

  it('leaves a nutrient unbanded when there is nothing planted to want it', () => {
    for (const reading of read(bare()).demand) {
      expect(reading.band).toBeNull();
      expect(reading.note).toBe('');
    }
  });

  it('balances ammonia against what makes it and what clears it', () => {
    const { byId } = read(stocked());

    expect(byId.ammonia.fills.map((flow) => flow.label)).toEqual([
      'Waste mineralising',
      'Fish gills',
    ]);
    expect(byId.ammonia.drains[0].label).toBe('AOB oxidising');
  });

  it('names every waste source that is producing, and nothing that is not', () => {
    const book = read(stocked());
    const producing = book.waste.sources.filter((source) => source.gramsPerHour > 0);

    expect(book.byId.waste.fills).toHaveLength(producing.length);
    expect(book.byId.waste.series).toBeNull();
  });

  it('leaves the waste marker where the pool stands, on a scale that does not follow it', () => {
    const settled = stocked();
    let dirty = applyAction(settled.state, { type: 'feed', amount: 3 }).state;
    for (let hour = 0; hour < 3; hour++) dirty = tick(dirty, DEFAULT_CONFIG);

    const quiet = read(settled).byId.waste;
    const fouled = read({ state: dirty, history: settled.history }).byId.waste;

    expect(fouled.at).toBeGreaterThan(quiet.at);
    expect(fouled.band).toBeNull();
  });

  it('holds a nutrient’s band still while the value moves across it', () => {
    const settled = stocked();
    const dosed = applyAction(settled.state, { type: 'dose', amountMl: 5 }).state;

    const before = read(settled).byId.potassium;
    const after = read({ state: dosed, history: settled.history }).byId.potassium;

    expect(after.at).toBeGreaterThan(before.at);
    expect(after.band).toEqual(before.band);
  });

  it('says nothing about a trend it has not watched for an hour', () => {
    const fresh = Object.values(read(bare()).byId);
    expect(fresh.every((reading) => reading.trend === '')).toBe(true);

    const running = Object.values(read(stocked()).byId);
    expect(running.some((reading) => /[↗↘] \d/.test(reading.trend))).toBe(true);
  });

  it('reads temperature in the units the reader chose', () => {
    expect(read(stocked(1), 'metric').byId.temperature.unit).toBe('°C');
    expect(read(stocked(1), 'imperial').byId.temperature.unit).toBe('°F');
  });

  it('takes the trend off the same scale as the number above it', () => {
    const { state } = stocked(1);
    const base = snapshotFromState(state);
    // A day of hourly samples climbing 20 → 24 °C: 4.0/d metric, 7.2/d imperial.
    const history = Array.from({ length: 25 }, (_, hour) => ({
      ...base,
      temperature: 20 + hour / 6,
    }));

    const trend = (units: 'metric' | 'imperial'): string =>
      readTank({ state, config: DEFAULT_CONFIG, history, units }).byId.temperature.trend;

    expect(trend('metric')).toBe('↗ 4.0/d');
    expect(trend('imperial')).toBe('↗ 7.2/d');
  });

  it('gives every reading a home in the buffer, or admits it has none', () => {
    const { byId } = read(stocked(1));
    expect(byId.oxygen.series).not.toBeNull();
    expect(byId.potassium.series).toBeNull();
  });
});

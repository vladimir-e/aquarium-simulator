import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { tick, getHourOfDay, getDayNumber, settleEnvironment } from './tick.js';
import { createSimulation, type SimulationConfig, type SimulationState } from './state.js';
import { applyAction } from './actions/index.js';
import { DEFAULT_CONFIG, type TunableConfig } from './config/index.js';
import type { PresetSeed } from './seed.js';
import { FILTER_SURFACE } from './equipment/filter.js';
import { POWERHEAD_FLOW_LPH } from './equipment/powerhead.js';

describe('tick', () => {
  const still = (): SimulationState =>
    createSimulation({ tankCapacity: 100, initialTemperature: 22, roomTemperature: 22 });

  it('advances the clock by one hour without touching the state it was given', () => {
    const state = still();
    const next = tick(state);

    expect(next.tick).toBe(1);
    expect(next).not.toBe(state);
    expect(state.tick).toBe(0);
  });

  it('drifts temperature toward the room and evaporates water', () => {
    const state = tick(
      createSimulation({ tankCapacity: 100, initialTemperature: 28, roomTemperature: 22 })
    );

    expect(state.resources.temperature).toBeLessThan(28);
    expect(state.resources.temperature).toBeGreaterThan(22);
    expect(state.resources.water).toBeLessThan(100);
  });

  it('switches the heater on below target and off at it', () => {
    const heater = (initialTemperature: number, isOn: boolean): boolean =>
      tick(
        createSimulation({
          tankCapacity: 100,
          initialTemperature,
          roomTemperature: initialTemperature,
          heater: { enabled: true, isOn, targetTemperature: 25, wattage: 100 },
        })
      ).equipment.heater.isOn;

    expect(heater(22, false)).toBe(true);
    expect(heater(25, true)).toBe(false);
  });

  it('warms a tank with the heater on against one without', () => {
    const run = (enabled: boolean): number =>
      tick(
        createSimulation({
          tankCapacity: 100,
          initialTemperature: 22,
          roomTemperature: 20,
          heater: { enabled, targetTemperature: 25, wattage: 100 },
        })
      ).resources.temperature;

    expect(run(true)).toBeGreaterThan(run(false));
  });

  it('recalculates flow and surface from the equipment every tick', () => {
    const state = createSimulation({
      tankCapacity: 100,
      filter: { enabled: true, type: 'canister' },
      powerhead: { enabled: true, flowRateGPH: 240 },
    });
    const changed = produce(state, (draft) => {
      draft.equipment.filter.enabled = false;
      draft.equipment.powerhead.flowRateGPH = 850;
    });
    const next = tick(changed);

    expect(tick(state).resources.surface).toBe(state.resources.surface);
    expect(next.resources.flow).toBe(POWERHEAD_FLOW_LPH[850]);
    expect(next.resources.surface).toBe(state.resources.surface - FILTER_SURFACE.canister);
  });

  it('lights the substrate through the water column the config describes', () => {
    const state = createSimulation({
      tankCapacity: 100,
      light: { enabled: true, par: 150, schedule: { startHour: 0, duration: 24 } },
    });
    const murky: TunableConfig = {
      ...DEFAULT_CONFIG,
      optics: { waterAttenuationPerCm: DEFAULT_CONFIG.optics.waterAttenuationPerCm * 4 },
    };

    expect(tick(state, murky).resources.light).toBeLessThan(
      tick(state, DEFAULT_CONFIG).resources.light
    );
  });

  it('raises alerts on the state the passive tier left behind', () => {
    const state = produce(createSimulation({ tankCapacity: 100 }), (draft) => {
      draft.resources.water = 15;
    });
    const next = tick(state);

    expect(next.logs.length).toBeGreaterThan(state.logs.length);
    expect(next.logs.some((log) => log.source === 'evaporation' && log.severity === 'warning')).toBe(
      true
    );
  });
});

describe('getHourOfDay / getDayNumber', () => {
  it.each([
    [0, 0, 0],
    [12, 12, 0],
    [23, 23, 0],
    [24, 0, 1],
    [50, 2, 2],
  ])('reads tick %d as hour %d of day %d', (at, hour, day) => {
    const state = { ...createSimulation({ tankCapacity: 100 }), tick: at };

    expect(getHourOfDay(state)).toBe(hour);
    expect(getDayNumber(state)).toBe(day);
  });
});

describe('settleEnvironment', () => {
  it('lands the hour the tick runs, not the one it was handed', () => {
    let state = createSimulation({
      tankCapacity: 100,
      light: { enabled: true, par: 90, schedule: { startHour: 8, duration: 12 } },
    });
    while (state.tick < 7) state = tick(state);

    const settled = settleEnvironment(state);

    expect(state.resources.light).toBe(0);
    expect(settled.tick).toBe(8);
    expect(settled.resources.light).toBeGreaterThan(0);
    expect(tick(state).resources.light).toBe(settled.resources.light);
  });
});

describe('tick determinism', () => {
  const TANK: SimulationConfig = {
    tankCapacity: 150,
    substrate: { type: 'aqua_soil' },
    filter: { enabled: true, type: 'canister' },
    heater: { enabled: true, targetTemperature: 26, wattage: 200 },
    ato: { enabled: true },
  };

  const ROSTER: PresetSeed = {
    bacteria: 'cycled',
    fish: [
      { species: 'guppy', count: 3, sex: 'female' },
      { species: 'guppy', count: 2, sex: 'male' },
    ],
    plants: [{ species: 'java_fern', count: 2, size: 120 }],
  };

  function fortnight(rngSeed: number): SimulationState {
    let state = createSimulation(TANK, ROSTER, rngSeed);
    for (let hour = 1; hour <= 14 * 24; hour++) {
      if (hour % 24 === 9) state = applyAction(state, { type: 'feed', amount: 0.15 }).state;
      state = tick(state);
    }
    return state;
  }

  it('runs a breeding tank to the same state twice from one rng seed', () => {
    const first = fortnight(2026);
    const second = fortnight(2026);

    expect(first.fish.length).toBeGreaterThan(5);
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('sends the same tank down a different life on a different rng seed', () => {
    expect(fortnight(2026)).not.toEqual(fortnight(9001));
  });

  it('picks up mid-stream when a serialised tank is handed back', () => {
    const halfway = fortnight(2026);
    const resumed: SimulationState = JSON.parse(JSON.stringify(halfway));

    expect(tick(resumed)).toEqual(tick(halfway));
  });
});

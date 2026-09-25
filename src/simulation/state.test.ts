import { describe, it, expect } from 'vitest';
import {
  createSimulation,
  calculateTankHeight,
  calculateTankGlassSurface,
  DEFAULT_HEATER,
} from './state.js';
import { DEFAULT_CONFIG } from './config/index.js';
import { opticsDefaults } from './config/optics.js';
import { DEFAULT_FILTER } from './equipment/filter.js';
import { calculateParAtDepth, MAX_LIGHT_PAR } from './equipment/light.js';
import { DEFAULT_POWERHEAD } from './equipment/powerhead.js';
import { DEFAULT_SUBSTRATE } from './equipment/substrate.js';
import { tick } from './tick.js';

describe('createSimulation', () => {
  it('opens a full tank at tick 0, at the temperatures it is given', () => {
    const state = createSimulation({ tankCapacity: 200, initialTemperature: 22, roomTemperature: 20 });

    expect(state.tick).toBe(0);
    expect(state.tank.capacity).toBe(200);
    expect(state.resources.water).toBe(200);
    expect(state.resources.temperature).toBe(22);
    expect(state.environment.roomTemperature).toBe(20);
  });

  it('fits the defaults to every device it is not told about', () => {
    const { equipment } = createSimulation({ tankCapacity: 100 });

    expect(equipment.heater).toEqual(DEFAULT_HEATER);
    expect(equipment.filter).toEqual(DEFAULT_FILTER);
    expect(equipment.powerhead).toEqual(DEFAULT_POWERHEAD);
    expect(equipment.substrate).toEqual(DEFAULT_SUBSTRATE);
  });

  it('merges a partial device config over the defaults', () => {
    const { equipment } = createSimulation({
      tankCapacity: 100,
      heater: { targetTemperature: 28 },
      filter: { type: 'hob' },
      powerhead: { enabled: true },
    });

    expect(equipment.heater).toEqual({ ...DEFAULT_HEATER, targetTemperature: 28 });
    expect(equipment.filter).toEqual({ ...DEFAULT_FILTER, type: 'hob' });
    expect(equipment.powerhead).toEqual({ ...DEFAULT_POWERHEAD, enabled: true });
  });

  it('logs its creation with the tank it built', () => {
    const [log] = createSimulation({
      tankCapacity: 150,
      roomTemperature: 24,
      heater: { enabled: false },
    }).logs;

    expect(log).toMatchObject({ tick: 0, source: 'simulation', severity: 'info' });
    for (const part of ['Simulation created', '150L tank', '24°C room', 'heater disabled']) {
      expect(log.message).toContain(part);
    }
  });

  it('gives a bigger tank more glass to colonise, in whole cm²', () => {
    const bare = { filter: { enabled: false }, substrate: { type: 'none' as const } };
    const small = createSimulation({ tankCapacity: 75, ...bare }).resources.surface;
    const large = createSimulation({ tankCapacity: 200, ...bare }).resources.surface;

    expect(Number.isInteger(small)).toBe(true);
    expect(large).toBeGreaterThan(small);
  });
});

describe('calculateTankHeight', () => {
  it('reads the 2:1:1 box the glass surface already assumes', () => {
    expect(calculateTankHeight(8 * 40) / calculateTankHeight(40)).toBeCloseTo(2, 10);
    expect(calculateTankGlassSurface(8 * 40) / calculateTankGlassSurface(40)).toBeCloseTo(4, 3);
  });
});

describe('createSimulation - the light a tank opens on', () => {
  const lit = (startHour: number): number =>
    createSimulation({
      tankCapacity: 40,
      light: { enabled: true, par: 90, schedule: { startHour, duration: 12 } },
    }).resources.light;

  it('reads what the fixture lands at hour 0, not zero', () => {
    expect(lit(0)).toBeCloseTo(calculateParAtDepth(90, calculateTankHeight(40), opticsDefaults), 10);
  });

  it('reads nothing when the photoperiod has not started', () => {
    expect(lit(8)).toBe(0);
  });

  it('agrees with the first tick, which recalculates the same hour', () => {
    const state = createSimulation({
      tankCapacity: 40,
      light: { enabled: true, par: 90, schedule: { startHour: 0, duration: 24 } },
    });

    expect(tick(state, DEFAULT_CONFIG).resources.light).toBeCloseTo(state.resources.light, 10);
  });
});

describe('createSimulation - numbers a tank could not survive', () => {
  it('refuses a non-finite number wherever it sits in the config', () => {
    expect(() => createSimulation({ tankCapacity: NaN })).toThrow(/tankCapacity is NaN/);
    expect(() =>
      createSimulation({ tankCapacity: 40, heater: { wattage: Infinity } })
    ).toThrow(/heater.wattage is Infinity/);
    expect(() =>
      createSimulation({ tankCapacity: 40, light: { schedule: { startHour: NaN, duration: 10 } } })
    ).toThrow(/light.schedule.startHour is NaN/);
  });

  it('refuses a non-finite number in the seed too', () => {
    expect(() =>
      createSimulation({ tankCapacity: 40 }, { plants: [{ species: 'anubias', count: 1, size: NaN }] })
    ).toThrow(/seed\.plants\[0\]\.size is NaN/);
  });

  it('refuses a tank with no volume to be a tank', () => {
    expect(() => createSimulation({ tankCapacity: 0 })).toThrow(/must be positive/);
    expect(() => createSimulation({ tankCapacity: -40 })).toThrow(/must be positive/);
  });

  it('refuses a fixture brighter than the sun, and takes every catalog one', () => {
    expect(() => createSimulation({ tankCapacity: 40, light: { par: 1e6 } })).toThrow(
      /light.par must be within/
    );
    expect(() => createSimulation({ tankCapacity: 40, light: { par: -1 } })).toThrow(
      /light.par must be within/
    );
    expect(createSimulation({ tankCapacity: 40, light: { par: MAX_LIGHT_PAR } })).toBeDefined();
  });
});

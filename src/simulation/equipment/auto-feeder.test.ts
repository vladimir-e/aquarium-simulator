import { describe, it, expect } from 'vitest';
import { applyAutoFeederSettings, autoFeederUpdate, MAX_FEED_G, MIN_FEED_G, type AutoFeeder } from './auto-feeder.js';
import { processEquipment } from './index.js';
import { createSimulation, type SimulationState } from '../state.js';
import { DEFAULT_CONFIG } from '../config/index.js';

function tankAt(tick: number, feeder: Partial<AutoFeeder> = {}): SimulationState {
  return { ...createSimulation({ tankCapacity: 40, autoFeeder: { enabled: true, amount: 0.3, ...feeder } }), tick };
}

describe('autoFeederUpdate', () => {
  it('drops its ration at the scheduled hour, and only then', () => {
    const { startHour } = tankAt(0).equipment.autoFeeder.schedule;
    for (let hour = 0; hour < 48; hour++) {
      const effects = autoFeederUpdate(tankAt(hour));
      expect(effects).toEqual(
        hour % 24 === startHour ? [{ tier: 'active', resource: 'food', delta: 0.3, source: 'auto-feeder' }] : []
      );
    }
  });

  it('does nothing when off', () => {
    const { startHour } = tankAt(0).equipment.autoFeeder.schedule;
    expect(autoFeederUpdate(tankAt(startHour, { enabled: false }))).toEqual([]);
  });

  it('puts its ration in the water through the equipment pass', () => {
    const state = tankAt(tankAt(0).equipment.autoFeeder.schedule.startHour);
    const food = processEquipment(state, DEFAULT_CONFIG).effects.filter((e) => e.resource === 'food');
    expect(food.reduce((sum, e) => sum + e.delta, 0)).toBeCloseTo(0.3, 12);
  });
});

describe('applyAutoFeederSettings', () => {
  it('applies the settings it is given', () => {
    const result = applyAutoFeederSettings(tankAt(0, { enabled: false }), {
      enabled: true,
      amount: 0.5,
      schedule: { startHour: 7, duration: 1 },
    });
    expect(result.equipment.autoFeeder).toEqual({ enabled: true, amount: 0.5, schedule: { startHour: 7, duration: 1 } });
  });

  it('clamps the ration to its range', () => {
    const state = tankAt(0);
    expect(applyAutoFeederSettings(state, { amount: 0 }).equipment.autoFeeder.amount).toBe(MIN_FEED_G);
    expect(applyAutoFeederSettings(state, { amount: 50 }).equipment.autoFeeder.amount).toBe(MAX_FEED_G);
  });
});

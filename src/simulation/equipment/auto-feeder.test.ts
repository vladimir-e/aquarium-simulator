import { describe, it, expect } from 'vitest';
import { deltaOf } from '../tests/effects.js';
import { autoFeederUpdate, type AutoFeeder } from './auto-feeder.js';
import { processEquipment } from './index.js';
import { createSimulation, type SimulationState } from '../state.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { atRecipe } from '../core/organics.js';

function tankAt(tick: number, feeder: Partial<AutoFeeder> = {}): SimulationState {
  return { ...createSimulation({ tankCapacity: 40, autoFeeder: { enabled: true, amount: 0.3, ...feeder } }), tick };
}

describe('autoFeederUpdate', () => {
  it('drops its ration at the scheduled hour, and only then', () => {
    const { startHour } = tankAt(0).equipment.autoFeeder;
    for (let hour = 0; hour < 48; hour++) {
      const effects = autoFeederUpdate(tankAt(hour), DEFAULT_CONFIG);
      expect(effects).toEqual(
        hour % 24 === startHour
          ? [{ tier: 'active', resource: 'food', delta: atRecipe(0.3, DEFAULT_CONFIG), source: 'auto-feeder' }]
          : []
      );
    }
  });

  it('does nothing when off', () => {
    const { startHour } = tankAt(0).equipment.autoFeeder;
    expect(autoFeederUpdate(tankAt(startHour, { enabled: false }), DEFAULT_CONFIG)).toEqual([]);
  });

  it('puts its ration in the water through the equipment pass', () => {
    const state = tankAt(tankAt(0).equipment.autoFeeder.startHour);
    const food = processEquipment(state, DEFAULT_CONFIG).effects.filter((e) => e.resource === 'food');
    expect(food.reduce((sum, e) => sum + deltaOf(e), 0)).toBeCloseTo(0.3, 12);
  });
});

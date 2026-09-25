import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { waterChange } from './water-change.js';
import { createSimulation, type SimulationState } from '../state.js';
import type { WaterChangeAction } from './types.js';

const DISSOLVED = ['ammonia', 'nitrite', 'nitrate', 'phosphate', 'potassium', 'iron'] as const;

function tank({
  water = 100,
  temperature = 26,
  tap = 20,
}: { water?: number; temperature?: number; tap?: number } = {}): SimulationState {
  return produce(
    createSimulation({ tankCapacity: 100, initialTemperature: temperature, tapWaterTemperature: tap }),
    (draft) => {
      draft.resources.water = water;
      DISSOLVED.forEach((resource, i) => {
        draft.resources[resource] = 10 * (i + 1);
      });
    }
  );
}

const change = (state: SimulationState, amount: number) =>
  waterChange(state, { type: 'waterChange', amount } as WaterChangeAction);

describe('waterChange', () => {
  it.each([0.1, 0.25, 0.4, 0.9, 1])('removes %d of every dissolved mass', (amount) => {
    const before = tank();
    const after = change(before, amount).state;

    for (const resource of DISSOLVED) {
      expect(after.resources[resource]).toBeCloseTo(before.resources[resource] * (1 - amount), 10);
    }
  });

  it('refills to capacity and blends in the tap temperature by volume', () => {
    const after = change(tank({ water: 90, temperature: 26, tap: 20 }), 0.25).state;
    const kept = 90 * 0.75;

    expect(after.resources.water).toBe(100);
    expect(after.resources.temperature).toBeCloseTo((kept * 26 + (100 - kept) * 20) / 100, 10);
  });

  it('removes a share of the water there is, then tops the tank up', () => {
    const before = tank({ water: 20 });
    const after = change(before, 0.25).state;

    expect(after.resources.water).toBe(100);
    expect(after.resources.nitrate).toBeCloseTo(before.resources.nitrate * 0.75, 10);
  });

  it('logs and reports the share and both volumes', () => {
    const result = change(tank({ water: 90 }), 0.25);
    const log = result.state.logs.find((l) => l.source === 'user' && l.message.includes('Water change'));

    for (const text of [log!.message, result.message]) {
      expect(text).toContain('25%');
      expect(text).toContain('removed 22.5L');
      expect(text).toContain('added 32.5L');
    }
  });

  it('leaves an empty tank alone', () => {
    const empty = tank({ water: 0 });
    const result = change(empty, 0.25);

    expect(result.state).toBe(empty);
    expect(result.message).toBe('No water to change');
  });

  it.each([0, -0.5, 1.5, NaN])('refuses a fraction of %d', (amount) => {
    const state = tank();
    const result = change(state, amount);

    expect(result.state).toBe(state);
    expect(result.message).toBe('Invalid water change amount');
  });
});

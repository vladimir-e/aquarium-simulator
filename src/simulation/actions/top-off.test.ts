import { describe, it, expect } from 'vitest';
import { topOff } from './top-off';
import { logText } from '../core/logging';
import { createSimulation } from '../state';
import { produce } from 'immer';
import { getDkh } from '../resources/helpers';

describe('topOff action', () => {
  it('replaces evaporated water with tap water, so KH creeps above the tap', () => {
    const state = produce(createSimulation({ tankCapacity: 100, tapKh: 4 }), (draft) => {
      draft.resources.water = 80;
    });

    const { resources } = topOff(state).state;

    expect(getDkh(resources.kh, resources.water)).toBeCloseTo((4 * 100 + 4 * 20) / 100, 10);
  });

  it('adds water to reach capacity when below', () => {
    const state = produce(
      createSimulation({ tankCapacity: 100 }),
      (draft) => {
        draft.resources.water = 80;
      }
    );

    const result = topOff(state);

    expect(result.state.resources.water).toBe(100);
  });

  it('returns correct amount added in message', () => {
    const state = produce(
      createSimulation({ tankCapacity: 100 }),
      (draft) => {
        draft.resources.water = 75.5;
      }
    );

    const result = topOff(state);

    expect(result.message).toBe('Added 24.5L');
  });

  it('emits log entry with amount and final level', () => {
    const state = produce(
      createSimulation({ tankCapacity: 100 }),
      (draft) => {
        draft.resources.water = 80;
        draft.tick = 42;
      }
    );

    const result = topOff(state);

    const logEntry = result.state.logs[result.state.logs.length - 1];
    expect(logEntry.tick).toBe(42);
    expect(logEntry.source).toBe('user');
    expect(logEntry.severity).toBe('info');
    expect(logText(logEntry)).toBe('Topped off water: +20.0 L to 100.0 L');
  });

  it('is idempotent when already at capacity', () => {
    const state = createSimulation({ tankCapacity: 100 });

    const result = topOff(state);

    expect(result.state).toBe(state);
    expect(result.message).toBe('Water already at capacity (100L)');
  });

  it('does not modify original state (immutability)', () => {
    const state = produce(
      createSimulation({ tankCapacity: 100 }),
      (draft) => {
        draft.resources.water = 80;
      }
    );

    const originalWaterLevel = state.resources.water;
    const originalLogsLength = state.logs.length;

    topOff(state);

    expect(state.resources.water).toBe(originalWaterLevel);
    expect(state.logs.length).toBe(originalLogsLength);
  });

  it('handles edge case of very small water deficit', () => {
    const state = produce(
      createSimulation({ tankCapacity: 100 }),
      (draft) => {
        draft.resources.water = 99.95;
      }
    );

    const result = topOff(state);

    expect(result.state.resources.water).toBe(100);
    expect(result.message).toBe('Added 0.0L');
  });
});

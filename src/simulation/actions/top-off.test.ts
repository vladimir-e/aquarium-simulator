import { describe, it, expect } from 'vitest';
import { topOff } from './top-off';
import { createSimulation } from '../state';
import { produce } from 'immer';

describe('topOff action', () => {
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
    expect(logEntry.message).toContain('+20.0L');
    expect(logEntry.message).toContain('100L');
  });

  it('is idempotent when already at capacity', () => {
    const state = createSimulation({ tankCapacity: 100 });
    // Initial state has waterLevel = capacity

    const result = topOff(state);

    expect(result.state).toBe(state); // Same reference, no changes
    expect(result.message).toBe('Water already at capacity (100L)');
  });

  it('preserves other state properties (temperature, etc.)', () => {
    const state = produce(
      createSimulation({
        tankCapacity: 100,
        initialTemperature: 28,
        roomTemperature: 20,
      }),
      (draft) => {
        draft.resources.water = 80;
        draft.tick = 10;
      }
    );

    const result = topOff(state);

    expect(result.state.resources.temperature).toBe(28);
    expect(result.state.environment.roomTemperature).toBe(20);
    expect(result.state.tank.capacity).toBe(100);
    expect(result.state.tick).toBe(10);
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

  it('handles large tank capacity', () => {
    const state = produce(
      createSimulation({ tankCapacity: 1000 }),
      (draft) => {
        draft.resources.water = 500;
      }
    );

    const result = topOff(state);

    expect(result.state.resources.water).toBe(1000);
    expect(result.message).toBe('Added 500.0L');
  });
});

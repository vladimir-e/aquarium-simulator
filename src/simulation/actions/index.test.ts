import { describe, it, expect } from 'vitest';
import { applyAction } from './index';
import { createSimulation } from '../state';
import { produce } from 'immer';

describe('applyAction', () => {
  it('dispatches topOff action to correct handler', () => {
    const state = produce(
      createSimulation({ tankCapacity: 100 }),
      (draft) => {
        draft.resources.water = 80;
      }
    );

    const result = applyAction(state, { type: 'topOff' });

    expect(result.state.resources.water).toBe(100);
  });

  it('returns ActionResult with state and message', () => {
    const state = produce(
      createSimulation({ tankCapacity: 100 }),
      (draft) => {
        draft.resources.water = 80;
      }
    );

    const result = applyAction(state, { type: 'topOff' });

    expect(result.state).toBeDefined();
    expect(result.state.resources.water).toBe(100);
    expect(result.message).toBe('Added 20.0L');
  });

  it('returns correct message when water already full', () => {
    const state = createSimulation({ tankCapacity: 100 });

    const result = applyAction(state, { type: 'topOff' });

    expect(result.message).toBe('Water already at capacity (100L)');
  });

  it('preserves immutability through dispatch', () => {
    const state = produce(
      createSimulation({ tankCapacity: 100 }),
      (draft) => {
        draft.resources.water = 80;
      }
    );

    const originalWaterLevel = state.resources.water;
    applyAction(state, { type: 'topOff' });

    expect(state.resources.water).toBe(originalWaterLevel);
  });

  it('logs are added through dispatch', () => {
    const state = produce(
      createSimulation({ tankCapacity: 100 }),
      (draft) => {
        draft.resources.water = 80;
      }
    );
    const initialLogCount = state.logs.length;

    const result = applyAction(state, { type: 'topOff' });

    expect(result.state.logs.length).toBe(initialLogCount + 1);
    const lastLog = result.state.logs[result.state.logs.length - 1];
    expect(lastLog.source).toBe('user');
    expect(lastLog.message).toContain('Topped off water');
  });
});

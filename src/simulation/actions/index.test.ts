import { describe, it, expect } from 'vitest';
import { applyAction } from './index';
import type { Action } from './types';
import { createSimulation, type SimulationState } from '../state';
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

  describe('a number the tank could not recover from', () => {
    const tank = (): SimulationState => {
      const planted = applyAction(
        createSimulation({ tankCapacity: 100, substrate: { type: 'aqua_soil' } }),
        { type: 'addPlant', species: 'anubias' }
      ).state;
      return produce(planted, (draft) => {
        draft.algae.mass = 50;
      });
    };

    const carriers: Array<(value: number) => Action> = [
      (amountMl): Action => ({ type: 'dose', amountMl }),
      (amount): Action => ({ type: 'feed', amount }),
      (amount): Action => ({ type: 'waterChange', amount }),
      (targetSize): Action => ({ type: 'trimPlants', targetSize }),
      (initialSize): Action => ({ type: 'addPlant', species: 'anubias', initialSize }),
      (randomPercent): Action => ({ type: 'scrubAlgae', randomPercent }),
    ];

    for (const value of [NaN, Infinity, -Infinity]) {
      it(`is refused as ${value} by every action that takes one`, () => {
        const start = tank();
        for (const carry of carriers) {
          expect(applyAction(start, carry(value)).state).toBe(start);
        }
      });
    }
  });

  it('dispatches sellFry action to correct handler', () => {
    const state = produce(createSimulation({ tankCapacity: 100 }), (draft) => {
      draft.fish.push({
        id: 'fry_1',
        species: 'guppy',
        mass: 0.1,
        health: 100,
        age: 0,
        satiation: 70,
        sex: 'female',
        stage: 'fry',
        hardinessOffset: 0,
        surplus: 0,
      });
    });

    const result = applyAction(state, { type: 'sellFry' });

    expect(result.state.fish).toHaveLength(0);
    expect(result.message).toBe('Sold 1 fry');
  });
});

import { describe, it, expect } from 'vitest';
import { applyAction } from './index';
import type { Action } from './types';
import { createSimulation, type SimulationState } from '../state';
import { DEFAULT_CONFIG } from '../config/index.js';
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

  it('mixes a dose to the formula the config carries', () => {
    const tuned = produce(DEFAULT_CONFIG, (draft) => {
      draft.nutrients.fertilizerFormula.nitrate = 10;
    });
    const state = createSimulation({ tankCapacity: 100 });

    const result = applyAction(state, { type: 'dose', amountMl: 1 }, tuned);

    expect(result.state.resources.nitrate - state.resources.nitrate).toBe(10);
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

import { describe, it, expect } from 'vitest';
import { applyAction } from './index';
import type { Action } from './types';
import { createSimulation, type SimulationState } from '../state';
import { DEFAULT_CONFIG } from '../config/index.js';
import { calculatePassiveResources, scheduledLightHistory } from '../equipment/index.js';
import { tick } from '../tick.js';
import { produce } from 'immer';
import { fishRecord } from '../tests/fish.js';

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
        draft.algae.greenWater.mass = 50;
        draft.algae.film.mass = 50;
      });
    };

    const carriers: Array<(value: number) => Action> = [
      (amountMl): Action => ({ type: 'dose', amountMl }),
      (amount): Action => ({ type: 'feed', amount }),
      (amount): Action => ({ type: 'waterChange', amount }),
      (targetSize): Action => ({ type: 'trimPlants', targetSize }),
      (initialSize): Action => ({ type: 'addPlant', species: 'anubias', initialSize }),
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

  describe('the light a water change leaves, settled under the optics of the config it is handed', () => {
    const config = produce(DEFAULT_CONFIG, (draft) => {
      draft.optics.waterAttenuationPerCm *= 2;
    });
    const greenTank = (): SimulationState =>
      produce(
        createSimulation({
          tankCapacity: 100,
          light: { enabled: true, par: 100, schedule: { startHour: 0, duration: 24 } },
          optics: config.optics,
        }),
        (draft) => {
          draft.algae.greenWater.mass = 60;
        }
      );
    const changed = (state: SimulationState): SimulationState =>
      applyAction(state, { type: 'waterChange', amount: 0.5 }, config).state;

    it('reads through the cleared water, and leaves the day the tank has lived to the tick', () => {
      const lit = tick(greenTank(), config);
      const after = changed(lit);

      expect(after.resources.light).toBe(calculatePassiveResources(after, config.optics).light);
      expect(after.resources.light).toBeGreaterThan(lit.resources.light);
      expect(after.resources.lightByHour).toEqual(lit.resources.lightByHour);
    });

    it('reads the day through the cleared water at hour zero, the tank having lived none', () => {
      const after = changed(greenTank());

      expect(after.resources.lightByHour).toEqual(scheduledLightHistory(after, config.optics));
      expect(after.resources.light).toBe(after.resources.lightByHour[0]);
    });
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
      draft.fish.push(fishRecord({ id: 'fry_1', species: 'guppy', mass: 0.1, sex: 'female' }));
    });

    const result = applyAction(state, { type: 'sellFry' });

    expect(result.state.fish).toHaveLength(0);
    expect(result.message).toBe('Sold 1 fry');
  });
});

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import {
  applyAction,
  createSimulation,
  dailyLightEdge,
  dailyLightIntegral,
  type PlantSpecies,
  type SimulationState,
} from '../../simulation/index.js';
import { dailyLightReading } from './light';

function planted(species: PlantSpecies[]): SimulationState {
  const state = species.reduce(
    (current, s) => applyAction(current, { type: 'addPlant', species: s }).state,
    createSimulation({ tankCapacity: 200, substrate: { type: 'aqua_soil' } })
  );
  expect(state.plants).toHaveLength(species.length);
  return state;
}

function lit(state: SimulationState, dailyLight: number): SimulationState {
  const scale = dailyLight / dailyLightIntegral(state.resources.lightByHour);
  return produce(state, (draft) => {
    draft.resources.lightByHour = draft.resources.lightByHour.map((par) => par * scale);
  });
}

describe('dailyLightReading', () => {
  it('reads the light history the plants starve on', () => {
    const state = planted(['java_fern']);
    expect(dailyLightReading(state).value).toBe(dailyLightIntegral(state.resources.lightByHour));
  });

  it('needs what the neediest species planted starves under', () => {
    const reading = dailyLightReading(planted(['anubias', 'monte_carlo', 'java_fern']));
    expect(reading.needed).toBe(dailyLightEdge('monte_carlo'));
    expect(reading.need).toBe(`need ${dailyLightEdge('monte_carlo').toFixed(2)}`);
  });

  it('holds its tone while nothing is planted to need it', () => {
    const reading = dailyLightReading(createSimulation({ tankCapacity: 200 }));
    expect(reading.needed).toBe(0);
    expect(reading.need).toBe('');
    expect(reading.status).toBe('neutral');
  });

  it('reads short under the need, and dark at none', () => {
    const state = planted(['monte_carlo']);
    const edge = dailyLightEdge('monte_carlo');
    expect(dailyLightReading(lit(state, edge * 1.01)).status).toBe('ok');
    expect(dailyLightReading(lit(state, edge * 0.99)).status).toBe('warn');
    expect(dailyLightReading(lit(state, 0)).status).toBe('alert');
  });
});

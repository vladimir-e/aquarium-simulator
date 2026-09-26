import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import {
  applyAction,
  createSimulation,
  dailyLightEdge,
  dailyLightIntegral,
  readPlantLight,
  type PlantSpecies,
  type SimulationState,
} from '../../simulation/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { settleEnvironment } from '../../simulation/tick.js';
import { readHourAhead } from './ahead';
import { dailyLightReading, type DailyLightReading } from './light';

function planted(species: PlantSpecies[], size?: number): SimulationState {
  const state = species.reduce(
    (current, s) => applyAction(current, { type: 'addPlant', species: s, initialSize: size }).state,
    createSimulation({ tankCapacity: 200, substrate: { type: 'aqua_soil' } })
  );
  expect(state.plants).toHaveLength(species.length);
  return state;
}

/** The tank on a dark fixture, holding `dailyLight` over the window the next tick reads. */
function lit(state: SimulationState, dailyLight: number): SimulationState {
  return produce(state, (draft) => {
    draft.equipment.light.enabled = false;
    draft.resources.lightByHour[(draft.tick + 1) % 24] = 0;
    const day = dailyLightIntegral(draft.resources.lightByHour);
    draft.resources.lightByHour = draft.resources.lightByHour.map((par) => (par * dailyLight) / day);
  });
}

function read(state: SimulationState): DailyLightReading {
  return dailyLightReading(readHourAhead(state, DEFAULT_CONFIG));
}

describe('dailyLightReading', () => {
  it('reads the substrate’s day of light as the next tick leaves it', () => {
    const state = produce(planted(['java_fern']), (draft) => {
      draft.tick = 12;
      draft.equipment.light.enabled = false;
    });
    const settled = settleEnvironment(state, DEFAULT_CONFIG);

    expect(read(state).value).toBe(dailyLightIntegral(settled.resources.lightByHour));
    expect(read(state).value).toBeLessThan(dailyLightIntegral(state.resources.lightByHour));
  });

  it('needs what the plant furthest from its need starves under, at its own height', () => {
    const state = planted(['anubias', 'monte_carlo', 'java_fern']);
    const light = readPlantLight(settleEnvironment(state, DEFAULT_CONFIG), DEFAULT_CONFIG);
    const needed = Math.max(...light.map((plant) => plant.substrateEdge));
    const reading = read(state);

    expect(reading.needed).toBe(needed);
    expect(reading.need).toBe(`need ${needed.toFixed(2)}`);
  });

  it('reads a carpet short in the shade of a taller plant, on light its species alone would thrive on', () => {
    const shaded = planted(['amazon_sword', 'monte_carlo'], 100);
    const edge = dailyLightEdge('monte_carlo');
    const { needed } = read(shaded);
    expect(needed).toBeGreaterThan(edge * 1.02);

    expect(read(lit(shaded, edge * 1.01)).status).toBe('warn');
    expect(read(lit(shaded, needed * 1.01)).status).toBe('ok');
  });

  it('holds its tone while nothing is planted to need it', () => {
    const reading = read(createSimulation({ tankCapacity: 200 }));
    expect(reading.needed).toBe(0);
    expect(reading.need).toBe('');
    expect(reading.status).toBe('neutral');
  });

  it('reads short under the need, and dark at none', () => {
    const state = planted(['monte_carlo']);
    const { needed } = read(state);
    expect(read(lit(state, needed * 1.01)).status).toBe('ok');
    expect(read(lit(state, needed * 0.99)).status).toBe('warn');
    expect(read(lit(state, 0)).status).toBe('alert');
  });
});

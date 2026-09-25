import { describe, it, expect } from 'vitest';
import {
  applyAction,
  calculateSurface,
  createSimulation,
  MAX_SCRUB_PERCENT,
  MIN_SCRUB_PERCENT,
  type FishSpecies,
  type Resources,
  type SimulationState,
} from '../../simulation/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { blendConcentration, blendTemperature } from '../../simulation/core/blending.js';
import { calculateO2Saturation } from '../../simulation/systems/gas-exchange.js';
import { gasExchangeDefaults } from '../../simulation/config/gas-exchange.js';
import {
  HIGH_NITRATE_THRESHOLD,
  HIGH_NITRITE_THRESHOLD,
} from '../../simulation/alerts/index.js';
import {
  DEFAULT_SETTINGS,
  VERB_IDS,
  verbAction,
  verbDetail,
  type VerbDetail,
  type VerbId,
} from './verbs';
import { previewRows, type PreviewRow } from './readings';

function fixture(species: FishSpecies[] = ['neon_tetra', 'corydoras', 'betta']): SimulationState {
  let state = createSimulation({
    tankCapacity: 200,
    tapWaterTemperature: 18,
    tapWaterPH: 7.4,
  });
  state.equipment.substrate.type = 'aqua_soil';
  state.resources.surface = calculateSurface(state);

  state.resources.water = 196.4;
  state.resources.temperature = 25.4;
  state.resources.ph = 6.82;
  state.resources.ammonia = 0.034 * 196.4;
  state.resources.nitrite = 0.412 * 196.4;
  state.resources.nitrate = 18.6 * 196.4;
  state.resources.food = 0.12;
  state.algae.mass = 47;

  for (const s of species) {
    state = applyAction(state, { type: 'addFish', species: s }).state;
  }
  state = applyAction(state, { type: 'addPlant', species: 'java_fern' }).state;
  state = applyAction(state, { type: 'addPlant', species: 'anubias' }).state;
  expect(state.plants).toHaveLength(2);

  const sizes = [80, 60];
  return { ...state, plants: state.plants.map((plant, i) => ({ ...plant, size: sizes[i] })) };
}

function gassed(): SimulationState {
  const state = fixture();
  return { ...state, resources: { ...state.resources, co2: 28, oxygen: 3.2 } };
}

function detail(state: SimulationState, id: VerbId, settings = DEFAULT_SETTINGS): VerbDetail {
  return verbDetail(state, id, settings, 'metric', DEFAULT_CONFIG);
}

function row(rows: PreviewRow[], key: string): PreviewRow {
  const found = rows.find((r) => r.key === key);
  expect(found, `no ${key} row`).toBeTruthy();
  return found as PreviewRow;
}

describe('preview readings', () => {
  it('prices a water change from the physics, not from a plausible-looking figure', () => {
    const state = fixture();
    const { capacity } = state.tank;
    const water = state.resources.water;
    const removed = water * 0.25;
    const remaining = water - removed;
    const added = capacity - remaining;

    const rows = detail(state, 'waterChange').preview;

    expect(row(rows, 'nitrite').after).toBe(((state.resources.nitrite * 0.75) / capacity).toFixed(3));
    expect(row(rows, 'nitrate').after).toBe(((state.resources.nitrate * 0.75) / capacity).toFixed(1));
    expect(row(rows, 'temperature').after).toBe(
      blendTemperature(25.4, remaining, 18, added).toFixed(1)
    );
    expect(row(rows, 'level').after).toBe('100');
    expect(row(rows, 'level').before).toBe('98');
  });

  it('prices the dissolved gases the tap brings with it', () => {
    const state = gassed();
    const { capacity } = state.tank;
    const remaining = state.resources.water * 0.5;
    const added = capacity - remaining;
    const tapTemp = state.environment.tapWaterTemperature;

    const rows = detail(state, 'waterChange', { ...DEFAULT_SETTINGS, waterChange: 0.5 }).preview;

    expect(row(rows, 'oxygen').after).toBe(
      blendConcentration(3.2, remaining, calculateO2Saturation(tapTemp), added).toFixed(1)
    );
    expect(row(rows, 'co2').after).toBe(
      blendConcentration(28, remaining, gasExchangeDefaults.atmosphericCo2, added).toFixed(1)
    );
    expect(row(rows, 'oxygen').note).toBeNull();
    expect(row(rows, 'oxygen').status).toBe('ok');

    const tenth = detail(state, 'waterChange', { ...DEFAULT_SETTINGS, waterChange: 0.1 }).preview;
    expect(row(tenth, 'oxygen').note).toBe('below 4.0');
    expect(row(tenth, 'oxygen').status).toBe('warn');
  });

  it('shows the reading it started from, so before and after are the same scale', () => {
    const rows = detail(fixture(), 'waterChange').preview;

    expect(row(rows, 'nitrite').before).toBe('0.412');
    expect(row(rows, 'temperature').before).toBe('25.4');
    expect(row(rows, 'ph').before).toBe('6.82');
  });

  const REPORTED_BY: Partial<Record<keyof Resources, string>> = {
    water: 'level',
    temperature: 'temperature',
    ph: 'ph',
    ammonia: 'ammonia',
    nitrite: 'nitrite',
    nitrate: 'nitrate',
    phosphate: 'phosphate',
    potassium: 'potassium',
    iron: 'iron',
    oxygen: 'oxygen',
    co2: 'co2',
    food: 'food',
  };

  function movedResources(before: SimulationState, after: SimulationState): (keyof Resources)[] {
    const keys = Object.keys(before.resources) as (keyof Resources)[];
    return keys.filter((key) => {
      const from = before.resources[key];
      const to = after.resources[key];
      return typeof from === 'number' && typeof to === 'number' && from !== to;
    });
  }

  it.each<VerbId>(VERB_IDS)('reports every resource %s moves', (id) => {
    const state = gassed();
    const committed = applyAction(state, verbAction(id, DEFAULT_SETTINGS)).state;
    const shown = detail(state, id).preview.map((r) => r.key);

    for (const resource of movedResources(state, committed)) {
      const reading = REPORTED_BY[resource];
      expect(reading, `${id} moves ${resource}, which no reading carries`).toBeTruthy();
      expect(shown, `${id} moves ${resource} without saying so`).toContain(reading);
    }
  });

  it('dispatches the fraction the engine reads, not the percentage on the chip', () => {
    const state = fixture();
    const quarter = applyAction(state, { type: 'waterChange', amount: 0.25 }).state;

    expect(detail(state, 'waterChange').preview).toEqual(previewRows({ before: state, outcomes: [quarter], config: DEFAULT_CONFIG, units: 'metric' }));
    expect(applyAction(state, { type: 'waterChange', amount: 25 }).state.resources.water).toBe(
      state.resources.water
    );
  });

  it('reports the dilution a top-off causes, not just the level it restores', () => {
    const state = fixture();
    const rows = detail(state, 'topOff').preview;

    expect(row(rows, 'nitrite').after).toBe(
      (state.resources.nitrite / state.tank.capacity).toFixed(3)
    );
    expect(row(rows, 'level').after).toBe('100');
    expect(rows.map((r) => r.key)).not.toContain('temperature');
    expect(rows.map((r) => r.key)).not.toContain('ph');
  });

  it('leaves out the readings an action does not move', () => {
    expect(detail(fixture(), 'feed').preview.map((r) => r.key)).toEqual(['food']);
  });

  it('previews a scrub as the range the engine rolls', () => {
    const state = fixture();
    const rows = detail(state, 'scrubAlgae').preview;
    const gentle = state.algae.mass * (1 - MIN_SCRUB_PERCENT);
    const hard = state.algae.mass * (1 - MAX_SCRUB_PERCENT);

    expect(row(rows, 'algae').after).toBe(`${hard.toFixed(0)}–${gentle.toFixed(0)}`);
    expect(rows).toHaveLength(1);
  });

  it('warns on temperature only where a stocked species minds', () => {
    const withBetta = detail(fixture(), 'waterChange').preview;
    const withoutBetta = detail(fixture(['neon_tetra', 'corydoras']), 'waterChange').preview;

    expect(row(withBetta, 'temperature').after).toBe(row(withoutBetta, 'temperature').after);
    expect(row(withBetta, 'temperature').status).toBe('warn');
    expect(row(withBetta, 'temperature').note).toBe('below 24°C — heater recovers');
    expect(row(withoutBetta, 'temperature').status).toBe('neutral');
    expect(row(withoutBetta, 'temperature').note).toBeNull();
  });

  it('says a heater cannot recover a floor it is not set to hold', () => {
    const state = fixture();
    const cool = {
      ...state,
      equipment: {
        ...state.equipment,
        heater: { ...state.equipment.heater, targetTemperature: 23 },
      },
    };

    expect(row(detail(cool, 'waterChange').preview, 'temperature').note).toBe(
      'below 24°C — heater holds 23°C'
    );
  });

  it('says "still above" only where the engine’s line was already crossed', () => {
    const state = fixture();
    const cycling = {
      ...state,
      resources: { ...state.resources, nitrite: 1.6 * state.resources.water },
    };
    const nitrite = row(detail(cycling, 'waterChange').preview, 'nitrite');
    expect(nitrite.note).toBe(`still above ${HIGH_NITRITE_THRESHOLD.toFixed(2)}`);
    expect(nitrite.status).toBe('alert');

    const loaded = {
      ...state,
      resources: {
        ...state.resources,
        nitrate: (HIGH_NITRATE_THRESHOLD - 0.2) * state.resources.water,
      },
    };
    const nitrate = row(detail(loaded, 'dose', { ...DEFAULT_SETTINGS, dose: 4 }).preview, 'nitrate');
    expect(nitrate.note).toBe(`above ${HIGH_NITRATE_THRESHOLD}`);
  });

  it('reads its lines off the engine, not off the sketch they were drawn from', () => {
    const nitrite = row(detail(fixture(), 'waterChange').preview, 'nitrite');

    expect(nitrite.note).toBeNull();
    expect(nitrite.status).toBe('ok');
  });

  it('reads temperature in the reader’s own units', () => {
    const state = fixture();
    const metric = row(verbDetail(state, 'waterChange', DEFAULT_SETTINGS, 'metric', DEFAULT_CONFIG).preview, 'temperature');
    const imperial = row(verbDetail(state, 'waterChange', DEFAULT_SETTINGS, 'imperial', DEFAULT_CONFIG).preview, 'temperature');

    expect(metric.unit).toBe('°C');
    expect(metric.before).toBe('25.4');
    expect(imperial.unit).toBe('°F');
    expect(imperial.before).toBe('77.7');
    expect(imperial.note).toBe('below 75°F — heater recovers');
  });

  it('tracks the tank it is given, so a preview cannot go stale', () => {
    const state = fixture();
    const before = detail(state, 'waterChange').preview;

    const drained = { ...state, resources: { ...state.resources, water: 100 } };

    expect(row(detail(drained, 'waterChange').preview, 'level').before).toBe('50');
    expect(row(before, 'level').before).toBe('98');
  });
});

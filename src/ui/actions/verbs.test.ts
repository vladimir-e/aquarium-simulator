import { describe, it, expect } from 'vitest';
import {
  applyAction,
  createSimulation,
  MIN_ALGAE_TO_SCRUB,
  WATER_CHANGE_AMOUNTS,
  type SimulationState,
} from '../../simulation/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { calculatePassiveResources } from '../../simulation/equipment/index.js';
import { TRIM_TARGETS } from '../run';
import {
  DEFAULT_SETTINGS,
  DOSE_PRESETS,
  FEED_PRESETS,
  VERB_IDS,
  verbAction,
  verbDetail,
  verbTiles,
  type VerbDetail,
  type VerbId,
  type VerbSettings,
  type VerbTile,
} from './verbs';

function tank(): SimulationState {
  const state = createSimulation({ tankCapacity: 200, tapWaterTemperature: 18, tapWaterPH: 7.4 });
  state.equipment.substrate.type = 'aqua_soil';
  state.resources.surface = calculatePassiveResources(state).surface;
  state.resources.water = 196.4;
  state.algae.mass = 47;
  return state;
}

function planted(sizes: number[]): SimulationState {
  let state = tank();
  for (let i = 0; i < sizes.length; i++) {
    state = applyAction(state, { type: 'addPlant', species: 'java_fern' }).state;
  }
  expect(state.plants).toHaveLength(sizes.length);
  return { ...state, plants: state.plants.map((plant, i) => ({ ...plant, size: sizes[i] })) };
}

function detail(state: SimulationState, id: VerbId, settings: VerbSettings = DEFAULT_SETTINGS): VerbDetail {
  return verbDetail(state, id, settings, 'metric', DEFAULT_CONFIG);
}

function tile(state: SimulationState, id: VerbId, settings: VerbSettings = DEFAULT_SETTINGS): VerbTile {
  const found = verbTiles(state, settings, 'metric').find((t) => t.id === id);
  expect(found).toBeTruthy();
  return found!;
}

describe('the six verbs', () => {
  it('offers the engine’s own option sets rather than a retyped copy', () => {
    const state = planted([80, 60]);

    expect(detail(state, 'waterChange').options.map((o) => o.value)).toEqual([
      ...WATER_CHANGE_AMOUNTS,
    ]);
    expect(detail(state, 'trimPlants').options.map((o) => o.value)).toEqual(TRIM_TARGETS);
    expect(detail(state, 'feed').options.map((o) => o.value)).toEqual(FEED_PRESETS);
    expect(detail(state, 'dose').options.map((o) => o.value)).toEqual(DOSE_PRESETS);
  });

  it('prices each water-change rung in litres of this tank', () => {
    const hints = detail(tank(), 'waterChange').options.map((o) => o.hint);
    expect(hints).toEqual(['20 L', '49 L', '98 L', '177 L']);
  });

  it('counts the plants each trim rung would actually reach', () => {
    const options = detail(planted([80, 60]), 'trimPlants').options;

    expect(options.map((o) => o.hint)).toEqual(['2 plants', '1 plant', 'none']);
    expect(options.map((o) => o.disabled)).toEqual([false, false, true]);
  });

  it('dispatches the shape the engine reads, and lets it roll its own scrub', () => {
    const settings: VerbSettings = { feed: 2, waterChange: 0.9, dose: 4, trimPlants: 50 };

    expect(verbAction('feed', settings)).toEqual({ type: 'feed', amount: 2 });
    expect(verbAction('waterChange', settings)).toEqual({ type: 'waterChange', amount: 0.9 });
    expect(verbAction('dose', settings)).toEqual({ type: 'dose', amountMl: 4 });
    expect(verbAction('trimPlants', settings)).toEqual({ type: 'trimPlants', targetSize: 50 });
    expect(verbAction('topOff', settings)).toEqual({ type: 'topOff' });
    expect(verbAction('scrubAlgae', settings)).toEqual({ type: 'scrubAlgae' });
  });

  it('carries the setting on the tile for the four that take one, the reading for the two that do not', () => {
    const state = planted([80, 60]);
    const values = Object.fromEntries(
      verbTiles(state, DEFAULT_SETTINGS, 'metric').map((t) => [t.id, t.value])
    );

    expect(values).toMatchObject({
      feed: '0.5 g',
      waterChange: '25 %',
      dose: '2 ml',
      trimPlants: 'to 75 %',
      topOff: '+3.6 L',
      scrubAlgae: '47 %',
    });
  });

  it('reads the tile in the reader’s own volume units', () => {
    const gallons = verbTiles(tank(), DEFAULT_SETTINGS, 'imperial').find((t) => t.id === 'topOff');
    expect(gallons?.value).toBe('+1.0 gal');
  });

  it('states why a verb is off, in the same place it would say what it does', () => {
    const bare = tank();
    const empty = { ...bare, resources: { ...bare.resources, water: 0 } };
    const full = { ...bare, resources: { ...bare.resources, water: bare.tank.capacity } };
    const clean = { ...bare, algae: { ...bare.algae, mass: MIN_ALGAE_TO_SCRUB - 2 } };

    expect(tile(bare, 'dose').blocked).toBe('no plants to feed');
    expect(tile(bare, 'dose').value).toBe('no plants to feed');
    expect(tile(empty, 'waterChange').blocked).toBe('no water to change');
    expect(tile(full, 'topOff').blocked).toBe('already at capacity');
    expect(tile(clean, 'scrubAlgae').blocked).toBe(`needs ${MIN_ALGAE_TO_SCRUB} % algae, now 3 %`);
    expect(tile(planted([40]), 'trimPlants').blocked).toBe('nothing above 75 %');
  });

  it('blocks a trim rung by rung, not once for the verb', () => {
    const state = planted([80, 60]);

    expect(detail(state, 'trimPlants', { ...DEFAULT_SETTINGS, trimPlants: 50 }).blocked).toBeNull();
    expect(detail(state, 'trimPlants', { ...DEFAULT_SETTINGS, trimPlants: 85 }).blocked).toBe(
      'nothing above 85 %'
    );
  });

  it('leaves a blocked verb its settings step, so the reason is reachable', () => {
    const unplanted = detail(tank(), 'dose');

    expect(unplanted.blocked).toBe('no plants to feed');
    expect(unplanted.options).toHaveLength(DOSE_PRESETS.length);
    expect(unplanted.preview.length).toBeGreaterThan(0);
  });

  it('fills the settings step of the two bare verbs with what they will do', () => {
    for (const id of ['topOff', 'scrubAlgae'] as const) {
      const bare = detail(tank(), id);
      expect(bare.options).toEqual([]);
      expect(bare.setting).toBeNull();
      expect(bare.note).toMatch(/No amount to set/);
    }

    expect(detail(tank(), 'scrubAlgae').note).toContain('10–30 %');
    expect(detail(tank(), 'topOff').note).toContain('diluted');
  });

  it('points the chips at the verb they configure', () => {
    expect(detail(tank(), 'waterChange').setting).toEqual({ verb: 'waterChange', value: 0.25 });
    expect(detail(planted([80]), 'trimPlants').setting).toEqual({ verb: 'trimPlants', value: 75 });
  });

  it('labels the commit with the action and its amount', () => {
    const state = planted([80, 60]);
    const labels = VERB_IDS.map((id) => detail(state, id).commitLabel);

    expect(labels).toEqual([
      'Feed 0.5 g',
      'Change water · 25 %',
      'Top off · +3.6 L',
      'Dose 2 ml',
      'Trim to 75 %',
      'Scrub algae',
    ]);
  });

  it('prices a feed against the ration the roster actually burns', () => {
    const bare = tank();
    let stocked = bare;
    for (let i = 0; i < 8; i++) {
      stocked = applyAction(stocked, { type: 'addFish', species: 'corydoras' }).state;
    }

    expect(detail(bare, 'feed').meta).toBe('no fish to feed');
    expect(detail(bare, 'feed').options.map((o) => o.hint)).toEqual(['—', '—', '—', '—']);

    const lean = applyAction(bare, { type: 'addFish', species: 'neon_tetra' }).state;
    const days = (state: SimulationState): number =>
      parseFloat(detail(state, 'feed').options[1].hint);
    // More mouths, fewer days out of the same gram — the overfeeding signal.
    expect(days(stocked)).toBeLessThan(days(lean));
    expect(detail(stocked, 'feed').meta).toMatch(/^8 fish eat \d+\.\d\d g a day$/);
  });

  it('names the food already standing in the water, which left Livestock with the verb', () => {
    const state = tank();
    const fed = applyAction(
      applyAction(state, { type: 'addFish', species: 'neon_tetra' }).state,
      { type: 'feed', amount: 0.5 }
    ).state;

    expect(detail(fed, 'feed').meta).toContain('0.50 g still in the water');
  });
});

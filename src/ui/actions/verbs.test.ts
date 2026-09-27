import { describe, it, expect } from 'vitest';
import {
  applyAction,
  calculateSurface,
  createHardscapeItem,
  createSimulation,
  MAX_DOSE_ML,
  MAX_ROOT_TABS,
  placeHardscape,
  WATER_CHANGE_AMOUNTS,
  type SimulationState,
} from '../../simulation/index.js';
import { DEFAULT_CONFIG, mapNutrients, type Nutrient, type TunableConfig } from '../../simulation/config/index.js';
import { getMassFromPpm } from '../../simulation/resources/index.js';
import { produce } from 'immer';
import { bedReading, doseToCover, nutrientProbe, nutrientReadings, TRIM_TARGETS } from '../run';
import {
  DEFAULT_SETTINGS,
  DOSE_PRESETS,
  FEED_PRESETS,
  ROOT_TAB_PRESETS,
  VERB_IDS,
  verbAction,
  verbDetail,
  verbRows,
  type VerbDetail,
  type VerbId,
  type VerbSettings,
  type VerbRow,
} from './verbs';

function tank(): SimulationState {
  const state = createSimulation({ tankCapacity: 200, tapWaterTemperature: 18, tapKh: 4 });
  state.equipment.substrate.type = 'aqua_soil';
  state.resources.surface = calculateSurface(state);
  state.resources.water = 196.4;
  state.algae.film.mass = 47;
  return state;
}

function starved(): SimulationState {
  return applyAction(tank(), { type: 'addPlant', species: 'monte_carlo' }).state;
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

function row(state: SimulationState, id: VerbId, settings: VerbSettings = DEFAULT_SETTINGS): VerbRow {
  const found = verbRows(state, settings, 'metric').find((t) => t.id === id);
  expect(found).toBeTruthy();
  return found!;
}

describe('the seven verbs', () => {
  it('offers the engine’s own option sets rather than a retyped copy', () => {
    const state = planted([80, 60]);

    expect(detail(state, 'waterChange').options.map((o) => o.value)).toEqual([
      ...WATER_CHANGE_AMOUNTS,
    ]);
    expect(detail(state, 'trimPlants').options.map((o) => o.value)).toEqual(TRIM_TARGETS);
    expect(detail(state, 'feed').options.map((o) => o.value)).toEqual(FEED_PRESETS);
    const advice = doseToCover(nutrientReadings(state, DEFAULT_CONFIG), state, DEFAULT_CONFIG);
    expect(detail(state, 'dose').options.map((o) => o.value)).toEqual(
      [...DOSE_PRESETS, advice!.ml].sort((a, b) => a - b)
    );
    expect(detail(state, 'dose').options.find((o) => o.value === advice!.ml)?.hint).toBe(
      'covers the ask'
    );
  });

  it('prices a dose by the formula the config carries', () => {
    const state = planted([80, 60]);
    const fifth = produce(DEFAULT_CONFIG, (draft) => {
      draft.nutrients.fertilizerFormula.nitrate /= 5;
    });
    const rise = (config: TunableConfig): number => {
      const hint = verbDetail(state, 'dose', DEFAULT_SETTINGS, 'metric', config).options.find(
        (option) => option.value === DEFAULT_SETTINGS.dose
      )?.hint;
      return Number(hint?.match(/[\d.]+/)?.[0]);
    };

    expect(rise(DEFAULT_CONFIG)).toBeGreaterThan(0);
    expect(rise(fifth)).toBeCloseTo(rise(DEFAULT_CONFIG) / 5, 5);
  });

  it('sets the advised dose among the presets rather than after them', () => {
    const state = planted([80, 60]);
    const asking = doseToCover(nutrientReadings(state, DEFAULT_CONFIG), state, DEFAULT_CONFIG)!;
    const nearly = applyAction(state, { type: 'dose', amountMl: asking.ml - 3 }).state;
    const advice = doseToCover(nutrientReadings(nearly, DEFAULT_CONFIG), nearly, DEFAULT_CONFIG)!;

    expect(advice.ml).toBeGreaterThan(DOSE_PRESETS[0]);
    expect(advice.ml).toBeLessThan(DOSE_PRESETS[DOSE_PRESETS.length - 1]);

    const values = detail(nearly, 'dose').options.map((o) => o.value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(values).toContain(advice.ml);
  });

  it('offers the engine’s biggest single dose where the ask is bigger still', () => {
    const state = starved();
    const advice = doseToCover(nutrientReadings(state, DEFAULT_CONFIG), state, DEFAULT_CONFIG)!;
    expect(advice.ml).toBeGreaterThan(MAX_DOSE_ML);

    const options = detail(state, 'dose').options;
    expect(options.map((o) => o.value)).toEqual([...DOSE_PRESETS, MAX_DOSE_ML]);
    expect(options.find((o) => o.value === MAX_DOSE_ML)?.hint).toBe(`capped at ${MAX_DOSE_ML} ml`);
    expect(options.some((o) => o.value === advice.ml)).toBe(false);
  });

  it('keeps the rung the reader chose on the ladder once the tank stops asking for it', () => {
    const state = planted([80, 60]);
    const advice = doseToCover(nutrientReadings(state, DEFAULT_CONFIG), state, DEFAULT_CONFIG)!;
    const fed = applyAction(state, { type: 'dose', amountMl: advice.ml }).state;
    const chosen = { ...DEFAULT_SETTINGS, dose: advice.ml };

    expect(detail(fed, 'dose', chosen).options.map((o) => o.value)).toContain(advice.ml);
    expect(detail(fed, 'dose', chosen).setting?.value).toBe(advice.ml);
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

  describe('held to one family', () => {
    /** Two java fern families: the first with a tall offshoot, the second one tall founder. */
    function families(): { state: SimulationState; first: string; second: string } {
      const base = planted([80, 90]);
      const [a, b] = base.plants;
      const bud = { ...a, id: 'plant_bud', parentId: a.id, size: 70 };
      return { state: { ...base, plants: [a, b, bud] }, first: a.familyId, second: b.familyId };
    }

    it('trims that family and nothing else', () => {
      const { state, first } = families();
      const action = verbAction('trimPlants', { ...DEFAULT_SETTINGS, trimPlants: 50 }, { familyId: first });
      const trimmed = applyAction(state, action).state;

      expect(action).toEqual({ type: 'trimPlants', targetSize: 50, familyId: first });
      expect(trimmed.plants.map((plant) => plant.size)).toEqual([50, 90, 50]);
    });

    it('counts, refuses and names its commit by what the family holds', () => {
      const { state, first, second } = families();
      const scoped = (familyId: string, trimPlants: number): VerbDetail =>
        verbDetail(state, 'trimPlants', { ...DEFAULT_SETTINGS, trimPlants }, 'metric', DEFAULT_CONFIG, {
          familyId,
        });

      expect(scoped(first, 75).options.map((o) => o.hint)).toEqual(['2 plants', '1 plant', 'none']);
      expect(scoped(first, 75).meta).toBe('Java Fern · 1 of 2 plants · largest 80 %');
      expect(scoped(first, 75).commitLabel).toBe('Trim family to 75 %');
      expect(scoped(first, 75).title).toBe('Trim family 1');
      expect(scoped(second, 75).title).toBe('Trim family 2');
      expect(scoped(first, 85).blocked).toBe('nothing above 85 %');
      expect(scoped(second, 85).blocked).toBeNull();
      expect(detail(state, 'trimPlants', { ...DEFAULT_SETTINGS, trimPlants: 85 }).blocked).toBeNull();
    });

    it('previews the shade the cut takes off the floor, though the largest plant stands elsewhere', () => {
      const { state, first } = families();
      const preview = verbDetail(state, 'trimPlants', DEFAULT_SETTINGS, 'metric', DEFAULT_CONFIG, {
        familyId: first,
      }).preview;

      expect(preview.map((row) => row.key)).toEqual(['floorShade']);
      expect(Number(preview[0].after)).toBeLessThan(Number(preview[0].before));
    });
  });

  it('dispatches the shape the engine reads', () => {
    const settings: VerbSettings = { feed: 2, waterChange: 0.9, dose: 4, rootTab: 3, trimPlants: 50 };

    expect(verbAction('feed', settings)).toEqual({ type: 'feed', amount: 2 });
    expect(verbAction('waterChange', settings)).toEqual({ type: 'waterChange', amount: 0.9 });
    expect(verbAction('dose', settings)).toEqual({ type: 'dose', amountMl: 4 });
    expect(verbAction('rootTab', settings)).toEqual({ type: 'rootTab', count: 3 });
    expect(verbAction('trimPlants', settings)).toEqual({ type: 'trimPlants', targetSize: 50 });
    expect(verbAction('topOff', settings)).toEqual({ type: 'topOff' });
    expect(verbAction('scrubAlgae', settings)).toEqual({ type: 'scrubAlgae' });
  });

  it('carries the setting on the row for the four that take one, the reading for the two that do not', () => {
    const state = planted([80, 60]);
    const values = Object.fromEntries(
      verbRows(state, DEFAULT_SETTINGS, 'metric').map((t) => [t.id, t.value])
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

  it('reads the row in the reader’s own volume units', () => {
    const gallons = verbRows(tank(), DEFAULT_SETTINGS, 'imperial').find((t) => t.id === 'topOff');
    expect(gallons?.value).toBe('+1.0 gal');
  });

  it('states why a verb is off, in the same place it would say what it does', () => {
    const bare = tank();
    const empty = { ...bare, resources: { ...bare.resources, water: 0 } };
    const full = { ...bare, resources: { ...bare.resources, water: bare.tank.capacity } };
    const clean = { ...bare, algae: { ...bare.algae, film: { ...bare.algae.film, mass: 0.4 } } };

    expect(row(bare, 'dose').blocked).toBe('no plants to fertilise');
    expect(row(bare, 'dose').value).toBe('2 ml');
    expect(row(empty, 'waterChange').blocked).toBe('no water to change');
    expect(row(full, 'topOff').blocked).toBe('already at capacity');
    expect(row(clean, 'scrubAlgae').blocked).toBe('the glass is clean');
    expect(row(bare, 'scrubAlgae').blocked).toBeNull();
    expect(row(planted([40]), 'trimPlants').blocked).toBe('nothing above 75 %');
    const bareBottom = { ...bare, equipment: { ...bare.equipment, substrate: { ...bare.equipment.substrate, type: 'none' as const } } };
    expect(row(bareBottom, 'rootTab').blocked).toBe('no bed to push a tab into');
    expect(detail(bareBottom, 'rootTab').options.every((o) => o.disabled)).toBe(true);
  });

  it('offers the tabs that cover a starving root feeder, and previews the bed they fill', () => {
    const sword = applyAction(tank(), { type: 'addPlant', species: 'amazon_sword' }).state;
    const { advice } = bedReading(sword, DEFAULT_CONFIG)!;
    const sheet = detail(sword, 'rootTab');

    expect(advice).toBeGreaterThan(0);
    expect(sheet.options.map((o) => o.value)).toEqual([...new Set([...ROOT_TAB_PRESETS, advice!])].sort((a, b) => a - b));
    expect(sheet.options.find((o) => o.value === advice)?.hint).toBe('covers the ask');
    expect(sheet.options.every((o) => o.value <= MAX_ROOT_TABS)).toBe(true);
    expect(sheet.preview.map((r) => r.key)).toEqual(['bed']);
    expect(sheet.preview[0]).toMatchObject({ before: '0.0', after: '1.0', unit: 'tabs' });
  });

  it('holds the preview and the rung hints on the standing reading’s nutrient when the tabs flip which one binds', () => {
    const sword = applyAction(tank(), { type: 'addPlant', species: 'amazon_sword' }).state;
    const count = DEFAULT_SETTINGS.rootTab;
    const tab = DEFAULT_CONFIG.nutrients.rootTab;
    const need = mapNutrients((n) =>
      getMassFromPpm(nutrientProbe(sword, DEFAULT_CONFIG).need.bed[n], sword.tank.capacity)
    );
    const coverPerTab = (n: Nutrient): number => tab[n] / need[n];
    const nitrateCoverPhosphateOvertakes = (count * (coverPerTab('phosphate') - coverPerTab('nitrate'))) / 2;
    const state = produce(sword, (draft) => {
      draft.equipment.substrate.nutrients = {
        nitrate: nitrateCoverPhosphateOvertakes * need.nitrate,
        phosphate: 0,
        potassium: 3 * need.potassium,
        iron: 3 * need.iron,
      };
    });
    const after = applyAction(state, { type: 'rootTab', count }).state;
    expect(bedReading(state, DEFAULT_CONFIG)!.nutrient).toBe('phosphate');
    expect(bedReading(after, DEFAULT_CONFIG)!.nutrient).toBe('nitrate');

    const onPhosphate = bedReading(after, DEFAULT_CONFIG, undefined, 'phosphate')!.text;
    expect(onPhosphate).not.toBe(bedReading(after, DEFAULT_CONFIG)!.text);
    const sheet = detail(state, 'rootTab');
    expect(sheet.preview.find((r) => r.key === 'bed')?.after).toBe(onPhosphate);
    expect(sheet.options.find((o) => o.value === count)?.hint).toBe(`bed ${onPhosphate}`);
  });

  it('offers the most tabs the engine takes where a starved bed asks for more, and says it is capped', () => {
    const big = createSimulation({ tankCapacity: 400 });
    big.equipment.substrate.type = 'gravel';
    const swords = ['amazon_sword', 'amazon_sword'] as const;
    const state = swords.reduce(
      (current, species) => applyAction(current, { type: 'addPlant', species }).state,
      big
    );
    const { advice } = bedReading(state, DEFAULT_CONFIG)!;
    const options = detail(state, 'rootTab').options;

    expect(advice).toBeGreaterThan(MAX_ROOT_TABS);
    expect(options.map((o) => o.value)).toEqual([...ROOT_TAB_PRESETS, MAX_ROOT_TABS]);
    expect(options.find((o) => o.value === MAX_ROOT_TABS)?.hint).toBe(`capped at ${MAX_ROOT_TABS} tabs`);
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

    expect(unplanted.blocked).toBe('no plants to fertilise');
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

    expect(detail(tank(), 'scrubAlgae').note).toContain('clears the glass');
    expect(detail(tank(), 'topOff').note).toContain('diluted');
  });

  it('previews the light a water change lets back onto the floor through green water', () => {
    const green = produce(tank(), (draft) => {
      draft.algae.greenWater.mass = 80;
    });
    const floor = detail(green, 'waterChange', { ...DEFAULT_SETTINGS, waterChange: 0.5 }).preview.find(
      (preview) => preview.key === 'floorLight'
    )!;

    expect(Number(floor.after)).toBeGreaterThan(Number(floor.before));
  });

  it('names what a scrub leaves standing by the places the tank has off the glass', () => {
    const rocked = placeHardscape(tank(), createHardscapeItem('rock', 'neutral_rock'));

    expect(detail(tank(), 'scrubAlgae').note).toContain('what coats the floor stays');
    expect(detail(rocked, 'scrubAlgae').note).toContain('what coats the floor and the hardscape stays');
  });

  it('points the chips at the verb they configure, under the heading they read', () => {
    expect(detail(tank(), 'waterChange').setting).toEqual({
      verb: 'waterChange',
      value: 0.25,
      label: 'Replace',
    });
    expect(detail(planted([80]), 'trimPlants').setting).toEqual({
      verb: 'trimPlants',
      value: 75,
      label: 'Trim to',
    });
  });

  it('labels the commit with the action and its amount', () => {
    const state = planted([80, 60]);
    const labels = VERB_IDS.map((id) => detail(state, id).commitLabel);

    expect(labels).toEqual([
      'Feed 0.5 g',
      'Change 25 % water',
      'Top off +3.6 L',
      'Dose 2 ml',
      'Push 1 tab',
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
    expect(days(stocked)).toBeLessThan(days(lean));
    expect(detail(stocked, 'feed').meta).toMatch(/^8 fish eat \d+\.\d\d g a day$/);
  });

  it('stops counting days once a ration would outlast the month', () => {
    const lean = applyAction(tank(), { type: 'addFish', species: 'neon_tetra' }).state;
    let crowded = tank();
    for (let i = 0; i < 8; i++) {
      crowded = applyAction(crowded, { type: 'addFish', species: 'corydoras' }).state;
    }

    expect(detail(lean, 'feed').options.map((o) => o.hint)).toEqual(FEED_PRESETS.map(() => '30+ d'));
    expect(detail(crowded, 'feed').options[0].hint).toMatch(/^\d/);
  });

  it('says a ration under the engine’s precision is under it, rather than zero', () => {
    const fry = applyAction(tank(), { type: 'addFish', species: 'neon_tetra' }).state;
    const tiny = { ...fry, fish: fry.fish.map((fish) => ({ ...fish, mass: 0.001 })) };

    expect(detail(tiny, 'feed').meta).toBe('1 fish eats under 0.01 g a day');
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

import { describe, it, expect } from 'vitest';
import {
  applyAction,
  calculateFloorArea,
  calculateNutrientSufficiency,
  tankPools,
  calculateSurface,
  createSimulation,
  floorCover,
  getDosePreview,
  growthFormOf,
  getPlantsToTrimCount,
  readPlantLight,
  tick,
  type PlantSpecies,
  type SimulationState,
} from '../../simulation/index.js';
import { DEFAULT_CONFIG, MAX_SUFFICIENCY_EDGE, NUTRIENTS } from '../../simulation/config/index.js';
import { speciesHalfSaturation } from '../../simulation/systems/nutrients.js';
import { MAX_DOSE_ML } from '../../simulation/actions/dose.js';
import { produce } from 'immer';
import {
  algaeReading,
  algaeStatus,
  bedReading,
  doseDeltas,
  doseToCover,
  floorPlanted,
  formatDose,
  nutrientAlert,
  nutrientReadings,
  groupPlantsBySpecies,
  plantLabels,
  plantRows,
  TRIM_TARGETS,
  type PlantRow,
  type PlantSpeciesGroup,
} from './flora';
import { readHourAhead } from './ahead';
import { conditionStatus, conditionWord, projectedTrend, type Reading } from './status';

const FORMULA = DEFAULT_CONFIG.nutrients.fertilizerFormula;

function tank(capacity = 200): SimulationState {
  const state = createSimulation({ tankCapacity: capacity });
  state.equipment.substrate.type = 'aqua_soil';
  state.resources.surface = calculateSurface(state);
  return state;
}

function planted(species: PlantSpecies[], capacity = 200): SimulationState {
  const state = species.reduce(
    (current, s) => applyAction(current, { type: 'addPlant', species: s }).state,
    tank(capacity)
  );
  expect(state.plants).toHaveLength(species.length);
  return state;
}

function dosed(state: SimulationState, ml: number): SimulationState {
  return applyAction(state, { type: 'dose', amountMl: ml }).state;
}

describe('condition + algae words', () => {
  it('maps plant condition to status and word', () => {
    expect(conditionStatus(20)).toBe('alert');
    expect(conditionStatus(45)).toBe('warn');
    expect(conditionStatus(90)).toBe('ok');
    expect(conditionWord(5)).toBe('dying');
    expect(conditionWord(50)).toBe('fair');
    expect(conditionWord(95)).toBe('thriving');
  });

  it('maps algae mass to status and word (low is good)', () => {
    expect(algaeStatus(30, 30)).toBe('ok');
    expect(algaeStatus(45, 30)).toBe('warn');
    expect(algaeStatus(61, 30)).toBe('alert');
    expect(algaeReading(1, 30).word).toBe('sparse');
    expect(algaeReading(45, 30).word).toBe('spreading');
    expect(algaeReading(95, 30).word).toBe('booming');
  });

  it('cuts the word ladder from the same line as the tone, wherever it is tuned', () => {
    for (const line of [20, 80]) {
      expect(algaeReading(line * 0.4, line)).toEqual({ status: 'ok', word: 'sparse' });
      expect(algaeReading(line, line)).toEqual({ status: 'ok', word: 'active' });
      expect(algaeReading(line * 1.5, line)).toEqual({ status: 'warn', word: 'spreading' });
      expect(algaeReading(line * 2.5, line)).toEqual({ status: 'alert', word: 'booming' });
    }
  });
});

function rows(state: SimulationState, config = DEFAULT_CONFIG): PlantRow[] {
  return plantRows(state, config, readHourAhead(state, config));
}

const THRIVING: Reading = { status: 'ok', word: 'thriving' };
const SICK: Reading = { status: 'warn', word: 'sick' };
const STRUGGLING: Reading = { status: 'alert', word: 'struggling' };

type Unit = Omit<PlantRow, 'label'> & { parentId: string | null };

function unit(id: string, familyId: string, overrides: Partial<Unit> = {}): Unit {
  return {
    id,
    species: 'java_fern',
    name: 'Java Fern',
    familyId,
    parentId: id === familyId ? null : familyId,
    size: 50,
    age: 0,
    condition: 100,
    sick: false,
    reading: THRIVING,
    light: 1,
    lightStatus: 'ok',
    bank: 0,
    ...overrides,
  };
}

/** Units as the run layer hands them over: labelled off their lineage. */
function grouped(units: Unit[]): PlantSpeciesGroup[] {
  const labels = plantLabels(units);
  return groupPlantsBySpecies(units.map((u) => ({ ...u, label: labels.get(u.id)! })));
}

describe('groupPlantsBySpecies', () => {
  it('groups each species into the families it was planted as, each down its line in planting order', () => {
    const groups = grouped([
      unit('a', 'a'),
      unit('m', 'm', { species: 'monte_carlo', name: 'Monte Carlo' }),
      unit('b', 'b'),
      unit('a1', 'a'),
      unit('b1', 'b'),
      unit('a2', 'a', { parentId: 'a1' }),
    ]);

    expect(groups.map((group) => group.name)).toEqual(['Java Fern', 'Monte Carlo']);
    const [ferns, carpet] = groups;
    expect(ferns.families.map((family) => family.members.map((member) => member.id))).toEqual([
      ['a', 'a1', 'a2'],
      ['b', 'b1'],
    ]);
    expect(ferns.members.map((member) => member.id)).toEqual(['a', 'b', 'a1', 'b1', 'a2']);
    expect(carpet.families.map((family) => family.familyId)).toEqual(['m']);
  });

  it('sums a group’s sizes, and reads its oldest, its worst-lit and its mean condition', () => {
    const [ferns] = grouped([
      unit('a', 'a', { size: 90, age: 900, light: 1.4, condition: 100 }),
      unit('a1', 'a', { size: 40, age: 100, light: 0.6, condition: 70 }),
      unit('b', 'b', { size: 20, age: 300, light: 1.1, condition: 40 }),
    ]);
    const [a, b] = ferns.families;

    expect(a).toMatchObject({ size: 130, oldest: 900, light: 0.6, condition: 85 });
    expect(b).toMatchObject({ size: 20, oldest: 300, light: 1.1, condition: 40 });
    expect(ferns.size).toBeCloseTo(150, 10);
    expect(ferns).toMatchObject({ oldest: 900, light: 0.6, condition: 70 });
  });

  it('reads a family by the group rule over its units, and a species by it over its families', () => {
    const [ferns] = grouped([
      unit('a', 'a', { reading: STRUGGLING, condition: 20 }),
      unit('a1', 'a', { reading: STRUGGLING, condition: 25 }),
      unit('a2', 'a'),
      unit('b', 'b', { reading: SICK }),
      unit('c', 'c'),
    ]);
    const [a, b, c] = ferns.families;

    expect(a.reading).toEqual({ status: 'alert', word: '2 struggling' });
    expect(b.reading).toEqual(SICK);
    expect(c.reading).toEqual(THRIVING);
    expect(ferns.reading).toEqual({ status: 'alert', word: '1 struggling' });
  });

  it('counts families, not units, at the species, under the reason they share', () => {
    const [ferns] = grouped([
      unit('a', 'a', { reading: SICK }),
      unit('a1', 'a', { reading: SICK }),
      unit('b', 'b', { reading: SICK }),
      unit('c', 'c'),
    ]);
    expect(ferns.families[0].reading.word).toBe('2 sick');
    expect(ferns.reading).toEqual({ status: 'warn', word: '2 sick' });
  });

  it('reads a species of one family of one unit as that unit', () => {
    const [ferns] = grouped([unit('a', 'a', { reading: STRUGGLING, condition: 20 })]);
    expect(ferns.families[0].reading).toEqual(STRUGGLING);
    expect(ferns.reading).toEqual(STRUGGLING);
  });
});

describe('floorPlanted', () => {
  const capacity = 1000;
  const carpets = (count: number): SimulationState => {
    const state = createSimulation({ tankCapacity: capacity });
    const [plant] = applyAction(tank(capacity), { type: 'addPlant', species: 'monte_carlo' }).state
      .plants;
    return { ...state, plants: Array.from({ length: count }, () => plant) };
  };
  const fill = Math.ceil(calculateFloorArea(capacity) / growthFormOf('monte_carlo').footprintCm2);

  it('reads the floor the planting claims while it fits, never a line it has not reached', () => {
    for (const count of [1, fill - 1]) {
      const cover = floorCover(carpets(count).plants, capacity);
      expect(floorPlanted(carpets(count))).toBe(`floor ${Math.floor(cover * 100)} % planted`);
    }
  });

  it('says the planting has outgrown its floor past it, never at a figure that would put it back', () => {
    for (const count of [fill, fill * 3]) {
      const cover = floorCover(carpets(count).plants, capacity);
      expect(cover).toBeGreaterThan(1);
      expect(floorPlanted(carpets(count))).toBe(`floor outgrown · ${Math.ceil(cover * 100)} % claimed`);
    }
  });
});

describe('plantRows', () => {
  it('reads each unit’s light at its own height, as a share of what its species starves under', () => {
    const state = planted(['amazon_sword', 'monte_carlo', 'java_fern']);
    const light = readPlantLight(state, DEFAULT_CONFIG);

    rows(state).forEach((row, i) => {
      expect(row.light).toBeCloseTo(light[i].needShare, 12);
    });
  });

  it('reads a bank as its share of the next offshoot’s price, full at the cap', () => {
    const cap = DEFAULT_CONFIG.plants.surplusCap;
    const state = produce(planted(['java_fern', 'java_fern', 'java_fern']), (draft) => {
      draft.plants[0].surplus = 0;
      draft.plants[1].surplus = cap / 4;
      draft.plants[2].surplus = cap;
    });
    expect(rows(state).map((row) => row.bank)).toEqual([0, 0.25, 1]);
  });

  it('carries each unit’s lineage and age', () => {
    const base = planted(['java_fern']);
    const [founder] = base.plants;
    const state: SimulationState = {
      ...base,
      plants: [
        { ...founder, age: 240 },
        { ...founder, id: 'plant_bud', parentId: founder.id, age: 24 },
      ],
    };
    expect(rows(state).map(({ familyId, label, age }) => ({ familyId, label, age }))).toEqual([
      { familyId: founder.id, label: { family: 1, unit: 1, parent: null }, age: 240 },
      { familyId: founder.id, label: { family: 1, unit: 2, parent: 1 }, age: 24 },
    ]);
  });
});

describe('plantLabels', () => {
  const kin = (
    id: string,
    familyId: string,
    parentId: string | null,
    species: PlantSpecies = 'java_fern'
  ): { id: string; familyId: string; parentId: string | null; species: PlantSpecies } => ({
    id,
    familyId,
    parentId,
    species,
  });

  it('numbers families in founding order within their species, and units in birth order within their family', () => {
    const labels = plantLabels([
      kin('plant_5', 'plant_1', 'plant_1'),
      kin('plant_1', 'plant_1', null),
      kin('plant_3', 'plant_3', null),
      kin('plant_4', 'plant_4', null, 'monte_carlo'),
      kin('plant_a', 'plant_1', 'plant_5'),
    ]);

    expect(labels.get('plant_1')).toEqual({ family: 1, unit: 1, parent: null });
    expect(labels.get('plant_5')).toEqual({ family: 1, unit: 2, parent: 1 });
    expect(labels.get('plant_a')).toEqual({ family: 1, unit: 3, parent: 2 });
    expect(labels.get('plant_3')).toEqual({ family: 2, unit: 1, parent: null });
    expect(labels.get('plant_4')).toEqual({ family: 1, unit: 1, parent: null });
  });

  it('keeps a family its number when its founder dies, and names no parent that is gone', () => {
    const labels = plantLabels([kin('plant_3', 'plant_3', null), kin('plant_a', 'plant_1', 'plant_1')]);

    expect(labels.get('plant_a')).toEqual({ family: 1, unit: 1, parent: null });
    expect(labels.get('plant_3')).toEqual({ family: 2, unit: 1, parent: null });
  });

  it('calls a plant sick exactly while the next tick takes condition off it, as the trend shows', () => {
    const dark = produce(planted(['java_fern']), (draft) => {
      draft.equipment.light.enabled = false;
      draft.resources.lightByHour.fill(0);
    });
    expect(rows(dark)[0].reading.word).toBe('sick');

    const banked = produce(dark, (draft) => {
      draft.plants[0].surplus = DEFAULT_CONFIG.plants.surplusCap;
    });
    for (const state of [dark, banked]) {
      const [row] = rows(state);
      const next = tick(state, DEFAULT_CONFIG).plants[0];
      expect(row.sick).toBe(row.reading.word === 'sick');
      expect(row.sick).toBe(projectedTrend(next.condition - row.condition).startsWith('↘'));
    }
  });

  it('names the plant declining and the plant thriving', () => {
    const state = planted(['java_fern']);
    const struggling = {
      ...state,
      plants: state.plants.map((p) => ({ ...p, condition: 22 })),
    };

    expect(rows(state)[0].reading.word).toBe('thriving');
    expect(rows(struggling)[0].reading).toEqual({ word: 'struggling', status: 'alert' });
  });
});

describe('nutrientReadings', () => {
  it('reads every nutrient against what the tank’s hungriest plant needs of it', () => {
    const state = planted(['java_fern', 'monte_carlo']);
    const readings = nutrientReadings(state, DEFAULT_CONFIG);
    expect(readings.map((r) => r.label)).toEqual(['NO₃', 'PO₄', 'K', 'Fe']);

    const need = (species: PlantSpecies, n: (typeof NUTRIENTS)[number]): number =>
      speciesHalfSaturation(species, n, DEFAULT_CONFIG.nutrients);
    readings.forEach((r, i) => {
      const n = NUTRIENTS[i]!;
      expect(need('monte_carlo', n)).toBeGreaterThan(need('java_fern', n));
      expect(r.needed / need('monte_carlo', n)).toBeCloseTo(readings[0]!.needed / need('monte_carlo', 'nitrate'), 10);
    });
    expect(readings.every((r) => r.ppm === 0 && r.fill === 0)).toBe(true);
  });

  it('asks less of every nutrient for a low-demand planting than a high-demand one', () => {
    const lean = nutrientReadings(planted(['java_fern', 'anubias']), DEFAULT_CONFIG);
    const hungry = nutrientReadings(planted(['monte_carlo']), DEFAULT_CONFIG);
    lean.forEach((reading, i) => {
      expect(reading.needed).toBeGreaterThan(0);
      expect(reading.needed).toBeLessThan(hungry[i]!.needed);
    });
  });

  it('only calls a nutrient short when the engine would actually feed a plant better', () => {
    const fernIron = (state: SimulationState): SimulationState => ({
      ...state,
      resources: {
        ...state.resources,
        nitrate: state.resources.water * 20,
        phosphate: state.resources.water * 2,
        potassium: state.resources.water * 10,
        iron:
          state.resources.water *
          nutrientReadings(planted(['java_fern']), DEFAULT_CONFIG).find((r) => r.key === 'iron')!
            .needed,
      },
    });
    const short = (state: SimulationState): string[] =>
      nutrientReadings(state, DEFAULT_CONFIG)
        .filter((r) => r.limiting)
        .map((r) => r.key);

    expect(short(fernIron(planted(['java_fern'])))).toEqual([]);
    expect(short(fernIron(planted(['monte_carlo'])))).toEqual(['iron']);
  });

  it('sets each need where the hungriest plant’s deficiency harm starts, wherever that edge is tuned', () => {
    const state = planted(['java_fern', 'monte_carlo']);
    for (const edge of [0.8, DEFAULT_CONFIG.plants.sufficiencyEdge, MAX_SUFFICIENCY_EDGE]) {
      const config = { ...DEFAULT_CONFIG, plants: { ...DEFAULT_CONFIG.plants, sufficiencyEdge: edge } };
      const water = state.resources.water;
      const atNeed = { ...state.resources };
      for (const reading of nutrientReadings(state, config)) atNeed[reading.key] = reading.needed * water;
      expect(calculateNutrientSufficiency(tankPools({ ...state, resources: atNeed }), 'monte_carlo', config.nutrients)).toBeCloseTo(edge, 6);
    }
  });

  it('has nothing to be short of when nothing is planted', () => {
    const readings = nutrientReadings(tank(), DEFAULT_CONFIG);
    expect(readings.map((r) => r.neededText)).toEqual(['—', '—', '—', '—']);
    expect(nutrientAlert(readings, null)).toBeNull();
  });

  it('fills each track against that need and stops at full', () => {
    const state = dosed(planted(['monte_carlo']), 4);
    const [nitrate] = nutrientReadings(state, DEFAULT_CONFIG);
    expect(nitrate.ppm).toBeLessThan(nitrate.needed);
    expect(nitrate.fill).toBeCloseTo(nitrate.ppm / nitrate.needed, 6);

    const flooded = dosed(dosed(dosed(state, 50), 50), 50);
    expect(nutrientReadings(flooded, DEFAULT_CONFIG)[0].ppm).toBeGreaterThan(nitrate.needed);
    expect(nutrientReadings(flooded, DEFAULT_CONFIG)[0].fill).toBe(1);
  });
});

describe('nutrientAlert', () => {
  it('names the single deficiency, and says once when nothing is dosed at all', () => {
    const bare = nutrientReadings(planted(['monte_carlo']), DEFAULT_CONFIG);
    expect(nutrientAlert(bare, null)).toEqual({ text: 'nothing dosed', status: 'alert' });

    const state = planted(['monte_carlo']);
    const fed = {
      ...state,
      resources: {
        ...state.resources,
        nitrate: state.resources.water * 20,
        phosphate: state.resources.water * 2,
        potassium: state.resources.water * 10,
      },
    };
    expect(nutrientAlert(nutrientReadings(fed, DEFAULT_CONFIG), null)).toEqual({
      text: 'Fe depleted',
      status: 'alert',
    });
  });

  it('counts them instead of naming them when several are short', () => {
    const state = planted(['monte_carlo']);
    const partly = {
      ...state,
      resources: { ...state.resources, nitrate: state.resources.water * 20 },
    };
    const dosedALittle = dosed(partly, 4);
    expect(nutrientAlert(nutrientReadings(dosedALittle, DEFAULT_CONFIG), null)).toEqual({
      text: '3 nutrients low',
      status: 'warn',
    });
  });
});

describe('bedReading', () => {
  const tab = (state: SimulationState, count: number): SimulationState =>
    applyAction(state, { type: 'rootTab', count }).state;
  const fed = (state: SimulationState): SimulationState =>
    produce(state, (draft) => {
      for (const r of nutrientReadings(state, DEFAULT_CONFIG)) draft.resources[r.key] = 2 * r.needed * state.resources.water;
    });
  const sword = (): SimulationState => fed(planted(['amazon_sword']));

  it('has nothing to read over a bare bottom', () => {
    expect(bedReading(createSimulation({ tankCapacity: 200 }), DEFAULT_CONFIG)).toBeNull();
  });

  it('counts the bed in the tabs pushed into it', () => {
    expect(bedReading(tab(tank(), 2), DEFAULT_CONFIG)!.tabs).toBeCloseTo(2, 10);
  });

  it('reads a sword starving on an empty bed, however well dosed the water', () => {
    const state = sword();
    const readings = nutrientReadings(state, DEFAULT_CONFIG);
    const bed = bedReading(state, DEFAULT_CONFIG)!;

    expect(readings.some((r) => r.limiting)).toBe(false);
    expect(calculateNutrientSufficiency(tankPools(state), 'amazon_sword', DEFAULT_CONFIG.nutrients)).toBeLessThan(
      DEFAULT_CONFIG.plants.sufficiencyEdge
    );
    expect(bed).toMatchObject({ limiting: true, status: 'alert' });
    expect(nutrientAlert(readings, bed)).toEqual({ text: 'bed empty', status: 'alert' });
  });

  it('advises the tabs that lift the bed to its root feeders’ need, and reads it met once they are in', () => {
    const state = sword();
    const { advice } = bedReading(state, DEFAULT_CONFIG)!;
    const tabbed = bedReading(tab(state, advice!), DEFAULT_CONFIG)!;

    expect(tabbed).toMatchObject({ limiting: false, advice: null, status: 'ok' });
    expect(tabbed.tabs).toBeGreaterThanOrEqual(tabbed.needed);
    expect(calculateNutrientSufficiency(tankPools(tab(state, advice!)), 'amazon_sword', DEFAULT_CONFIG.nutrients)).toBeGreaterThanOrEqual(
      DEFAULT_CONFIG.plants.sufficiencyEdge
    );
  });

  it('asks nothing of the bed where nothing roots in it', () => {
    const bed = bedReading(fed(planted(['java_fern'])), DEFAULT_CONFIG)!;
    expect(bed).toMatchObject({ needed: 0, neededText: '—', limiting: false, advice: null, status: 'neutral' });
  });

  it('names the water’s shortage beside the bed’s, at the worse tone', () => {
    const state = planted(['amazon_sword']);
    expect(nutrientAlert(nutrientReadings(state, DEFAULT_CONFIG), bedReading(state, DEFAULT_CONFIG))).toEqual({
      text: 'nothing dosed · bed empty',
      status: 'alert',
    });
  });
});

describe('dose arithmetic', () => {
  it('spells the engine’s own preview at each nutrient’s precision, over the water given', () => {
    const preview = getDosePreview(2, 200, FORMULA);
    expect(formatDose(doseDeltas(2, 200, FORMULA))).toBe(
      `+${preview.nitratePpm.toFixed(1)} NO₃ · +${preview.phosphatePpm.toFixed(2)} PO₄ · ` +
        `+${preview.potassiumPpm.toFixed(1)} K · +${preview.ironPpm.toFixed(2)} Fe`
    );
  });

  it('recommends a dose that actually clears the deficit when the engine applies it', () => {
    const state = planted(['monte_carlo'], 40);
    const advice = doseToCover(nutrientReadings(state, DEFAULT_CONFIG), state, DEFAULT_CONFIG);
    expect(advice).toMatchObject({ overSingleDose: false, covers: ['NO₃', 'PO₄', 'K', 'Fe'] });

    const after = dosed(state, advice?.ml ?? 0);
    expect(nutrientReadings(after, DEFAULT_CONFIG).some((r) => r.limiting)).toBe(false);

    const under = dosed(state, (advice?.ml ?? 0) - 1);
    expect(nutrientReadings(under, DEFAULT_CONFIG).some((r) => r.limiting)).toBe(true);
  });

  it('says when covering the deficit takes more than one dose', () => {
    const state = planted(['monte_carlo']);
    const advice = doseToCover(nutrientReadings(state, DEFAULT_CONFIG), state, DEFAULT_CONFIG);
    expect(advice).toMatchObject({ overSingleDose: true, covers: ['NO₃', 'PO₄', 'K', 'Fe'] });
    expect(advice!.ml).toBeGreaterThan(MAX_DOSE_ML);
    expect(applyAction(state, { type: 'dose', amountMl: advice!.ml }).state).toBe(state);
  });

  it('has nothing to recommend once every nutrient is met', () => {
    const fern = planted(['java_fern'], 40);
    const ml = Math.max(
      ...nutrientReadings(fern, DEFAULT_CONFIG).map(
        (r) => (r.needed * fern.resources.water) / FORMULA[r.key]
      )
    );
    const state = dosed(fern, ml);
    const readings = nutrientReadings(state, DEFAULT_CONFIG);
    expect(readings.every((r) => !r.limiting)).toBe(true);
    expect(doseToCover(readings, state, DEFAULT_CONFIG)).toBeNull();
  });
});

describe('trim targets', () => {
  it('offers only targets a plant in a calibrated tank can reach', () => {
    expect(TRIM_TARGETS).toEqual([50, 75, 85]);

    const grown = applyAction(tank(), {
      type: 'addPlant',
      species: 'monte_carlo',
      initialSize: 90,
    }).state;

    expect(TRIM_TARGETS.map((t) => getPlantsToTrimCount(grown, t))).toEqual([1, 1, 1]);
  });

  it('has nothing to cut on a plant no rung is above', () => {
    const fresh = planted(['monte_carlo']);
    expect(fresh.plants[0].size).toBe(50);
    expect(TRIM_TARGETS.map((t) => getPlantsToTrimCount(fresh, t))).toEqual([0, 0, 0]);
  });

  it('trims to every offered target through the engine', () => {
    const grown = applyAction(tank(), {
      type: 'addPlant',
      species: 'monte_carlo',
      initialSize: 90,
    }).state;

    for (const target of TRIM_TARGETS) {
      const trimmed = applyAction(grown, { type: 'trimPlants', targetSize: target }).state;
      expect(trimmed.plants[0].size).toBe(target);
    }
  });
});

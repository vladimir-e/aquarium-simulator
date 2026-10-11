import { describe, it, expect } from 'vitest';
import {
  ALGAE_KINDS,
  BLOOM_COVERAGE_LINE,
  BLOOM_VISIBLE_LINE,
  PLANT_LIGHT_LINE,
  applyAction,
  bloomAlert,
  calculateFloorArea,
  calculateSurface,
  createSimulation,
  fillAtDroop,
  floorCover,
  getDosePreview,
  growthFormOf,
  getPlantsToTrimCount,
  getSubstrateNutrients,
  nutrientsIn,
  plantLightTaken,
  plantParams,
  readPlantLight,
  storeFill,
  storeGap,
  tick,
  type AlgaeKind,
  type PlantSpecies,
  type SimulationState,
} from '../../simulation/index.js';
import { DEFAULT_CONFIG, NUTRIENTS, type Nutrient } from '../../simulation/config/index.js';
import { MAX_DOSE_ML } from '../../simulation/actions/dose.js';
import { produce } from 'immer';
import {
  algaeReading,
  bedReading,
  doseDeltas,
  doseToCover,
  floorPlanted,
  formatDose,
  nutrientAlert,
  nutrientReadings,
  plantingStores,
  groupPlantsBySpecies,
  plantLabels,
  plantRows,
  TRIM_TARGETS,
  type NutrientReading,
  type PlantRow,
  type StoresFigure,
  type PlantSpeciesGroup,
} from './flora';
import { readHourAhead } from './ahead';
import { bloomAt } from '../../simulation/tests/blooms.js';
import { plantRecord, withStores } from '../../simulation/tests/plant.js';
import { bloomCoverage } from '../../simulation/algae/index.js';
import { offshootStructure } from '../../simulation/plants/create-plant.js';
import { sizeOf } from '../../simulation/plants/canopy.js';
import { COVERAGE_DECIMALS } from '../utils/units';
import { conditionStatus, conditionWord, printsAsZero, projectedTrend, type Reading } from './status';

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

function alertOn(state: SimulationState): ReturnType<typeof nutrientAlert> {
  return nutrientAlert(nutrientReadings(state, DEFAULT_CONFIG), bedReading(state, DEFAULT_CONFIG));
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

  it('reads green water as the water’s clarity and film as how coated the glass is', () => {
    const words = (kind: AlgaeKind): string[] =>
      [0, 0.3, 0.8, 1.5, 3].map((share) => algaeReading(kind, share * BLOOM_COVERAGE_LINE, 0).word);
    expect(words('greenWater')).toEqual(['clear', 'hazy', 'cloudy', 'green', 'pea soup']);
    expect(words('film')).toEqual(['clean', 'dusted', 'filmed', 'coated', 'smothered']);
  });

  describe.each(ALGAE_KINDS)('%s', (kind) => {
    it('reads its word for none while the coverage prints as none', () => {
      const none = algaeReading(kind, 0, 0);
      expect(none.status).toBe('ok');
      expect(algaeReading(kind, 0.9 * BLOOM_VISIBLE_LINE, 0).word).toBe(none.word);
      expect(algaeReading(kind, BLOOM_VISIBLE_LINE, 0).word).not.toBe(none.word);
      expect(printsAsZero(0.9 * BLOOM_VISIBLE_LINE, COVERAGE_DECIMALS)).toBe(true);
      expect(printsAsZero(BLOOM_VISIBLE_LINE, COVERAGE_DECIMALS)).toBe(false);
    });

    it('maps its coverage to status (low is good)', () => {
      expect(algaeReading(kind, BLOOM_COVERAGE_LINE, 0).status).toBe('ok');
      expect(algaeReading(kind, 1.5 * BLOOM_COVERAGE_LINE, 0).status).toBe('warn');
      expect(algaeReading(kind, 2.1 * BLOOM_COVERAGE_LINE, 0).status).toBe('alert');
    });

    it('takes the worse tone of its coverage and the plants’ light it takes, keeping its coverage word', () => {
      const light = BLOOM_COVERAGE_LINE / 2;
      expect(algaeReading(kind, light, 0).status).toBe('ok');
      expect(algaeReading(kind, light, 1.5 * PLANT_LIGHT_LINE)).toEqual({
        status: 'warn',
        word: algaeReading(kind, light, 0).word,
      });
      expect(algaeReading(kind, light, 2.5 * PLANT_LIGHT_LINE).status).toBe('alert');
      expect(algaeReading(kind, 3 * BLOOM_COVERAGE_LINE, 0).status).toBe('alert');
    });

    it('on its coverage alone, turns amber and coral each on a word of its own', () => {
      const tonesOf = new Map<string, Set<string>>();
      for (let i = 0; i <= 300; i++) {
        const { word, status } = algaeReading(kind, (i / 100) * BLOOM_COVERAGE_LINE, 0);
        tonesOf.set(word, (tonesOf.get(word) ?? new Set()).add(status));
      }
      const tones = [...tonesOf.values()];
      expect(tones.every((set) => set.size === 1)).toBe(true);
      expect(tones.filter((set) => set.has('warn'))).toHaveLength(1);
      expect(tones.filter((set) => set.has('alert'))).toHaveLength(1);
    });

    it('turns amber exactly where the engine alerts, planted or not', () => {
      for (const bed of [tank(), planted(['monte_carlo', 'amazon_sword'])]) {
        for (let coverage = 0; coverage <= 95; coverage += 5) {
          const state = produce(bed, (draft) => {
            draft.algae[kind] = bloomAt(draft, kind, coverage);
          });
          const taken = plantLightTaken(state, DEFAULT_CONFIG.optics)[kind] * 100;
          const alerts = bloomAlert(kind).check(state, DEFAULT_CONFIG).log !== null;
          expect(algaeReading(kind, bloomCoverage(state, kind), taken).status !== 'ok').toBe(alerts);
        }
      }
    });
  });
});

function rows(state: SimulationState, config = DEFAULT_CONFIG): PlantRow[] {
  return plantRows(state, readHourAhead(state, config));
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
    plantlet: 0,
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
  it('reads each unit’s light at its own height, as a share of the day its species is rated to live on', () => {
    const state = planted(['amazon_sword', 'monte_carlo', 'java_fern']);
    const light = readPlantLight(state, DEFAULT_CONFIG);

    rows(state).forEach((row, i) => {
      expect(row.light).toBeCloseTo(light[i].needShare, 12);
    });
  });

  it('reads an offshoot buffer as its share of the next plantlet, full once it holds it', () => {
    const base = planted(['java_fern', 'java_fern', 'java_fern']);
    const unit = offshootStructure('java_fern');
    const state = produce(base, (draft) => {
      draft.plants[0].budget.offshootBuffer = 0;
      draft.plants[1].budget.offshootBuffer = unit / 4;
      draft.plants[2].budget.offshootBuffer = 2 * unit;
    });
    expect(rows(state).map((row) => row.plantlet)).toEqual([0, expect.closeTo(0.25, 12), 1]);
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
    const starved = produce(planted(['java_fern']), (draft) => {
      draft.equipment.light.enabled = false;
      draft.resources.lightByHour.fill(0);
      draft.plants[0].budget.reserve = 0;
    });
    expect(rows(starved)[0].reading.word).toBe('sick');

    const fed = produce(starved, (draft) => {
      draft.plants[0].budget.reserve = planted(['java_fern']).plants[0].budget.reserve;
    });
    for (const state of [starved, fed]) {
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

/** The planting with each plant's stores at this share of full. */
function storesAt(state: SimulationState, fill: number | Partial<Record<Nutrient, number>>): SimulationState {
  return { ...state, plants: state.plants.map((plant) => withStores(plant, fill)) };
}

/** The water holding each nutrient at this ppm. */
function waterAt(state: SimulationState, ppm: Partial<Record<Nutrient, number>>): SimulationState {
  return produce(state, (draft) => {
    for (const [n, value] of Object.entries(ppm)) draft.resources[n as Nutrient] = value * draft.resources.water;
  });
}

const EDGE = DEFAULT_CONFIG.plants.droopEdge;
const RICH = { nitrate: 20, phosphate: 2, potassium: 10, iron: 0.2 };

/** mg of a nutrient the water feeders' stores ask of water that holds none of it. */
function waterAsk(state: SimulationState, n: Nutrient): number {
  return plantingStores(waterAt(state, { [n]: 0 }), DEFAULT_CONFIG).water.unmet[n];
}

describe('plantingStores', () => {
  it('reads each pool by the plants that feed from it: the lowest-running store of each, and what they lack at their weight there past what it holds', () => {
    const state = storesAt(planted(['java_fern', 'amazon_sword']), { nitrate: 0.5 });
    const halfFern = storesAt(state, { phosphate: 0.2 });
    const [fern, sword] = halfFern.plants;
    const roots = growthFormOf('amazon_sword').rootShare;
    const gap = (plant: typeof fern): ReturnType<typeof storeGap> => storeGap(plant.budget, plantParams(plant.species, DEFAULT_CONFIG.plants));
    const held = { water: nutrientsIn(halfFern.resources), bed: halfFern.equipment.substrate.nutrients };
    const { water, bed } = plantingStores(halfFern, DEFAULT_CONFIG);

    expect(water.asked && bed.asked).toBe(true);
    expect(water.stores.phosphate.fill).toBeCloseTo(0.2, 12);
    expect(bed.stores.phosphate.fill).toBeCloseTo(storeFill(sword.budget, plantParams('amazon_sword', DEFAULT_CONFIG.plants)).phosphate, 12);
    for (const n of NUTRIENTS) {
      expect(water.unmet[n]).toBeCloseTo(Math.max(0, gap(fern)[n] + (1 - roots) * gap(sword)[n] - held.water[n]), 9);
      expect(bed.unmet[n]).toBeCloseTo(Math.max(0, roots * gap(sword)[n] - held.bed[n]), 9);
    }
  });

  it('reads a store under its edge exactly where some feeder’s store falls under the fill the Droop edge meets', () => {
    const state = planted(['java_fern']);
    const edge = fillAtDroop(plantParams('java_fern', DEFAULT_CONFIG.plants), EDGE).iron;
    const iron = (fill: number): StoresFigure => plantingStores(storesAt(state, { iron: fill }), DEFAULT_CONFIG).water.stores.iron;
    expect(iron(1.01 * edge)).toMatchObject({ edge, status: 'ok' });
    expect(iron(0.99 * edge)).toMatchObject({ edge, status: 'alert' });
  });

  it('calls a pool short of a nutrient only where a store is under its edge and the pool holds less than the stores lack', () => {
    const fern = planted(['java_fern']);
    const edge = fillAtDroop(plantParams('java_fern', DEFAULT_CONFIG.plants), EDGE).iron;
    const starved = storesAt(fern, { iron: 0.5 * edge });
    const short = (state: SimulationState): Nutrient[] => plantingStores(state, DEFAULT_CONFIG).water.short;
    const ask = waterAsk(starved, 'iron') / starved.resources.water;

    expect(short(waterAt(starved, { iron: 0 }))).toEqual(['iron']);
    expect(short(waterAt(starved, { iron: 0.5 * ask }))).toEqual(['iron']);
    expect(short(waterAt(starved, { iron: 1.01 * ask }))).toEqual([]);
    expect(short(waterAt(storesAt(fern, { iron: 1.01 * edge }), { iron: 0 }))).toEqual([]);
  });

  it('reads a store a shed left past full as full', () => {
    const { water } = plantingStores(storesAt(planted(['java_fern']), 1.5), DEFAULT_CONFIG);
    for (const n of NUTRIENTS) expect(water.stores[n].fill).toBe(1);
  });

  it('asks nothing of a pool nothing feeds from, and nothing of either in a dry tank', () => {
    const { bed } = plantingStores(storesAt(planted(['java_fern']), 0.3), DEFAULT_CONFIG);
    expect(bed.asked).toBe(false);
    expect(Object.values(bed.unmet).every((mg) => mg === 0)).toBe(true);

    const dry = produce(storesAt(planted(['amazon_sword']), 0.3), (draft) => {
      draft.resources.water = 0;
    });
    const pools = plantingStores(dry, DEFAULT_CONFIG);
    expect(pools.water.asked || pools.bed.asked).toBe(false);
  });
});

describe('nutrientReadings', () => {
  it('reads every nutrient in the water with the water feeders’ lowest store of it beside it', () => {
    const state = storesAt(planted(['java_fern', 'monte_carlo']), { potassium: 0.4 });
    const readings = nutrientReadings(state, DEFAULT_CONFIG);
    expect(readings.map((r) => r.label)).toEqual(['NO₃', 'PO₄', 'K', 'Fe']);
    expect(readings.find((r) => r.key === 'potassium')!.stores.fill).toBeCloseTo(0.4, 12);
  });

  it('tones the stores coral under their Droop edge and leaves the ppm ink — coral only past nitrate’s ceiling', () => {
    const state = waterAt(planted(['java_fern']), RICH);
    const edge = fillAtDroop(plantParams('java_fern', DEFAULT_CONFIG.plants), EDGE);
    const iron = (s: SimulationState): NutrientReading => nutrientReadings(s, DEFAULT_CONFIG).find((r) => r.key === 'iron')!;
    const nitrate = (s: SimulationState): NutrientReading => nutrientReadings(s, DEFAULT_CONFIG).find((r) => r.key === 'nitrate')!;

    expect(iron(state)).toMatchObject({ status: 'ok', stores: { status: 'ok' }, depleted: false });
    expect(iron(waterAt(state, { iron: 0 }))).toMatchObject({ status: 'ok', stores: { status: 'ok' }, depleted: true });
    expect(iron(storesAt(state, { iron: 0.5 * edge.iron }))).toMatchObject({ status: 'ok', stores: { status: 'alert' } });
    const ceiling = nitrate(state).ceiling!;
    expect(nitrate(waterAt(state, { nitrate: ceiling + 1 }))).toMatchObject({ excess: true, status: 'alert' });
  });

  it('counts the ammonia in the water as nitrogen: nitrate is not depleted while ammonia stands', () => {
    const state = waterAt(planted(['java_fern']), { ...RICH, nitrate: 0 });
    const nitrate = (s: SimulationState): NutrientReading => nutrientReadings(s, DEFAULT_CONFIG).find((r) => r.key === 'nitrate')!;
    expect(nitrate(state).depleted).toBe(true);
    const withAmmonia = produce(state, (draft) => {
      draft.resources.ammonia = 0.05 * draft.resources.water;
    });
    expect(nitrate(withAmmonia).depleted).toBe(false);
  });

  it('has no stores to read or flag when nothing is planted', () => {
    const readings = nutrientReadings(tank(), DEFAULT_CONFIG);
    expect(readings.map((r) => r.asked)).toEqual([false, false, false, false]);
    expect(readings.map((r) => r.stores.status)).toEqual(['neutral', 'neutral', 'neutral', 'neutral']);
    expect(alertOn(tank())).toBeNull();
  });
});

describe('nutrientAlert', () => {
  const carpetOnSoil = (): SimulationState =>
    produce(planted(['monte_carlo']), (draft) => {
      draft.equipment.substrate.nutrients = getSubstrateNutrients('aqua_soil', draft.tank.capacity);
    });

  it('names the single shortage, and says once when nothing is dosed at all', () => {
    expect(alertOn(carpetOnSoil())).toEqual({ text: 'nothing dosed', status: 'warn' });
    expect(alertOn(waterAt(carpetOnSoil(), { ...RICH, iron: 0 }))).toEqual({ text: 'Fe depleted', status: 'warn' });
  });

  it('counts them instead of naming them when several are flagged', () => {
    expect(alertOn(waterAt(carpetOnSoil(), { nitrate: 20 }))).toEqual({ text: '3 nutrients depleted', status: 'warn' });
  });

  it('says short, coral, once a plant’s store has fallen under the Droop edge and the water holds less than it lacks — never of water that holds it', () => {
    const starved = storesAt(waterAt(carpetOnSoil(), RICH), { phosphate: 0 });
    expect(alertOn(starved)).toBeNull();
    const lean = waterAt(starved, { phosphate: (0.5 * waterAsk(starved, 'phosphate')) / starved.resources.water });
    expect(alertOn(lean)).toEqual({ text: 'PO₄ short', status: 'alert' });
  });
});

describe('bedReading', () => {
  const tab = (state: SimulationState, count: number): SimulationState =>
    applyAction(state, { type: 'rootTab', count }).state;
  const sword = (fill = 0.5): SimulationState => storesAt(waterAt(planted(['amazon_sword']), RICH), fill);

  it('holds nothing back over a bare bottom where nothing roots', () => {
    const bed = bedReading(createSimulation({ tankCapacity: 200 }), DEFAULT_CONFIG);
    expect(bed).toMatchObject({ bare: true, asked: false, short: false, advice: null });
    expect(bed.stores.status).toBe('neutral');
  });

  it('reads a sword over a bare bottom amber, coral once its stores fall short, and advises no tab the bottom cannot take', () => {
    const bare = produce(sword(), (draft) => {
      draft.equipment.substrate.type = 'none';
    });
    expect(bedReading(bare, DEFAULT_CONFIG)).toMatchObject({ bare: true, asked: true, short: false, advice: null });
    expect(alertOn(bare)).toEqual({ text: 'no bed', status: 'warn' });
    expect(bedReading(storesAt(bare, 0), DEFAULT_CONFIG)).toMatchObject({ short: true, advice: null });
    expect(alertOn(storesAt(bare, 0))).toEqual({ text: 'no bed', status: 'alert' });
  });

  it('reads a sword starving on an empty bed, however well dosed the water', () => {
    const state = sword(0.05);
    const readings = nutrientReadings(state, DEFAULT_CONFIG);
    const bed = bedReading(state, DEFAULT_CONFIG);

    expect(readings.every((r) => r.stores.status === 'alert')).toBe(true);
    expect(readings.some((r) => r.short)).toBe(false);
    expect(doseToCover(readings, state, DEFAULT_CONFIG)).toBeNull();
    expect(bed).toMatchObject({ empty: true, short: true, stores: { status: 'alert' } });
    expect(bed.advice).toBeGreaterThanOrEqual(1);
    expect(nutrientAlert(readings, bed)).toEqual({ text: 'bed empty', status: 'alert' });
  });

  it('advises the tabs that put in the bed what the root feeders’ stores lack, and asks no more once they are in', () => {
    const state = sword();
    const bed = bedReading(state, DEFAULT_CONFIG);
    expect(bed).toMatchObject({ empty: true, short: false });
    expect(bed.advice).toBeGreaterThanOrEqual(1);

    const { unmet } = plantingStores(state, DEFAULT_CONFIG).bed;
    const rootTab = DEFAULT_CONFIG.nutrients.rootTab;
    expect(NUTRIENTS.every((n) => bed.advice! * rootTab[n] >= unmet[n])).toBe(true);
    expect(NUTRIENTS.some((n) => (bed.advice! - 1) * rootTab[n] < unmet[n])).toBe(true);
    expect(bedReading(tab(state, bed.advice!), DEFAULT_CONFIG)).toMatchObject({ empty: false, short: false, advice: null });
  });

  it('advises the tabs a starving sword lacks, and clears the shortage once they are in', () => {
    const state = sword(0.05);
    const { advice } = bedReading(state, DEFAULT_CONFIG);
    const tabbed = tab(state, advice!);
    expect(bedReading(tabbed, DEFAULT_CONFIG)).toMatchObject({ short: false, advice: null, stores: { status: 'alert' } });
    expect(alertOn(tabbed)).toBeNull();
    expect(bedReading(tab(state, advice! - 1), DEFAULT_CONFIG).short).toBe(true);
  });

  it('advises no tabs while the bed lacks a nutrient the tab carries none of', () => {
    const ironless = {
      ...DEFAULT_CONFIG,
      nutrients: { ...DEFAULT_CONFIG.nutrients, rootTab: { ...DEFAULT_CONFIG.nutrients.rootTab, iron: 0 } },
    };
    const bedded = (bed: Partial<Record<Nutrient, number>>): SimulationState =>
      produce(sword(0), (draft) => {
        draft.equipment.substrate.nutrients = { nitrate: 1e6, phosphate: 1e6, potassium: 1e6, iron: 1e6, ...bed };
      });

    expect(bedReading(bedded({ iron: 0 }), ironless)).toMatchObject({ short: true, advice: null });
    expect(bedReading(bedded({ nitrate: 0 }), ironless).advice).toBeGreaterThanOrEqual(1);
  });

  it('counts the bed in the tabs pushed into it, on the carried nutrient it holds fewest tabs’ worth of, or the one it is held to', () => {
    expect(bedReading(tab(tank(), 2), DEFAULT_CONFIG).tabs).toBeCloseTo(2, 10);
    const state = produce(tab(tank(), 2), (draft) => {
      draft.equipment.substrate.nutrients.phosphate /= 2;
    });
    expect(bedReading(state, DEFAULT_CONFIG)).toMatchObject({ nutrient: 'phosphate', text: '1.0' });
    expect(bedReading(state, DEFAULT_CONFIG, undefined, 'nitrate')).toMatchObject({ nutrient: 'nitrate', text: '2.0' });
  });

  it('reads the root feeders’ store that runs its Droop limit lowest, over every nutrient', () => {
    const state = storesAt(sword(), { nitrate: 0.3, phosphate: 0.04, potassium: 0.5, iron: 0.6 });
    const { stores } = bedReading(state, DEFAULT_CONFIG);
    const edge = fillAtDroop(plantParams('amazon_sword', DEFAULT_CONFIG.plants), EDGE);
    expect(stores).toMatchObject({ edge: edge.phosphate, status: 'alert' });
    expect(stores.fill).toBeCloseTo(0.04, 12);
  });

  it('asks nothing of the bed where nothing roots in it', () => {
    const bed = bedReading(storesAt(planted(['java_fern']), 0), DEFAULT_CONFIG);
    expect(bed).toMatchObject({ asked: false, short: false, advice: null, stores: { status: 'neutral' } });
  });

  it('names the water’s shortage beside the bed’s, at the worse tone', () => {
    expect(alertOn(planted(['amazon_sword']))).toEqual({ text: 'nothing dosed · bed empty', status: 'warn' });
    const starved = waterAt(storesAt(planted(['amazon_sword']), { iron: 0 }), RICH);
    const lean = waterAt(starved, { iron: (0.5 * waterAsk(starved, 'iron')) / starved.resources.water });
    expect(alertOn(lean)).toEqual({ text: 'Fe short · bed empty', status: 'alert' });
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

  it('advises the dose that puts in the water what the plants’ stores lack of every nutrient', () => {
    const state = storesAt(planted(['monte_carlo'], 40), 0.5);
    const advice = doseToCover(nutrientReadings(state, DEFAULT_CONFIG), state, DEFAULT_CONFIG);
    expect(advice).toMatchObject({ covers: ['NO₃', 'PO₄', 'K', 'Fe'] });
    expect(advice!.ml).toBeLessThanOrEqual(MAX_DOSE_ML);

    const unmet = (s: SimulationState): number[] => nutrientReadings(s, DEFAULT_CONFIG).map((r) => r.unmet);
    expect(unmet(dosed(state, advice!.ml)).every((mg) => mg === 0)).toBe(true);
    expect(unmet(dosed(state, advice!.ml - 1)).some((mg) => mg > 0)).toBe(true);
  });

  it('the advised dose clears the shortage when applied', () => {
    const state = storesAt(planted(['monte_carlo'], 40), 0.05);
    const readings = nutrientReadings(state, DEFAULT_CONFIG);
    expect(readings.every((r) => r.short)).toBe(true);
    const advice = doseToCover(readings, state, DEFAULT_CONFIG)!;
    expect(advice.ml).toBeLessThanOrEqual(MAX_DOSE_ML);

    const after = dosed(state, advice.ml);
    const fed = nutrientReadings(after, DEFAULT_CONFIG);
    expect(fed.some((r) => r.short)).toBe(false);
    expect(alertOn(after)?.text ?? '').not.toMatch(/short/);
    expect(doseToCover(fed, after, DEFAULT_CONFIG)).toBeNull();
    expect(nutrientReadings(dosed(state, advice.ml - 1), DEFAULT_CONFIG).some((r) => r.short)).toBe(true);
  });

  it('advises a dose whenever the water holds less than the stores lack, before any store reaches its edge or the water runs dry', () => {
    const state = storesAt(planted(['monte_carlo'], 40), 0.3);
    const lean = waterAt(state, { ...RICH, nitrate: (0.5 * waterAsk(state, 'nitrate')) / state.resources.water });
    const nitrate = nutrientReadings(lean, DEFAULT_CONFIG).find((r) => r.key === 'nitrate')!;
    expect(nitrate).toMatchObject({ short: false, depleted: false, stores: { status: 'ok' } });
    expect(nitrate.unmet).toBeGreaterThan(0);
    expect(doseToCover(nutrientReadings(lean, DEFAULT_CONFIG), lean, DEFAULT_CONFIG)).toMatchObject({ covers: ['NO₃'] });
  });

  it('says when covering the ask takes more than one dose', () => {
    const state = storesAt(
      { ...tank(), plants: Array.from({ length: 8 }, (_, i) => plantRecord({ id: `fern_${i}`, species: 'java_fern', size: 100 })) },
      0
    );
    const advice = doseToCover(nutrientReadings(state, DEFAULT_CONFIG), state, DEFAULT_CONFIG);
    expect(advice!.ml).toBeGreaterThan(MAX_DOSE_ML);
    expect(applyAction(state, { type: 'dose', amountMl: advice!.ml }).state).toBe(state);
  });

  it('has nothing to recommend while the water holds what the stores lack', () => {
    const fed = waterAt(storesAt(planted(['java_fern'], 40), 0.5), RICH);
    expect(doseToCover(nutrientReadings(fed, DEFAULT_CONFIG), fed, DEFAULT_CONFIG)).toBeNull();
    const full = storesAt(planted(['java_fern'], 40), 1);
    expect(nutrientReadings(full, DEFAULT_CONFIG).every((r) => r.depleted)).toBe(true);
    expect(doseToCover(nutrientReadings(full, DEFAULT_CONFIG), full, DEFAULT_CONFIG)).toBeNull();
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
    expect(sizeOf(fresh.plants[0])).toBeCloseTo(50, 9);
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
      expect(sizeOf(trimmed.plants[0])).toBeCloseTo(target, 9);
    }
  });
});

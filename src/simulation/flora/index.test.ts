import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { processFlora } from './index.js';
import { bloomParams, plantParams } from './params.js';
import { readPlantLight } from '../plants/index.js';
import { sizeOf } from '../plants/canopy.js';
import { offshootStructure } from '../plants/create-plant.js';
import { nutrientsIn, uptakeAlkalinity } from '../systems/nutrients.js';
import { carbonGases } from '../systems/photosynthesis.js';
import { offshootPrice, type FloraFluxes, type FloraState } from '../systems/flora-budget.js';
import { totalBurned } from '../systems/reserve.js';
import { shedShare } from '../systems/flora.js';
import { deltaOf } from '../tests/effects.js';
import { getPpm } from '../resources/index.js';
import { createSimulation, type Plant, type Resources, type SimulationState } from '../state.js';
import { ALGAE, ALGAE_KINDS, bloomMass, habitatGain, type AlgaeKind } from '../algae/index.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { mapNutrients, NUTRIENTS, nutrientsDefaults, type NutrientVector } from '../config/nutrients.js';
import { PLANT_SPECIES_DATA, growthFormOf, type PlantSpecies } from '../plants/species.js';
import { CARE_SHEET_PHOTOPERIOD } from '../systems/flora.js';
import { getSubstrateNutrients } from '../equipment/substrate.js';
import { plantRecord } from '../tests/plant.js';
import { bloomAt } from '../tests/blooms.js';
import { nonFinitePaths } from '../tests/leaves.js';
import type { Effect } from '../core/effects.js';

const config = DEFAULT_CONFIG;
const RICH = 1000;
const LITRES = 100;

/** A day with twice the light the neediest species starves under. */
const LIT_DAY = Array.from({ length: 24 }, (_, hour) =>
  hour < CARE_SHEET_PHOTOPERIOD
    ? 2 * Math.max(...Object.values(PLANT_SPECIES_DATA).map((species) => species.tolerableLight[0]))
    : 0
);
const LIT = { light: 60, lightByHour: LIT_DAY };
const DARK = { light: 0, lightByHour: new Array(24).fill(0) };

type TankFields = {
  plants: Plant[];
  algae: Partial<Record<AlgaeKind, number>>;
} & Partial<Pick<Resources, 'light' | 'lightByHour' | 'co2' | 'nitrate' | 'phosphate' | 'oxygen' | 'water'>>;

/** A tank on rich water with this planting and blooms at these coverages — none of either unless it says so. */
function tank({ plants = [], algae = {}, ...resources }: Partial<TankFields> = {}): SimulationState {
  return produce(createSimulation({ tankCapacity: LITRES }), (draft) => {
    const water = resources.water ?? draft.resources.water;
    for (const n of NUTRIENTS) draft.resources[n] = nutrientsDefaults.halfSaturation[n] * RICH * water;
    draft.resources.nitrate = 20 * water;
    Object.assign(draft.resources, resources);
    for (const kind of ALGAE_KINDS) draft.algae[kind] = bloomAt(draft, kind, algae[kind] ?? 0);
    draft.plants = plants;
  });
}

const total = (effects: readonly Effect[], resource: string, source?: string): number =>
  effects
    .filter((e) => e.resource === resource && (source === undefined || e.source === source))
    .reduce((sum, e) => sum + deltaOf(e), 0);

const sword = (o: Partial<Omit<Plant, 'budget'>> & { size?: number } = {}): Plant =>
  plantRecord({ id: 'sword', species: 'amazon_sword', size: 50, ...o });

/** The plant with its budget changed. */
const withBudget = (plant: Plant, budget: Partial<FloraState>): Plant => ({ ...plant, budget: { ...plant.budget, ...budget } });

/** mg of each nutrient a budget holds: its structure at Q_min and its stores. */
const held = (budget: FloraState, qMin: NutrientVector): NutrientVector =>
  mapNutrients((n) => qMin[n] * budget.structure + budget.stores[n]);

/** mg of each nutrient every plant and bloom holds. */
function floraHeld(state: SimulationState): NutrientVector {
  const all = [
    ...state.plants.map((p) => held(p.budget, plantParams(p.species, config.plants).qMin)),
    ...ALGAE_KINDS.map((k) => held(state.algae[k].budget, bloomParams(k, config.plants).qMin)),
  ];
  return mapNutrients((n) => all.reduce((sum, h) => sum + h[n], 0));
}

const allFluxes = (result: ReturnType<typeof processFlora>): FloraFluxes[] => [
  ...result.fluxes,
  ...ALGAE_KINDS.map((k) => result.algae[k].fluxes),
];

describe('processFlora — the gases', () => {
  it('fixes what the budgets assimilate and burns what they burn, on the one yield', () => {
    for (const lighting of [LIT, DARK]) {
      const state = tank({ plants: [sword()], ...lighting });
      const result = processFlora(state, config);
      const fixed = carbonGases(result.fluxes.reduce((sum, f) => sum + f.assimilated, 0) + ALGAE_KINDS.reduce((s, k) => s + result.algae[k].fluxes.assimilated, 0));
      const burned = carbonGases(allFluxes(result).reduce((sum, f) => sum + totalBurned(f), 0));
      expect(total(result.effects, 'co2', 'photosynthesis')).toBeCloseTo(-getPpm(fixed.co2, LITRES), 12);
      expect(total(result.effects, 'oxygen', 'photosynthesis')).toBeCloseTo(getPpm(fixed.oxygen, LITRES), 12);
      expect(total(result.effects, 'co2', 'respiration')).toBeCloseTo(getPpm(burned.co2, LITRES), 12);
      expect(total(result.effects, 'oxygen', 'respiration')).toBeCloseTo(-getPpm(burned.oxygen, LITRES), 12);
    }
  });

  it('photosynthesises by day only and respires day and night', () => {
    const day = processFlora(tank({ plants: [sword()], ...LIT }), config).effects;
    const night = processFlora(tank({ plants: [sword()], ...DARK }), config).effects;
    expect(total(day, 'oxygen', 'photosynthesis')).toBeGreaterThan(0);
    expect(total(night, 'oxygen', 'photosynthesis')).toBe(0);
    expect(total(night, 'oxygen', 'respiration')).toBeLessThan(0);
  });

  it('moves the concentration of a tank half the size twice as far', () => {
    const moved = (water: number): number =>
      total(processFlora(tank({ plants: [sword()], ...LIT, co2: 1e6, water }), config).effects, 'oxygen');
    expect(moved(LITRES / 2)).toBeCloseTo(2 * moved(LITRES), 6);
  });

  it('offers less carbon in water short of oxygen, the upkeep owed in full', () => {
    const hour = (oxygen: number): FloraFluxes => processFlora(tank({ plants: [sword()], ...LIT, oxygen }), config).fluxes[0];
    expect(hour(0.3).assimilated).toBeLessThan(hour(8).assimilated);
    expect(hour(0.3).owed).toBeCloseTo(hour(8).owed, 12);
  });

  it('emits no gas into a tank with no water in it', () => {
    const { effects } = processFlora(tank({ plants: [sword()], ...LIT, water: 0 }), config);
    expect(total(effects, 'oxygen', 'photosynthesis')).toBe(0);
  });
});

describe('processFlora — uptake', () => {
  const bedded = (plants: Plant[]): SimulationState =>
    produce(tank({ plants, ...LIT }), (draft) => {
      draft.equipment.substrate = { ...draft.equipment.substrate, type: 'aqua_soil', nutrients: getSubstrateNutrients('aqua_soil', LITRES) };
    });
  const hungry = (species: PlantSpecies): Plant =>
    withBudget(plantRecord({ id: species, species, size: 50 }), { stores: mapNutrients(() => 0) });

  it('takes out of the water and the bed exactly what the flora gained and shed', () => {
    const state = bedded([hungry('amazon_sword'), hungry('monte_carlo'), hungry('java_fern')]);
    const result = processFlora(state, config);
    const after = result.state;
    const fromWater = mapNutrients((n) => -total(result.effects, n, 'uptake'));
    const nitrogenFromAmmonia = nutrientsIn({ ammonia: -total(result.effects, 'ammonia', 'uptake'), nitrate: 0, phosphate: 0, potassium: 0, iron: 0 }).nitrate;
    for (const n of NUTRIENTS) {
      const bed = state.equipment.substrate.nutrients[n] - after.equipment.substrate.nutrients[n];
      const water = fromWater[n] + (n === 'nitrate' ? nitrogenFromAmmonia : 0);
      const shed = result.effects.reduce((sum, e) => (e.resource === 'waste' ? sum + e.delta.nutrients[n] : sum), 0);
      const gained = floraHeld(after)[n] - floraHeld(state)[n];
      expect(water + bed).toBeCloseTo(gained + shed, 9);
    }
  });

  it('draws a fern from the water alone, and a sword and a carpet from the bed at their root shares', () => {
    for (const species of ['java_fern', 'amazon_sword', 'monte_carlo'] as const) {
      const state = bedded([hungry(species)]);
      const after = processFlora(state, config).state;
      const bed = state.equipment.substrate.nutrients.potassium - after.equipment.substrate.nutrients.potassium;
      if (growthFormOf(species).rootShare === 0) expect(bed).toBe(0);
      else expect(bed).toBeGreaterThan(0);
    }
  });

  it('spends KH on the ammonia the stores take and returns it on the nitrate', () => {
    const state = produce(tank({ plants: [hungry('java_fern')], ...LIT }), (draft) => {
      draft.resources.ammonia = 1 * LITRES;
    });
    const { effects } = processFlora(state, config);
    const uptake = {
      ammonia: -total(effects, 'ammonia', 'uptake'),
      nitrate: -total(effects, 'nitrate', 'uptake'),
      phosphate: 0,
      potassium: 0,
      iron: 0,
    };
    expect(uptake.ammonia).toBeGreaterThan(0);
    expect(total(effects, 'kh', 'uptake')).toBeCloseTo(uptakeAlkalinity(uptake), 12);
  });

  it('never draws a pool below zero, however many hungry plants feed on it', () => {
    const crowd = Array.from({ length: 60 }, (_, i) => ({ ...hungry('monte_carlo'), id: `m${i}` }));
    const lean = produce(tank({ plants: crowd, ...LIT }), (draft) => {
      for (const n of NUTRIENTS) draft.resources[n] = 0.001 * LITRES;
    });
    const { effects } = processFlora(lean, config);
    for (const n of NUTRIENTS) expect(lean.resources[n] + total(effects, n)).toBeGreaterThanOrEqual(0);
  });
});

describe('processFlora — plants', () => {
  it('grows a fed plant under the lamp and ages it a tick', () => {
    const before = sword();
    const after = processFlora(tank({ plants: [before], ...LIT }), config).state.plants[0];
    expect(after.budget.structure).toBeGreaterThan(before.budget.structure);
    expect(after.age).toBe(before.age + 1);
  });

  it('holds a fed plant at full condition through a scheduled night', () => {
    const night = processFlora(tank({ plants: [sword()], light: 0, lightByHour: LIT_DAY }), config);
    expect(night.vitalities[0].newCondition).toBe(100);
  });

  it('starves a plant whose reserve cannot pay its upkeep, and repairs a hurt one out of its reserve', () => {
    const starved = processFlora(tank({ plants: [withBudget(sword(), { reserve: 0, offshootBuffer: 0 })], ...DARK }), config);
    expect(starved.fluxes[0].shortfall).toBeGreaterThan(0);
    expect(starved.vitalities[0].breakdown.stressors.find((f) => f.key === 'starvation')!.amount).toBeGreaterThan(0);

    const hurt = processFlora(tank({ plants: [sword({ condition: 60 })], ...LIT }), config);
    expect(hurt.fluxes[0].burned.healing).toBeGreaterThan(0);
    expect(hurt.vitalities[0].breakdown.healed).toBeGreaterThan(0);
  });

  it('sheds a plant in poor condition as waste at Q_min with its reserve, keeping its stores', () => {
    const plant = sword({ condition: 30 });
    const result = processFlora(tank({ plants: [plant], ...DARK }), config);
    const shed = result.shedding;
    const qMin = plantParams('amazon_sword', config.plants).qMin;
    const structure = shed.nutrients.phosphate / qMin.phosphate;
    expect(shedShare(result.vitalities[0].newCondition, config.plants)).toBeGreaterThan(0);
    expect(structure).toBeGreaterThan(0);
    for (const n of NUTRIENTS) expect(shed.nutrients[n]).toBeCloseTo(qMin[n] * structure, 12);
    expect(shed.grams).toBeGreaterThan(structure);
    expect(total(result.effects, 'waste', 'plant-shedding')).toBeCloseTo(shed.grams, 12);
  });

  it('removes a plant at condition 0, its remains to waste and its stores to the water', () => {
    const doomed = withBudget(sword({ condition: 0.01 }), { reserve: 0, offshootBuffer: 0 });
    const state = produce(tank({ plants: [doomed], ...DARK }), (draft) => {
      draft.resources.nitrate = 100 * 1000 * LITRES;
    });
    const result = processFlora(state, config);
    expect(result.state.plants).toHaveLength(0);
    expect(result.state.logs.at(-1)!.event).toBe('plant-died');
    expect(total(result.effects, 'waste', 'plant-death')).toBeGreaterThan(0);
    expect(total(result.effects, 'phosphate', 'leaching')).toBeGreaterThan(0);
  });

  it('buys an offshoot when its buffer holds the price: a new unit at the least planted size, appended at age 0', () => {
    const p = plantParams('java_fern', config.plants);
    const fern = plantRecord({ id: 'fern', species: 'java_fern', size: 80 });
    const budding = withBudget(fern, { offshootBuffer: 1.01 * offshootPrice(fern.budget, p, offshootStructure('java_fern')) });
    const result = processFlora(tank({ plants: [budding], ...LIT }), config);
    const [parent, child] = result.state.plants;
    expect(result.state.plants).toHaveLength(2);
    expect(child.parentId).toBe('fern');
    expect(child.familyId).toBe('fern');
    expect(child.age).toBe(0);
    expect(child.budget.structure).toBeCloseTo(offshootStructure('java_fern'), 12);
    expect(parent.budget.offshootBuffer).toBeLessThan(budding.budget.offshootBuffer);
    expect(result.state.logs.at(-1)!.message).toContain(growthFormOf('java_fern').offshootVerb);
  });

  it('reads every plant’s light off the one canopy pass', () => {
    const plants = [sword(), plantRecord({ id: 'carpet', species: 'monte_carlo', size: 60 })];
    const state = tank({ plants, ...LIT });
    expect(processFlora(state, config).light).toEqual(readPlantLight(state, config));
  });

  it('runs a size-0 unit and a dark tank without a NaN, and leaves the state it was handed alone', () => {
    const state = tank({ plants: [sword({ size: 0 }), sword({ id: 'b' })], ...DARK });
    const frozen = JSON.stringify(state);
    const result = processFlora(state, config);
    expect(nonFinitePaths(result.state)).toEqual([]);
    expect(JSON.stringify(state)).toBe(frozen);
  });

  it('keeps every field finite every hour of a lit month', () => {
    let state = tank({ plants: [sword(), plantRecord({ id: 'c', species: 'monte_carlo', size: 30 })], ...LIT, algae: { greenWater: 1, film: 1 } });
    for (let hour = 0; hour < 30 * 24; hour++) {
      const lit = hour % 24 < CARE_SHEET_PHOTOPERIOD;
      state = processFlora(produce(state, (d) => void (d.resources.light = lit ? 60 : 0)), config).state;
    }
    expect(nonFinitePaths(state)).toEqual([]);
    expect(state.plants.every((p) => sizeOf(p) <= 100)).toBe(true);
  });
});

describe.each(ALGAE_KINDS)('processFlora — %s', (kind) => {
  const traits = ALGAE[kind];

  it('grows on its stores under the lamp, and reads the light over its own habitat', () => {
    const state = tank({ algae: { [kind]: 10 }, ...LIT });
    const result = processFlora(state, config);
    expect(bloomMass(result.state, kind)).toBeGreaterThan(bloomMass(state, kind));
    expect(result.algae[kind].light.par).toBeCloseTo(60 * habitatGain(traits.habitat, state, config.optics), 12);
  });

  it('draws its stores from the water, never the bed', () => {
    const state = produce(tank({ algae: { [kind]: 10 }, ...LIT }), (draft) => {
      draft.algae[kind].budget.stores = mapNutrients(() => 0);
      draft.equipment.substrate.nutrients = getSubstrateNutrients('aqua_soil', LITRES);
    });
    const result = processFlora(state, config);
    expect(result.state.equipment.substrate.nutrients).toEqual(state.equipment.substrate.nutrients);
    expect(result.algae[kind].waterUptake.phosphate).toBeGreaterThan(0);
  });

  it('crowds out its own growth as it fills its habitat', () => {
    const grown = (mass: number): number => {
      const state = tank({ algae: { [kind]: mass }, ...LIT });
      return processFlora(state, config).algae[kind].fluxes.toStructure / state.algae[kind].budget.structure;
    };
    expect(grown(90)).toBeLessThan(grown(10));
  });

  it('dies back at condition 0: its remains to waste, its stores to the water, logging the coverage it took', () => {
    const state = produce(tank({ algae: { [kind]: 20 }, ...DARK }), (draft) => {
      draft.algae[kind] = { ...draft.algae[kind], condition: 0.01, budget: { ...draft.algae[kind].budget, reserve: 0 } };
    });
    const result = processFlora(state, config);
    expect(total(result.effects, 'waste', 'algae-death')).toBeGreaterThan(0);
    expect(result.state.logs.some((log) => log.event === 'algae-died' && log.message.startsWith(traits.name))).toBe(true);
    expect(result.state.algae[kind].condition).toBe(100);
  });

  it('lands spores every hour, even on an empty habitat, out of the water', () => {
    const state = tank({ ...DARK });
    const result = processFlora(state, config);
    expect(result.state.algae[kind].budget.structure).toBeGreaterThan(0);
    expect(result.algae[kind].waterUptake.phosphate).toBeGreaterThan(0);
  });

  it('is harmed by thriving plants, and the more of them the more', () => {
    const harm = (count: number): number => {
      const plants = Array.from({ length: count }, (_, i) => sword({ id: `s${i}` }));
      const { vitality } = processFlora(tank({ plants, algae: { [kind]: 10 }, ...LIT }), config).algae[kind];
      return vitality.breakdown.stressors.find((f) => f.key === 'allelopathy')!.amount;
    };
    expect(harm(0)).toBe(0);
    expect(harm(2)).toBeGreaterThan(harm(1));
  });
});

describe('processFlora — one pool', () => {
  it('leaves each plant a smaller share of lean water beside a hungry bloom', () => {
    const lean = (algae: Partial<Record<AlgaeKind, number>>): SimulationState =>
      produce(tank({ plants: [withBudget(sword(), { stores: mapNutrients(() => 0) })], algae, ...LIT }), (draft) => {
        draft.resources.phosphate = 0.05 * LITRES;
        draft.algae.greenWater.budget.stores = mapNutrients(() => 0);
      });
    const alone = processFlora(lean({}), config).state.plants[0].budget.stores.phosphate;
    const beside = processFlora(lean({ greenWater: 3 }), config).state.plants[0].budget.stores.phosphate;
    expect(beside).toBeLessThan(alone);
  });
});

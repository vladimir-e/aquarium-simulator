import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { processFlora, type BloomHour, type FloraProcessingResult } from './index.js';
import { bloomParams, plantParams } from './params.js';
import { readPlantLight } from '../plants/index.js';
import { floorCover, sizeOf } from '../plants/canopy.js';
import { offshootStructure } from '../plants/create-plant.js';
import { nutrientsIn, uptakeAlkalinity } from '../systems/nutrients.js';
import { carbonGases } from '../systems/photosynthesis.js';
import { floraNutrients, floraOrganics, type FloraFluxes } from '../systems/flora-budget.js';
import { totalBurned } from '../systems/reserve.js';
import { shedShare } from '../systems/flora.js';
import { deltaOf } from '../tests/effects.js';
import { getPpm } from '../resources/index.js';
import type { Plant, SimulationState } from '../state.js';
import {
  ALGAE,
  ALGAE_KINDS,
  allelopathy,
  bloomCoverage,
  bloomTissue,
  habitatGain,
  habitatSize,
  type AlgaeKind,
} from '../algae/index.js';
import { createRng } from '../core/rng.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { mapNutrients, NUTRIENTS, type NutrientVector } from '../config/nutrients.js';
import { PLANT_SPECIES_DATA, growthFormOf, type PlantSpecies } from '../plants/species.js';
import { getSubstrateNutrients } from '../equipment/substrate.js';
import { plantRecord, withBudget } from '../tests/plant.js';
import { nonFinitePaths } from '../tests/leaves.js';
import { floraTank, hoursUntil, litDay, runFlora } from '../tests/flora.js';
import { HOURS_PER_DAY } from '../core/clock.js';
import type { Effect } from '../core/effects.js';
import { C_TO_CO2_MASS_RATIO, CH2O_TO_C_MASS_RATIO, MG_PER_G } from '../core/chemistry.js';

const config = DEFAULT_CONFIG;
const LITRES = 100;

/** Twice the light the neediest species is rated to live on. */
const LIT_PAR = 2 * Math.max(...Object.values(PLANT_SPECIES_DATA).map((species) => species.tolerableLight[0]));
const LIT = { light: LIT_PAR, lightByHour: litDay(LIT_PAR).day };
const UNLIT = { light: 0, lightByHour: new Array(24).fill(0) };

const total = (effects: readonly Effect[], resource: string, source?: string): number =>
  effects
    .filter((e) => e.resource === resource && (source === undefined || e.source === source))
    .reduce((sum, e) => sum + deltaOf(e), 0);

const sword = (o: Partial<Omit<Plant, 'budget'>> & { size?: number } = {}): Plant =>
  plantRecord({ id: 'sword', species: 'amazon_sword', size: 50, ...o });

/** mg of each nutrient every plant and bloom holds. */
function floraHeld(state: SimulationState): NutrientVector {
  const all = [
    ...state.plants.map((p) => floraNutrients(p.budget, plantParams(p.species, config.plants))),
    ...ALGAE_KINDS.map((k) => floraNutrients(state.algae[k].budget, bloomParams(k, config.plants))),
  ];
  return mapNutrients((n) => all.reduce((sum, h) => sum + h[n], 0));
}

const allFluxes = (result: ReturnType<typeof processFlora>): FloraFluxes[] => [
  ...result.fluxes,
  ...ALGAE_KINDS.map((k) => result.algae[k].fluxes),
];

describe('processFlora — the gases', () => {
  it('fixes what the budgets assimilate and burns what they burn, on the one yield', () => {
    for (const lighting of [LIT, UNLIT]) {
      const state = floraTank({ plants: [sword()], ...lighting });
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
    const day = processFlora(floraTank({ plants: [sword()], ...LIT }), config).effects;
    const night = processFlora(floraTank({ plants: [sword()], ...UNLIT }), config).effects;
    expect(total(day, 'oxygen', 'photosynthesis')).toBeGreaterThan(0);
    expect(total(night, 'oxygen', 'photosynthesis')).toBe(0);
    expect(total(night, 'oxygen', 'respiration')).toBeLessThan(0);
  });

  it('moves the concentration of a tank half the size twice as far', () => {
    const moved = (water: number): number =>
      total(processFlora(floraTank({ plants: [sword()], ...LIT, co2: 1e6, water }), config).effects, 'oxygen');
    expect(moved(LITRES / 2)).toBeCloseTo(2 * moved(LITRES), 6);
  });

  it('offers less carbon in water short of oxygen, the upkeep owed in full', () => {
    const hour = (oxygen: number): FloraFluxes => processFlora(floraTank({ plants: [sword()], ...LIT, oxygen }), config).fluxes[0];
    expect(hour(0.3).assimilated).toBeLessThan(hour(8).assimilated);
    expect(hour(0.3).owed).toBeCloseTo(hour(8).owed, 12);
  });

  it('emits no gas into a tank with no water in it', () => {
    const { effects } = processFlora(floraTank({ plants: [sword()], ...LIT, water: 0 }), config);
    expect(total(effects, 'oxygen', 'photosynthesis')).toBe(0);
  });

  describe('the compensation point', () => {
    const netOxygen = (species: PlantSpecies, light: number): number => {
      const { effects } = processFlora(floraTank({ plants: [plantRecord({ id: 'p', species, size: 50 })], light, co2: 30 }), config);
      return total(effects, 'oxygen', 'photosynthesis') + total(effects, 'oxygen', 'respiration');
    };

    const crossover = (species: PlantSpecies): number => {
      let dark = 0;
      let lit = 400;
      for (let step = 0; step < 40; step++) {
        const mid = (dark + lit) / 2;
        if (netOxygen(species, mid) < 0) dark = mid;
        else lit = mid;
      }
      return lit;
    };

    it('runs a planting under too dim a fixture at a net loss, lamps on', () => {
      for (const species of ['java_fern', 'monte_carlo'] as const) {
        expect(netOxygen(species, crossover(species) / 2)).toBeLessThan(0);
        expect(netOxygen(species, 400)).toBeGreaterThan(0);
      }
    });

    it('breaks even in dimmer light the lower a species saturates', () => {
      expect(crossover('java_fern')).toBeLessThan(crossover('monte_carlo'));
    });
  });
});

describe('processFlora — uptake', () => {
  const bedded = (plants: Plant[]): SimulationState =>
    produce(floraTank({ plants, ...LIT }), (draft) => {
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
    const state = produce(floraTank({ plants: [hungry('java_fern')], ...LIT }), (draft) => {
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
    const lean = produce(floraTank({ plants: crowd, ...LIT }), (draft) => {
      for (const n of NUTRIENTS) draft.resources[n] = 0.001 * LITRES;
    });
    const { effects } = processFlora(lean, config);
    for (const n of NUTRIENTS) expect(lean.resources[n] + total(effects, n)).toBeGreaterThanOrEqual(0);
  });
});

describe('processFlora — plants', () => {
  it('grows a fed plant under the lamp and ages it a tick', () => {
    const before = sword();
    const after = processFlora(floraTank({ plants: [before], ...LIT }), config).state.plants[0];
    expect(after.budget.structure).toBeGreaterThan(before.budget.structure);
    expect(after.age).toBe(before.age + 1);
  });

  it('holds a fed plant at full condition through a scheduled night', () => {
    const night = processFlora(floraTank({ plants: [sword()], light: 0, lightByHour: LIT.lightByHour }), config);
    expect(night.vitalities[0].newCondition).toBe(100);
  });

  it('starves a plant whose reserve cannot pay its upkeep, and repairs a hurt one out of its reserve', () => {
    const starved = processFlora(floraTank({ plants: [withBudget(sword(), { reserve: 0, offshootBuffer: 0 })], ...UNLIT }), config);
    expect(starved.fluxes[0].shortfall).toBeGreaterThan(0);
    expect(starved.vitalities[0].breakdown.stressors.find((f) => f.key === 'starvation')!.amount).toBeGreaterThan(0);

    const hurt = processFlora(floraTank({ plants: [sword({ condition: 60 })], ...LIT }), config);
    expect(hurt.fluxes[0].burned.healing).toBeGreaterThan(0);
    expect(hurt.vitalities[0].breakdown.healed).toBeGreaterThan(0);
  });

  it('sheds a plant in poor condition as waste at Q_min with its reserve, keeping its stores', () => {
    const plant = sword({ condition: 30 });
    const result = processFlora(floraTank({ plants: [plant], ...UNLIT }), config);
    const shed = result.shedding;
    const qMin = plantParams('amazon_sword', config.plants).qMin;
    const structure = shed.nutrients.phosphate / qMin.phosphate;
    expect(shedShare(result.vitalities[0].newCondition, config.plants)).toBeGreaterThan(0);
    expect(structure).toBeGreaterThan(0);
    for (const n of NUTRIENTS) expect(shed.nutrients[n]).toBeCloseTo(qMin[n] * structure, 12);
    expect(shed.grams).toBeGreaterThan(structure);
    expect(total(result.effects, 'waste', 'plant-shedding')).toBeCloseTo(shed.grams, 12);
  });

  it('removes a plant at condition 0, its remains and its stores to waste', () => {
    const doomed = withBudget(sword({ condition: 0.01 }), { reserve: 0, offshootBuffer: 0 });
    const state = produce(floraTank({ plants: [doomed], ...UNLIT }), (draft) => {
      draft.resources.nitrate = 100 * 1000 * LITRES;
    });
    const result = processFlora(state, config);
    const [remains] = result.effects.flatMap((e) => (e.resource === 'waste' && e.source === 'plant-death' ? [e.delta] : []));
    expect(result.state.plants).toHaveLength(0);
    expect(result.state.logs.at(-1)!.event).toBe('plant-died');
    expect(remains.nutrients.phosphate).toBeGreaterThan(
      doomed.budget.structure * plantParams('amazon_sword', config.plants).qMin.phosphate
    );
  });

  it('cuts an offshoot loose when its buffer holds one: its growth form’s offshoot size, appended at age 0', () => {
    const fern = plantRecord({ id: 'fern', species: 'java_fern', size: 80 });
    const budding = withBudget(fern, { offshootBuffer: 1.01 * offshootStructure('java_fern') });
    const result = processFlora(floraTank({ plants: [budding], ...LIT }), config);
    const [parent, child] = result.state.plants;
    expect(result.state.plants).toHaveLength(2);
    expect(child.parentId).toBe('fern');
    expect(child.familyId).toBe('fern');
    expect(child.age).toBe(0);
    expect(child.budget.structure).toBeCloseTo(offshootStructure('java_fern'), 12);
    expect(parent.budget.offshootBuffer).toBeLessThan(budding.budget.offshootBuffer);
    expect(result.state.logs.at(-1)!.message).toContain(growthFormOf('java_fern').offshootVerb);
  });

  it('buys offshoots whatever the floor', () => {
    const crammed = Array.from({ length: 12 }, (_, i) =>
      withBudget(plantRecord({ id: `m${i}`, species: 'amazon_sword', size: 100 }), {
        offshootBuffer: 1.01 * offshootStructure('amazon_sword'),
      })
    );
    const state = floraTank({ plants: crammed, ...LIT });
    expect(floorCover(state.plants, state.tank.capacity)).toBeGreaterThan(1);
    expect(processFlora(state, config).state.plants).toHaveLength(24);
  });

  it('buds a vigorous clone sooner than its twin beside it', () => {
    const twins = [0.1, -0.1].map((vigour, i) => plantRecord({ id: `twin${i}`, species: 'monte_carlo', size: 80, vigour }));
    const run = runFlora(floraTank({ plants: twins }), 10 * HOURS_PER_DAY, litDay(LIT_PAR));
    const firstBud = (id: string): number => hoursUntil(run.hours, ({ state }) => state.plants.some((p) => p.parentId === id));
    expect(firstBud('twin0')).toBeLessThan(firstBud('twin1'));
    expect(firstBud('twin1')).toBeLessThan(Infinity);
  });

  it('draws ids and vigours in plant order, so one seed gives one lineage', () => {
    const mothers = ['a', 'b', 'c'].map((id) =>
      withBudget(plantRecord({ id, species: 'java_fern', size: 80 }), { offshootBuffer: 1.01 * offshootStructure('java_fern') })
    );
    const born = (rngSeed: number): Plant[] =>
      processFlora(
        produce(floraTank({ plants: mothers, ...LIT }), (draft) => {
          draft.rng = createRng(rngSeed);
        }),
        config
      ).state.plants.slice(3);
    const lineage = (plants: Plant[]): unknown[] => plants.map(({ id, parentId, familyId, vigour }) => ({ id, parentId, familyId, vigour }));

    expect(born(11).map((p) => p.parentId)).toEqual(['a', 'b', 'c']);
    expect(lineage(born(11))).toEqual(lineage(born(11)));
    expect(born(11).map((p) => p.vigour)).not.toEqual(born(12).map((p) => p.vigour));
  });

  it('cuts one offshoot loose an hour: a buffer holding two buys one, and the other the hour after', () => {
    const fern = plantRecord({ id: 'fern', species: 'java_fern', size: 80 });
    const budding = withBudget(fern, { offshootBuffer: 2.02 * offshootStructure('java_fern') });
    const first = processFlora(floraTank({ plants: [budding], ...LIT }), config).state;
    const second = processFlora(first, config).state;
    expect(first.plants.map((p) => p.parentId)).toEqual([null, 'fern']);
    expect(second.plants.map((p) => p.parentId)).toEqual([null, 'fern', 'fern']);
  });

  it('reads every plant’s light off the one canopy pass', () => {
    const plants = [sword(), plantRecord({ id: 'carpet', species: 'monte_carlo', size: 60 })];
    const state = floraTank({ plants, ...LIT });
    expect(processFlora(state, config).light).toEqual(readPlantLight(state, config));
  });

  it('runs a size-0 unit and a dark tank without a NaN, and leaves the state it was handed alone', () => {
    const state = floraTank({ plants: [sword({ size: 0 }), sword({ id: 'b' })], ...UNLIT });
    const frozen = JSON.stringify(state);
    const result = processFlora(state, config);
    expect(nonFinitePaths(result.state)).toEqual([]);
    expect(JSON.stringify(state)).toBe(frozen);
  });

  it('keeps every field finite every hour of a lit month, the sword budding within it', () => {
    const start = floraTank({ plants: [sword(), plantRecord({ id: 'c', species: 'monte_carlo', size: 30 })], algae: { greenWater: 1, film: 1 } });
    const { state } = runFlora(start, 30 * HOURS_PER_DAY, litDay(LIT_PAR));
    expect(nonFinitePaths(state)).toEqual([]);
    expect(state.plants.every((p) => sizeOf(p) <= 100)).toBe(true);
    expect(state.plants.some((p) => p.parentId === 'sword')).toBe(true);
  });
});

describe.each(ALGAE_KINDS)('processFlora — %s', (kind) => {
  const traits = ALGAE[kind];

  it('grows on its stores under the lamp, and reads the light over its own habitat', () => {
    const state = floraTank({ algae: { [kind]: 10 }, ...LIT });
    const result = processFlora(state, config);
    expect(bloomCoverage(result.state, kind)).toBeGreaterThan(bloomCoverage(state, kind));
    expect(result.algae[kind].light.par).toBeCloseTo(60 * habitatGain(traits.habitat, state, config.optics), 12);
  });

  it('draws its stores from the water, never the bed', () => {
    const state = produce(floraTank({ algae: { [kind]: 10 }, ...LIT }), (draft) => {
      draft.algae[kind].budget.stores = mapNutrients(() => 0);
      draft.equipment.substrate.nutrients = getSubstrateNutrients('aqua_soil', LITRES);
    });
    const result = processFlora(state, config);
    expect(result.state.equipment.substrate.nutrients).toEqual(state.equipment.substrate.nutrients);
    expect(result.algae[kind].waterUptake.phosphate).toBeGreaterThan(0);
  });

  it('closes its organics from what the pass reports: fixed less burned and shed, and the spores that landed', () => {
    const hurt = produce(floraTank({ algae: { [kind]: 10 }, ...LIT }), (draft) => {
      draft.algae[kind].condition = 60;
    });
    const result = processFlora(hurt, config);
    const hour = result.algae[kind];
    expect(hour.shedding.grams).toBeGreaterThan(0);
    expect(hour.spores).toBeGreaterThan(0);
    expect(floraOrganics(result.state.algae[kind].budget)).toBeCloseTo(
      floraOrganics(hurt.algae[kind].budget) + hour.fluxes.assimilated - totalBurned(hour.fluxes) - hour.shedding.grams + hour.spores,
      10
    );
  });

  it('crowds out its own growth as it fills its habitat', () => {
    const grown = (coverage: number): number => {
      const state = floraTank({ algae: { [kind]: coverage }, ...LIT });
      return processFlora(state, config).algae[kind].fluxes.toStructure / state.algae[kind].budget.structure;
    };
    expect(grown(90)).toBeLessThan(grown(10));
  });

  it('dies back at condition 0: its remains to waste, its stores to the water, logging the coverage it took', () => {
    const state = produce(floraTank({ algae: { [kind]: 20 }, ...UNLIT }), (draft) => {
      draft.algae[kind] = { ...draft.algae[kind], condition: 0.01, budget: { ...draft.algae[kind].budget, reserve: 0 } };
    });
    const result = processFlora(state, config);
    expect(total(result.effects, 'waste', 'algae-death')).toBeGreaterThan(0);
    expect(result.state.logs.some((log) => log.event === 'algae-died' && log.message.startsWith(traits.name))).toBe(true);
    expect(result.state.algae[kind].condition).toBe(100);
  });

  it('lands spores every hour, even on an empty habitat, unfed, at Q_min and stores no fuller than full, out of exactly what the water lost', () => {
    const state = floraTank({ ...UNLIT });
    const result = processFlora(state, config);
    const p = bloomParams(kind, config.plants);
    const landed = result.state.algae[kind].budget;
    const held = floraNutrients(landed, p);
    const took = nutrientsIn(result.algae[kind].waterUptake);
    expect(landed.structure).toBeGreaterThan(0);
    expect(landed.structure).toBeLessThanOrEqual(bloomTissue(traits.sporeRate, habitatSize(traits.habitat, state), traits));
    expect(landed.reserve).toBe(0);
    for (const n of NUTRIENTS) {
      expect(held[n]).toBeCloseTo(took[n], 12);
      expect(landed.stores[n]).toBeLessThanOrEqual((p.qMax[n] - p.qMin[n]) * landed.structure * (1 + 1e-12));
    }
  });

  it('is offered carbon to the ceiling thriving plants’ exudates leave it, the lower the more of them, and reports that ceiling', () => {
    const planting = (count: number): Plant[] => Array.from({ length: count }, (_, i) => sword({ id: `s${i}` }));
    const hour = (count: number, allelopathySeverity = config.algae.allelopathySeverity): BloomHour => {
      const state = floraTank({ plants: planting(count), algae: { [kind]: 10 }, ...LIT, co2: 1e6 });
      return processFlora(state, { ...config, algae: { ...config.algae, allelopathySeverity } }).algae[kind];
    };
    const offered = (count: number, allelopathySeverity?: number): number => {
      const { fluxes } = hour(count, allelopathySeverity);
      return fluxes.assimilated + fluxes.returned;
    };
    const ceiling = (count: number): number => offered(count) / offered(count, 0);
    expect(ceiling(0)).toBe(1);
    expect(ceiling(1)).toBeCloseTo(allelopathy(planting(1), floraTank().resources.water, config.algae).assimilation, 5);
    expect(ceiling(2)).toBeLessThan(ceiling(1));
    for (const count of [0, 1, 2]) expect(hour(count).allelopathy).toBeCloseTo(ceiling(count), 5);
  });
});

describe('processFlora — the spores’ carbon', () => {
  const landed = (result: FloraProcessingResult): number => ALGAE_KINDS.reduce((sum, k) => sum + result.algae[k].spores, 0);
  const everyKind = (coverage: number): Partial<Record<AlgaeKind, number>> =>
    Object.fromEntries(ALGAE_KINDS.map((kind) => [kind, coverage]));

  it('never lets the fixers and the spores draw more CO2 than the water holds', () => {
    const swords = Array.from({ length: 6 }, (_, i) => sword({ id: `s${i}`, size: 100 }));
    for (const co2 of [0.05, 1, 30]) {
      const { effects } = processFlora(floraTank({ plants: swords, algae: everyKind(40), ...LIT, co2 }), config);
      const drawn = -(total(effects, 'co2', 'photosynthesis') + total(effects, 'co2', 'spores'));
      expect(drawn).toBeGreaterThan(0);
      expect(drawn).toBeLessThanOrEqual(co2);
    }
  });

  it('lands no spores in water without CO2', () => {
    const result = processFlora(floraTank({ ...LIT, co2: 0 }), config);
    expect(landed(result)).toBe(0);
    expect(total(result.effects, 'co2', 'spores')).toBe(0);
  });

  it('books under the spores the CO2 the carbon of the structure they landed was', () => {
    const result = processFlora(floraTank({ ...UNLIT }), config);
    const carbon = landed(result) * CH2O_TO_C_MASS_RATIO * MG_PER_G;
    expect(carbon).toBeGreaterThan(0);
    expect(total(result.effects, 'co2', 'spores')).toBeCloseTo(-getPpm(carbon * C_TO_CO2_MASS_RATIO, LITRES), 12);
  });
});

describe('processFlora — one pool', () => {
  it('leaves each plant a smaller share of lean water beside a hungry bloom', () => {
    const lean = (algae: Partial<Record<AlgaeKind, number>>): SimulationState =>
      produce(floraTank({ plants: [withBudget(sword(), { stores: mapNutrients(() => 0) })], algae, ...LIT }), (draft) => {
        draft.resources.phosphate = 0.05 * LITRES;
        draft.algae.greenWater.budget.stores = mapNutrients(() => 0);
      });
    const alone = processFlora(lean({}), config).state.plants[0].budget.stores.phosphate;
    const beside = processFlora(lean({ greenWater: 3 }), config).state.plants[0].budget.stores.phosphate;
    expect(beside).toBeLessThan(alone);
  });
});

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { processFlora } from './index.js';
import { bloomTissue } from '../algae/index.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { NUTRIENTS, nutrientsDefaults } from '../config/nutrients.js';
import { freshSubstrate } from '../equipment/substrate.js';
import { createSimulation, type AlgaeState, type Plant, type SimulationState } from '../state.js';
import { plantRecord } from '../tests/plant.js';
import type { Effect } from '../core/effects.js';

const config = DEFAULT_CONFIG;
const LITRES = 100;

/** A lit tank on rich water over a charged bed, with this bloom and planting. */
function tank(algae: Partial<AlgaeState>, plants: Plant[] = [], light = 60): SimulationState {
  return produce(createSimulation({ tankCapacity: LITRES }), (draft) => {
    draft.equipment.substrate = freshSubstrate('aqua_soil', LITRES);
    for (const n of NUTRIENTS) draft.resources[n] = 20 * nutrientsDefaults.halfSaturation[n] * draft.resources.water;
    draft.resources.light = light;
    draft.resources.lightByHour = Array.from({ length: 24 }, (_, hour) => (hour < 8 ? 60 : 0));
    draft.algae = { mass: 20, condition: 100, surplus: 10, ...algae };
    draft.plants = plants;
  });
}

const total = (effects: readonly Effect[], resource: string, source?: string): number =>
  effects
    .filter((e) => e.resource === resource && (source === undefined || e.source === source))
    .reduce((sum, e) => sum + e.delta, 0);

describe('processFlora — the bloom', () => {
  it('photosynthesises by day and respires day and night, alone in the tank', () => {
    const day = processFlora(tank({}), config).effects;
    const night = processFlora(tank({}, [], 0), config).effects;

    expect(total(day, 'oxygen', 'photosynthesis')).toBeGreaterThan(0);
    expect(total(day, 'co2', 'photosynthesis')).toBeLessThan(0);
    expect(total(night, 'oxygen', 'photosynthesis')).toBe(0);
    expect(total(night, 'oxygen', 'respiration')).toBeLessThan(0);
    expect(total(night, 'oxygen', 'respiration')).toBeCloseTo(total(day, 'oxygen', 'respiration'), 12);
  });

  it('respires in proportion to its mass', () => {
    const respired = (mass: number): number => total(processFlora(tank({ mass }, [], 0), config).effects, 'oxygen', 'respiration');
    expect(respired(40)).toBeCloseTo(2 * respired(20), 10);
  });

  it('grows on its bank at night too, drawing its tissue from the water and never the bed', () => {
    const start = tank({}, [], 0);
    const { state, effects } = processFlora(start, config);

    expect(state.algae.mass).toBeGreaterThan(start.algae.mass);
    expect(state.algae.surplus).toBeLessThan(start.algae.surplus);
    for (const n of NUTRIENTS) {
      expect(total(effects, n, 'growth')).toBeLessThan(0);
      expect(state.equipment.substrate.nutrients[n]).toBe(start.equipment.substrate.nutrients[n]);
    }
  });

  it('draws exactly the recipe of the tissue it grew', () => {
    const start = tank({}, [], 0);
    const { state, effects } = processFlora(start, config);
    const grown = bloomTissue(state.algae.mass - start.algae.mass, LITRES, config.algae);
    const recipe = { nitrate: -total(effects, 'nitrate', 'growth') / grown, phosphate: -total(effects, 'phosphate', 'growth') / grown };

    expect(recipe.phosphate).toBeCloseTo(nutrientsDefaults.foodMineralContent.phosphate, 8);
    expect(recipe.nitrate).toBeGreaterThan(0);
  });

  it('dies back at condition 0 into waste, every gram of it', () => {
    const dying = tank({ condition: 0.001, surplus: 0 }, [], 0);
    const starved = produce(dying, (draft) => {
      draft.resources.lightByHour.fill(0);
    });
    const { state, effects } = processFlora(starved, config);

    expect(state.algae).toEqual({ mass: 0, condition: 0, surplus: 0 });
    expect(total(effects, 'waste')).toBeGreaterThanOrEqual(bloomTissue(starved.algae.mass, LITRES, config.algae));
  });

  it('is harmed by thriving plants, and the more of them the more', () => {
    const harm = (count: number): number => {
      const plants = Array.from({ length: count }, (_, i) =>
        plantRecord({ id: `s${i}`, species: 'amazon_sword', size: 100, condition: 100, surplus: 0 })
      );
      return processFlora(tank({}, plants), config).algae.vitality.breakdown.stressors.find(
        (s) => s.key === 'allelopathy'
      )!.amount;
    };
    expect(harm(0)).toBe(0);
    expect(harm(2)).toBeCloseTo(2 * harm(1), 12);
  });

  it('shares one pool with the plants: a bloom beside them leaves each plant a smaller share of lean water', () => {
    const lean = (algae: Partial<AlgaeState>): SimulationState =>
      produce(tank(algae, [plantRecord({ id: 'fern', species: 'java_fern', size: 50, condition: 100, surplus: 20 })], 0), (draft) => {
        for (const n of NUTRIENTS) draft.resources[n] = 0.05 * nutrientsDefaults.halfSaturation[n] * draft.resources.water;
      });
    const grown = (state: SimulationState): number => processFlora(state, config).state.plants[0].size - state.plants[0].size;

    expect(grown(lean({ mass: 80, surplus: 40 }))).toBeLessThan(grown(lean({ mass: 0, surplus: 0 })));
  });
});

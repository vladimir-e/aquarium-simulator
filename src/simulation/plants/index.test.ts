import { describe, it, expect } from 'vitest';
import { processPlants, readPlantVitality, plantHealingRate } from './index.js';
import { createSimulation, type SimulationState, type Plant, type Resources } from '../state.js';
import type { PlantSpecies } from './species.js';
import { produce } from 'immer';
import { carbonateKh } from '../core/carbonate.js';
import { getKhMass } from '../resources/helpers.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { plantsDefaults } from '../config/plants.js';
import { NUTRIENTS, nutrientsDefaults } from '../config/nutrients.js';
import { CARE_SHEET_PHOTOPERIOD, PLANT_SPECIES_DATA } from './species.js';

const INJECTED_CO2 = 25;

/** Half-saturations the rich test water holds of every nutrient but nitrate. */
const RICH = 1000;
/** Just under the plant nitrate edge: as near saturating as nitrate gets. */
const RICH_NITRATE_PPM = 90;

/** A day with twice the light the neediest species starves under. */
const LIT_DAY = Array.from({ length: 24 }, (_, hour) =>
  hour < CARE_SHEET_PHOTOPERIOD
    ? 2 * Math.max(...Object.values(PLANT_SPECIES_DATA).map((species) => species.tolerableLight[0]))
    : 0
);

describe('processPlants', () => {
  const C = 100;
  const BANK = plantsDefaults.surplusCap / 2;

  function createTestState({
    plants,
    ...resources
  }: Partial<
    { plants: Plant[] } & Pick<
      Resources,
      | 'light'
      | 'lightByHour'
      | 'co2'
      | 'nitrate'
      | 'phosphate'
      | 'potassium'
      | 'iron'
      | 'oxygen'
      | 'temperature'
      | 'water'
      | 'waste'
    >
  > = {}): SimulationState {
    return produce(createSimulation({ tankCapacity: 100 }), (draft) => {
      const water = resources.water ?? draft.resources.water;
      for (const n of NUTRIENTS) {
        draft.resources[n] = nutrientsDefaults.halfSaturation[n] * RICH * water;
      }
      draft.resources.nitrate = RICH_NITRATE_PPM * water;
      Object.assign(draft.resources, resources);
      if (plants !== undefined) draft.plants = plants;
    });
  }

  describe('with no plants', () => {
    it('returns unchanged state when no plants', () => {
      const state = createTestState({ plants: [] });
      const result = processPlants(state, DEFAULT_CONFIG);

      expect(result.state).toBe(state);
      expect(result.effects).toHaveLength(0);
    });
  });

  describe('with plants and lights on (photosynthesis + respiration)', () => {
    const defaultPlants: Plant[] = [
      { id: 'p1', species: 'java_fern', size: 100, condition: C, surplus: 0 },
    ];

    it('photosynthesises and respires as active effects', () => {
      const state = createTestState({
        plants: defaultPlants,
        light: 50,
        co2: INJECTED_CO2,
        nitrate: RICH_NITRATE_PPM * 100,
        water: 100,
      });
      const { effects } = processPlants(state, DEFAULT_CONFIG);
      const delta = (resource: string, source: string): number | undefined =>
        effects.find((e) => e.resource === resource && e.source === source)?.delta;

      expect(delta('oxygen', 'photosynthesis')).toBeGreaterThan(0);
      expect(delta('co2', 'photosynthesis')).toBeLessThan(0);
      expect(delta('nitrate', 'photosynthesis')).toBeLessThan(0);
      expect(delta('oxygen', 'respiration')).toBeLessThan(0);
      expect(delta('co2', 'respiration')).toBeGreaterThan(0);
      expect(effects.every((e) => e.tier === 'active')).toBe(true);
    });

    it('updates plant sizes due to growth', () => {
      const state = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 50, condition: C, surplus: BANK }],
        light: 50,
        co2: INJECTED_CO2,
        nitrate: RICH_NITRATE_PPM * 100,
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      expect(result.state.plants[0].size).toBeGreaterThan(50);
    });

    it('heals a sub-100 plant on its income, banking none of it, while its bank still buys size', () => {
      const state = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 50, condition: 80, surplus: BANK }],
        light: 50,
        co2: INJECTED_CO2,
        nitrate: RICH_NITRATE_PPM * 100,
        water: 100,
      });
      const after = processPlants(state, DEFAULT_CONFIG).state.plants[0];
      expect(after.condition).toBeGreaterThan(80);
      expect(after.surplus).toBeLessThan(BANK);
      expect(after.size).toBeGreaterThan(50);
    });
  });

  describe('with lights off (respiration only)', () => {
    const defaultPlants: Plant[] = [
      { id: 'p1', species: 'java_fern', size: 100, condition: C, surplus: 0 },
    ];

    it('no photosynthesis effects when light is 0', () => {
      const state = createTestState({
        plants: defaultPlants,
        light: 0,
        co2: INJECTED_CO2,
        nitrate: RICH_NITRATE_PPM * 100,
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      const photoEffects = result.effects.filter((e) => e.source === 'photosynthesis');
      expect(photoEffects).toHaveLength(0);
    });

    it('respiration still occurs when lights off', () => {
      const state = createTestState({
        plants: defaultPlants,
        light: 0,
        temperature: 25,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      const respEffects = result.effects.filter((e) => e.source === 'respiration');
      expect(respEffects.length).toBeGreaterThan(0);
    });
  });

  describe('round the clock', () => {
    it('banks while lit and grows off the bank day and night', () => {
      const state = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 50, condition: 100, surplus: BANK }],
        co2: INJECTED_CO2,
        nitrate: RICH_NITRATE_PPM * 100,
        temperature: 25,
        water: 100,
      });
      const runTicks = (s: SimulationState, ticks: number, light: number): SimulationState => {
        let current = produce(s, (draft) => {
          draft.resources.light = light;
        });
        for (let t = 0; t < ticks; t++) current = processPlants(current, DEFAULT_CONFIG).state;
        return current;
      };

      const day = runTicks(state, 5, 50);
      expect(day.plants[0].surplus).toBeGreaterThan(BANK);
      expect(day.plants[0].size).toBeGreaterThan(50);

      const night = runTicks(day, 5, 0);
      expect(night.plants[0].condition).toBe(100);
      expect(night.plants[0].surplus).toBeLessThan(day.plants[0].surplus);
      expect(night.plants[0].size).toBeGreaterThan(day.plants[0].size);
    });

    it('costs a plant nothing but its growth through a scheduled night', () => {
      const state = createTestState({
        plants: [{ id: 'p1', species: 'monte_carlo', size: 50, condition: 100, surplus: 10 }],
        light: 0,
        lightByHour: LIT_DAY,
        water: 100,
      });
      const after = processPlants(state, DEFAULT_CONFIG).state.plants[0];
      const grew = (after.size - 50) / (PLANT_SPECIES_DATA.monte_carlo.growthRate * plantsDefaults.sizePerSurplus);
      expect(after.condition).toBe(100);
      expect(10 - after.surplus).toBeCloseTo(grew, 12);
    });
  });

  describe('day/night O2 balance', () => {
    const netOxygen = (species: PlantSpecies, light: number): number =>
      processPlants(
        createTestState({
          plants: [{ id: 'p1', species, size: 100, condition: C, surplus: 0 }],
          light,
          co2: INJECTED_CO2,
          water: 100,
          temperature: 25,
        }),
        DEFAULT_CONFIG
      )
        .effects.filter((e) => e.resource === 'oxygen')
        .reduce((sum, e) => sum + e.delta, 0);

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

  describe('the water the gases dissolve into', () => {
    const planting: Plant[] = [
      { id: 'p1', species: 'java_fern', size: 100, condition: C, surplus: 0 },
    ];

    const gasIn = (water: number, light: number): { oxygen: number; co2: number } => {
      const result = processPlants(
        createTestState({
          plants: planting,
          light,
          co2: 1e9,
          nitrate: RICH_NITRATE_PPM * water,
          water,
          temperature: 25,
        }),
        DEFAULT_CONFIG
      );
      const sum = (resource: 'oxygen' | 'co2'): number =>
        result.effects.filter((e) => e.resource === resource).reduce((s, e) => s + e.delta, 0);
      return { oxygen: sum('oxygen'), co2: sum('co2') };
    };

    it('moves a lit tank twice as far at half the volume, on plentiful carbon', () => {
      const small = gasIn(150, 50);
      const large = gasIn(300, 50);

      expect(small.oxygen / large.oxygen).toBeCloseTo(2, 6);
      expect(small.co2 / large.co2).toBeCloseTo(2, 6);
    });

    it('does the same to the night draw', () => {
      const small = gasIn(150, 0);
      const large = gasIn(300, 0);

      expect(small.oxygen / large.oxygen).toBeCloseTo(2, 6);
      expect(small.co2 / large.co2).toBeCloseTo(2, 6);
    });

    it('emits no gas at all into a tank with no water in it', () => {
      const drained = processPlants(
        createTestState({ plants: planting, light: 50, co2: 0, water: 0 }),
        DEFAULT_CONFIG
      );

      for (const effect of drained.effects) {
        expect(Number.isFinite(effect.delta)).toBe(true);
      }
      expect(drained.effects.filter((e) => e.resource === 'oxygen')).toHaveLength(0);
      expect(drained.effects.filter((e) => e.resource === 'co2')).toHaveLength(0);
    });
  });

  describe('shedding and death', () => {
    it('sheds a plant in poor condition into waste and removes one at condition 0', () => {
      const state = createTestState({
        plants: [
          { id: 'poorly', species: 'java_fern', size: 50, condition: 50, surplus: 0 },
          { id: 'dead', species: 'java_fern', size: 50, condition: 0, surplus: 0 },
        ],
        light: 0,
        temperature: 25,
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      expect(result.state.plants.map((p) => p.id)).toEqual(['poorly']);
      expect(result.state.plants[0].size).toBeLessThan(50);
      const waste = result.effects.find((e) => e.resource === 'waste');
      expect(waste?.source).toBe('plant-condition');
      expect(waste?.delta).toBeGreaterThan(0);
      expect(result.state.logs.filter((l) => l.event === 'plant-died')).toHaveLength(1);
    });

    it('sheds nothing at full condition, bank or no bank', () => {
      const state = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 50, condition: 100, surplus: 0 }],
        light: 0,
        lightByHour: LIT_DAY,
        water: 100,
      });
      expect(processPlants(state, DEFAULT_CONFIG).state.plants[0].size).toBe(50);
    });
  });

  describe('multiple plants', () => {
    it('processes multiple plants correctly', () => {
      const state = createTestState({
        plants: [
          { id: 'p1', species: 'java_fern', size: 50, condition: C, surplus: BANK },
          { id: 'p2', species: 'anubias', size: 60, condition: C, surplus: BANK },
          {
            id: 'p3',
            species: 'amazon_sword',
            size: 70,
            condition: C,
            surplus: BANK,
          },
        ],
        light: 50,
        co2: INJECTED_CO2,
        nitrate: RICH_NITRATE_PPM * 100,
        water: 100,
        temperature: 25,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      expect(result.state.plants[0].size).toBeGreaterThan(50);
      expect(result.state.plants[1].size).toBeGreaterThan(60);
      expect(result.state.plants[2].size).toBeGreaterThan(70);
    });
  });

  describe('immutability', () => {
    it('does not modify original state', () => {
      const state = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 50, condition: C, surplus: 0 }],
        light: 50,
        co2: INJECTED_CO2,
        nitrate: RICH_NITRATE_PPM * 100,
        water: 100,
      });
      const originalSize = state.plants[0].size;

      processPlants(state, DEFAULT_CONFIG);

      expect(state.plants[0].size).toBe(originalSize);
    });
  });

  describe('the bank heals', () => {
    const hostilePh = (s: SimulationState): SimulationState =>
      produce(s, (draft) => {
        draft.resources.kh = getKhMass(carbonateKh(draft.resources.co2, 9.5), draft.resources.water);
      });
    const sour = (surplus: number): SimulationState =>
      hostilePh(
        createTestState({
          plants: [{ id: 'p1', species: 'java_fern', size: 50, condition: 100, surplus }],
          light: 0,
          water: 100,
        })
      );

    it('pays out at most its healing share of the bank however hard the damage, and the rest reaches condition', () => {
      const vitality = readPlantVitality(sour(20), DEFAULT_CONFIG)[0];
      const share = plantHealingRate(sour(20).plants[0], plantsDefaults);

      expect(vitality.breakdown.damageRate).toBeGreaterThan(share * 20);
      expect(vitality.breakdown.healed).toBeCloseTo(share * 20, 12);
      expect(vitality.surplus).toBeCloseTo(20 - vitality.breakdown.healed, 12);
      expect(vitality.newCondition).toBeLessThan(100);
    });

    it('holds condition a bare plant loses', () => {
      const banked = processPlants(sour(20), DEFAULT_CONFIG).state.plants[0];
      const bare = processPlants(sour(0), DEFAULT_CONFIG).state.plants[0];
      expect(banked.condition).toBeGreaterThan(bare.condition);
    });

    it('self-heals an over-cap bank on the first tick', () => {
      const state = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 50, condition: 100, surplus: 90 }],
        light: 0,
        water: 100,
      });
      const out = processPlants(state, DEFAULT_CONFIG).state.plants[0];
      expect(out.surplus).toBeLessThanOrEqual(plantsDefaults.surplusCap);
      expect(out.surplus).toBeGreaterThan(plantsDefaults.surplusCap * (1 - plantsDefaults.growthDrawRate));
    });
  });
});

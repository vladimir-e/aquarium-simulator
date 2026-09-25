import { describe, it, expect } from 'vitest';
import { processPlants, readPlantVitality } from './index.js';
import { createSimulation, type SimulationState, type Plant, type Resources } from '../state.js';
import type { PlantSpecies } from './species.js';
import { produce } from 'immer';
import { DEFAULT_CONFIG } from '../config/index.js';
import { plantsDefaults } from '../config/plants.js';
import { nutrientsDefaults } from '../config/nutrients.js';
import { establishmentSurplus } from './create-plant.js';
import { PLANT_SPECIES_DATA } from './species.js';

describe('processPlants', () => {
  const C = 100;
  const BANK = establishmentSurplus(plantsDefaults);

  const NIGHTLY_UPKEEP =
    plantsDefaults.upkeepCost * (1 - PLANT_SPECIES_DATA.java_fern.hardiness);

  function createTestState({
    plants,
    ...resources
  }: Partial<
    { plants: Plant[] } & Pick<
      Resources,
      | 'light'
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
      draft.resources.phosphate = nutrientsDefaults.optimalPhosphatePpm * water;
      draft.resources.potassium = nutrientsDefaults.optimalPotassiumPpm * water;
      draft.resources.iron = nutrientsDefaults.optimalIronPpm * water;
      draft.resources.nitrate = nutrientsDefaults.optimalNitratePpm * water;
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
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
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
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      expect(result.state.plants[0].size).toBeGreaterThan(50);
    });

    it('does not grow plants whose condition is sub-100 (surplus-overflow gate)', () => {
      const state = createTestState({
        plants: [
          { id: 'p1', species: 'java_fern', size: 50, condition: 80, surplus: BANK },
        ],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);
      expect(result.state.plants[0].size).toBe(50);
      expect(result.state.plants[0].condition).toBeGreaterThan(80);
    });

    it('only the at-100 plant grows when paired with a sub-100 sibling', () => {
      const state = createTestState({
        plants: [
          { id: 'healthy', species: 'java_fern', size: 50, condition: 100, surplus: BANK },
          { id: 'stressed', species: 'java_fern', size: 50, condition: 70, surplus: BANK },
        ],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);
      const healthy = result.state.plants.find((p) => p.id === 'healthy');
      const stressed = result.state.plants.find((p) => p.id === 'stressed');
      expect(healthy?.size).toBeGreaterThan(50);
      expect(stressed?.size).toBe(50);
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
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
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

  describe('photoperiod gate on surplus banking and growth', () => {
    it('spends the bank rather than banking at night, however good the water', () => {
      const state = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 50, condition: 100, surplus: 5 }],
        light: 0,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        temperature: 25,
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);
      expect(result.state.plants[0].surplus).toBeLessThan(5);
      expect(result.state.plants[0].condition).toBe(100);
    });

    it('does not grow at night even with banked surplus', () => {
      const state = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 50, condition: 100, surplus: 40 }],
        light: 0,
        temperature: 25,
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);
      expect(result.state.plants[0].size).toBe(50);
      expect(result.state.plants[0].surplus).toBeCloseTo(40 - NIGHTLY_UPKEEP, 12);
    });

    it('grows during the day when surplus is available', () => {
      const state = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 50, condition: 100, surplus: 10 }],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        temperature: 25,
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);
      expect(result.state.plants[0].size).toBeGreaterThan(50);
      expect(result.state.plants[0].surplus).toBeGreaterThan(10);
    });

    it('day/night/day cycle: surplus and size advance only during lit periods', () => {
      const state = createTestState({
        plants: [
          {
            id: 'p1',
            species: 'java_fern',
            size: 50,
            condition: 100,
            surplus: BANK,
          },
        ],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        temperature: 25,
        water: 100,
      });
      const runTicks = (
        s: SimulationState,
        ticks: number,
        light: number
      ): SimulationState => {
        let current = produce(s, (draft) => {
          draft.resources.light = light;
        });
        for (let t = 0; t < ticks; t++) {
          const r = processPlants(current, DEFAULT_CONFIG);
          current = r.state;
        }
        return current;
      };
      const afterDay1 = runTicks(state, 5, 50);
      const sizeDay1 = afterDay1.plants[0].size;
      const surplusDay1 = afterDay1.plants[0].surplus;
      expect(sizeDay1).toBeGreaterThan(50);

      const afterNight = runTicks(afterDay1, 5, 0);
      expect(afterNight.plants[0].size).toBe(sizeDay1);
      expect(afterNight.plants[0].surplus).toBeLessThan(surplusDay1);

      const afterDay2 = runTicks(afterNight, 5, 50);
      expect(afterDay2.plants[0].size).toBeGreaterThan(sizeDay1);
    });
  });

  describe('day/night O2 balance', () => {
    const netOxygen = (species: PlantSpecies, light: number): number =>
      processPlants(
        createTestState({
          plants: [{ id: 'p1', species, size: 100, condition: C, surplus: 0 }],
          light,
          co2: plantsDefaults.optimalCo2,
          nitrate: plantsDefaults.optimalNitrate * 100 * 3,
          phosphate: nutrientsDefaults.optimalPhosphatePpm * 100 * 3,
          potassium: nutrientsDefaults.optimalPotassiumPpm * 100 * 3,
          iron: nutrientsDefaults.optimalIronPpm * 100 * 3,
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
          co2: plantsDefaults.optimalCo2,
          nitrate: plantsDefaults.optimalNitrate * water,
          water,
          temperature: 25,
        }),
        DEFAULT_CONFIG
      );
      const sum = (resource: 'oxygen' | 'co2'): number =>
        result.effects.filter((e) => e.resource === resource).reduce((s, e) => s + e.delta, 0);
      return { oxygen: sum('oxygen'), co2: sum('co2') };
    };

    it('moves a lit tank twice as far at half the volume', () => {
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

  describe('waste effect when plants overgrow', () => {
    it('no waste when plants below 200%', () => {
      const state = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 50, condition: C, surplus: 0 }],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      const wasteEffect = result.effects.find((e) => e.resource === 'waste');
      expect(wasteEffect).toBeUndefined();
    });

    it('plant size capped at 200%', () => {
      const state = createTestState({
        plants: [{ id: 'p1', species: 'monte_carlo', size: 199, condition: C, surplus: 0 }],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      expect(result.state.plants[0].size).toBeLessThanOrEqual(200);
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
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
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
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        water: 100,
      });
      const originalSize = state.plants[0].size;

      processPlants(state, DEFAULT_CONFIG);

      expect(state.plants[0].size).toBe(originalSize);
    });
  });

  describe('the reserve buys tissue, not condition', () => {
    it('a plant with reserves keeps its size through a night a bare one melts in', () => {
      const withBank = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 50, condition: 100, surplus: 20 }],
        light: 0,
        water: 100,
      });
      const bare = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 50, condition: 100, surplus: 0 }],
        light: 0,
        water: 100,
      });

      const bankedOut = processPlants(withBank, DEFAULT_CONFIG).state.plants[0];
      const bareOut = processPlants(bare, DEFAULT_CONFIG).state.plants[0];

      expect(bankedOut.size).toBe(50);
      expect(bankedOut.surplus).toBeLessThan(20);
      expect(bareOut.size).toBeLessThan(50);
      expect(bareOut.condition).toBe(100);
    });

    it('buffers damage on the spare, and lets it past once only the reserve is left', () => {
      const hostilePh = (s: SimulationState): SimulationState =>
        produce(s, (draft) => {
          draft.resources.ph = 9.5;
        });
      const sour = (surplus: number): SimulationState =>
        hostilePh(
          createTestState({
            plants: [{ id: 'p1', species: 'java_fern', size: 50, condition: 100, surplus }],
            light: 0,
            water: 100,
          })
        );
      const overnight = (surplus: number): Plant =>
        processPlants(sour(surplus), DEFAULT_CONFIG).state.plants[0];

      const banked = overnight(20);
      expect(banked.condition).toBe(100);
      expect(banked.surplus).toBeLessThan(20);

      const reserve = readPlantVitality(sour(0), DEFAULT_CONFIG)[0].breakdown.reserved;
      const spent = overnight(reserve);
      expect(spent.condition).toBeLessThan(100);
      expect(spent.size).toBe(50);
    });

    it('self-heals an over-cap bank on the first tick', () => {
      const state = createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 50, condition: 100, surplus: 90 }],
        light: 0,
        water: 100,
      });
      const out = processPlants(state, DEFAULT_CONFIG).state.plants[0];
      expect(out.surplus).toBeCloseTo(plantsDefaults.surplusCap - NIGHTLY_UPKEEP, 12);
    });
  });

  describe('the bottom of the upkeep slider', () => {
    const free = { ...DEFAULT_CONFIG, plants: { ...plantsDefaults, upkeepCost: 0 } };

    const lit = (): SimulationState =>
      createTestState({
        plants: [{ id: 'p1', species: 'java_fern', size: 50, condition: 100, surplus: 0 }],
        light: 50,
        co2: plantsDefaults.optimalCo2,
        nitrate: plantsDefaults.optimalNitrate * 100,
        temperature: 25,
        water: 100,
      });

    const grownIn = (config: typeof DEFAULT_CONFIG): Plant => {
      let state = lit();
      for (let hour = 0; hour < 12; hour++) state = processPlants(state, config).state;
      return state.plants[0];
    };

    it('turns a lit day into tissue, and more of it than a charged plant does', () => {
      const owing = grownIn(DEFAULT_CONFIG);
      const owingNothing = grownIn(free);

      expect(owingNothing.size).toBeGreaterThan(50);
      expect(owingNothing.size).toBeGreaterThan(owing.size);
    });
  });
});

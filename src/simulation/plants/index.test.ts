import { describe, it, expect } from 'vitest';
import { processPlants, readPlantLight, plantHealingRate } from './index.js';
import { canopyLight, floorCover, getTotalRateUnits, plantHeight } from './canopy.js';
import { calculatePhotosynthesis } from '../systems/photosynthesis.js';
import { calculateRespiration } from '../systems/respiration.js';
import { calculateNutrientSufficiency, organicNutrients } from '../systems/nutrients.js';
import { tissueMass } from '../systems/plant-lifecycle.js';
import { getPpm } from '../resources/index.js';
import {
  calculateTankHeight,
  createSimulation,
  type SimulationState,
  type Plant,
  type Resources,
} from '../state.js';
import { dailyLightIntegral } from '../equipment/light.js';
import type { PlantSpecies } from './species.js';
import { produce } from 'immer';
import { carbonateKh } from '../core/carbonate.js';
import { getKhMass } from '../resources/helpers.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { plantsDefaults } from '../config/plants.js';
import { NUTRIENTS, nutrientsDefaults } from '../config/nutrients.js';
import { CARE_SHEET_PHOTOPERIOD, PLANT_SPECIES_DATA, dailyLightEdge } from './species.js';
import { plantRecord } from '../tests/plant.js';
import { VIGOUR_SPAN } from './create-plant.js';
import { createRng, type RngState } from '../core/rng.js';

const sizePerBank = (species: PlantSpecies): number =>
  PLANT_SPECIES_DATA[species].growthRate * plantsDefaults.sizePerSurplus;

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
      plantRecord({ id: 'p1', species: 'java_fern', size: 100, condition: C, surplus: 0 }),
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
      expect(delta('nitrate', 'photosynthesis')).toBeUndefined();
      expect(delta('oxygen', 'respiration')).toBeLessThan(0);
      expect(delta('co2', 'respiration')).toBeGreaterThan(0);
      expect(effects.every((e) => e.tier === 'active')).toBe(true);
    });

    it('updates plant sizes due to growth', () => {
      const state = createTestState({
        plants: [plantRecord({ id: 'p1', species: 'java_fern', size: 50, condition: C, surplus: BANK })],
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
        plants: [plantRecord({ id: 'p1', species: 'java_fern', size: 50, condition: 80, surplus: BANK })],
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
      plantRecord({ id: 'p1', species: 'java_fern', size: 100, condition: C, surplus: 0 }),
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
        plants: [plantRecord({ id: 'p1', species: 'java_fern', size: 50, condition: 100, surplus: BANK })],
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
        plants: [plantRecord({ id: 'p1', species: 'monte_carlo', size: 50, condition: 100, surplus: 10 })],
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
          plants: [plantRecord({ id: 'p1', species, size: 100, condition: C, surplus: 0 })],
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
      plantRecord({ id: 'p1', species: 'java_fern', size: 100, condition: C, surplus: 0 }),
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

  describe('tissue drawn from the water', () => {
    const CAP = plantsDefaults.surplusCap;
    const recipe = organicNutrients(DEFAULT_CONFIG.livestock, DEFAULT_CONFIG.nutrients);
    const drawn = (result: ReturnType<typeof processPlants>, n: (typeof NUTRIENTS)[number]): number =>
      -(result.effects.find((e) => e.resource === n && e.source === 'plant-growth')?.delta ?? 0);
    /** Grams of tissue the tick added: every survivor's gain and every offshoot, by species. */
    const tissueAdded = (before: readonly Plant[], after: readonly Plant[]): number =>
      after.reduce((sum, plant) => {
        const start = before.find((p) => p.id === plant.id);
        return sum + tissueMass(plant.species, plant.size - (start?.size ?? 0));
      }, 0);
    /** A night after a good day: nothing earned or lost, so only the bank moves size. */
    const night = (plants: Plant[], water: Partial<Resources> = {}): SimulationState =>
      createTestState({ plants, light: 0, lightByHour: LIT_DAY, water: 100, ...water });
    const growers = (): Plant[] => [
      plantRecord({ id: 'mother', species: 'amazon_sword', size: 90, condition: C, surplus: CAP }),
      plantRecord({ id: 'fern', species: 'java_fern', size: 40, condition: C, surplus: BANK }),
      plantRecord({ id: 'carpet', species: 'monte_carlo', size: 20, condition: C, surplus: BANK }),
    ];

    it('takes exactly the recipe of the tissue it grew, offshoots included', () => {
      for (const water of [{}, { phosphate: 0.01 * nutrientsDefaults.halfSaturation.phosphate * 100 }]) {
        const state = night(growers(), water);
        const result = processPlants(state, DEFAULT_CONFIG);
        const tissue = tissueAdded(state.plants, result.state.plants);

        expect(result.state.plants.length).toBe(4);
        expect(tissue).toBeGreaterThan(0);
        for (const n of NUTRIENTS) expect(drawn(result, n)).toBeCloseTo(tissue * recipe[n], 10);
      }
    });

    it('slows on short water rather than stopping, and the bank pays only for what arrived', () => {
      const grown = (phosphatePpm: number): { size: number; spent: number } => {
        const state = night([plantRecord({ id: 'fern', species: 'java_fern', size: 40, condition: C, surplus: BANK })], {
          phosphate: phosphatePpm * 100,
        });
        const after = processPlants(state, DEFAULT_CONFIG).state.plants[0];
        return { size: after.size - 40, spent: BANK - after.surplus };
      };
      const rich = grown(1);
      const lean = grown(0.001);

      expect(lean.size).toBeGreaterThan(0);
      expect(lean.size).toBeLessThan(rich.size / 2);
      for (const { size, spent } of [rich, lean]) {
        expect(size).toBeCloseTo(spent * sizePerBank('java_fern'), 12);
      }
    });

    it('never draws a pool below zero, however many plants buy tissue on it at once', () => {
      const crowd = Array.from({ length: 200 }, (_, i) =>
        plantRecord({ id: `mc${i}`, species: 'monte_carlo', size: 50, condition: C, surplus: CAP })
      );
      for (const trace of [1e-9, 1e-3, 1]) {
        const state = night(crowd, { water: 40, phosphate: trace, iron: trace, nitrate: trace, potassium: trace });
        const result = processPlants(state, DEFAULT_CONFIG);
        for (const n of NUTRIENTS) {
          expect(drawn(result, n)).toBeGreaterThanOrEqual(0);
          expect(drawn(result, n)).toBeLessThanOrEqual(state.resources[n]);
        }
      }
    });
  });

  describe('shedding and death', () => {
    it('sheds a plant in poor condition into waste and removes one at condition 0', () => {
      const state = createTestState({
        plants: [
          plantRecord({ id: 'poorly', species: 'java_fern', size: 50, condition: 50, surplus: 0 }),
          plantRecord({ id: 'dead', species: 'java_fern', size: 50, condition: 0, surplus: 0 }),
        ],
        light: 0,
        temperature: 25,
        water: 100,
      });
      const result = processPlants(state, DEFAULT_CONFIG);

      expect(result.state.plants.map((p) => p.id)).toEqual(['poorly']);
      expect(result.state.plants[0].size).toBeLessThan(50);
      const waste = result.effects.filter((e) => e.resource === 'waste');
      expect(waste.map((e) => e.source)).toEqual(['plant-shedding', 'plant-death']);
      expect(waste.every((e) => e.delta > 0)).toBe(true);
      expect(result.shedding).toBe(waste[0].delta);
      expect(result.state.logs.filter((l) => l.event === 'plant-died')).toHaveLength(1);
    });

    it('keeps a plant of any size exactly while its condition stays above 0', () => {
      const plants = [1e-6, 0.5, 50].flatMap((size) =>
        [0.1, 50].map((condition) =>
          plantRecord({ id: `${size}@${condition}`, species: 'monte_carlo', size, condition, surplus: 0 })
        )
      );
      const state = createTestState({ plants, light: 0, lightByHour: new Array(24).fill(0), temperature: 25, water: 100 });
      const result = processPlants(state, DEFAULT_CONFIG);
      const living = plants.filter((_, i) => result.vitalities[i].newCondition > 0).map((p) => p.id);

      expect(living.length).toBeGreaterThan(0);
      expect(living.length).toBeLessThan(plants.length);
      expect(result.state.plants.map((p) => p.id)).toEqual(living);
    });

    it('grows a speck at full condition out of its bank', () => {
      const state = createTestState({
        plants: [plantRecord({ id: 'speck', species: 'monte_carlo', size: 1e-3, condition: 100, surplus: BANK })],
        light: 0,
        lightByHour: LIT_DAY,
        temperature: 25,
        water: 100,
      });

      expect(processPlants(state, DEFAULT_CONFIG).state.plants[0].size).toBeGreaterThan(1e-3);
    });

    it('sheds nothing at full condition, bank or no bank', () => {
      const state = createTestState({
        plants: [plantRecord({ id: 'p1', species: 'java_fern', size: 50, condition: 100, surplus: 0 })],
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
          plantRecord({ id: 'p1', species: 'java_fern', size: 50, condition: C, surplus: BANK }),
          plantRecord({ id: 'p2', species: 'anubias', size: 60, condition: C, surplus: BANK }),
          plantRecord({ id: 'p3', species: 'amazon_sword', size: 70, condition: C, surplus: BANK }),
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
        plants: [plantRecord({ id: 'p1', species: 'java_fern', size: 50, condition: C, surplus: 0 })],
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

  describe('light at each plant\'s height', () => {
    const planting: Plant[] = [
      plantRecord({ id: 'sword', species: 'amazon_sword', size: 90, condition: C, surplus: 0 }),
      plantRecord({ id: 'fern', species: 'java_fern', size: 40, condition: C, surplus: 0 }),
      plantRecord({ id: 'carpet', species: 'monte_carlo', size: 60, condition: C, surplus: 0 }),
    ];

    it('reads PAR and the day at the mean leaf, and PAR at the crown top, off one canopy', () => {
      const state = createTestState({ plants: planting, light: 70, lightByHour: LIT_DAY });
      const canopy = canopyLight(planting, state.tank.capacity, DEFAULT_CONFIG.optics);
      const substrateDay = dailyLightIntegral(LIT_DAY);

      const light = readPlantLight(state, DEFAULT_CONFIG);
      light.forEach((reading, i) => {
        expect(reading.par).toBeCloseTo(70 * canopy[i].leaf, 12);
        expect(reading.crownPar).toBeCloseTo(70 * canopy[i].top, 12);
        expect(reading.dailyLight).toBeCloseTo(substrateDay * canopy[i].leaf, 12);
        expect(reading.needShare).toBeCloseTo(reading.dailyLight / dailyLightEdge(planting[i].species), 12);
        expect(reading.needShare).toBeCloseTo(substrateDay / reading.substrateEdge, 12);
        expect(reading.heightCm).toBe(plantHeight(planting[i], calculateTankHeight(state.tank.capacity)));
      });
      expect(processPlants(state, DEFAULT_CONFIG).light).toEqual(light);
    });

    it('photosynthesises each plant on the PAR at its mean leaf, and respires the planting on its rate units', () => {
      const state = createTestState({ plants: planting, light: 70, co2: INJECTED_CO2 });
      const { resources } = state;
      const { plants: plantsConfig, nutrients } = DEFAULT_CONFIG;
      const { effects } = processPlants(state, DEFAULT_CONFIG);
      const delta = (resource: string, source: string): number =>
        effects.find((e) => e.resource === resource && e.source === source)?.delta ?? 0;

      const photosynthesis = calculatePhotosynthesis(
        planting,
        canopyLight(planting, state.tank.capacity, DEFAULT_CONFIG.optics).map((c) => resources.light * c.leaf),
        resources.co2,
        resources.water,
        planting.map((p) => calculateNutrientSufficiency(resources, resources.water, p.species, nutrients)),
        plantsConfig
      );
      expect(delta('oxygen', 'photosynthesis')).toBeCloseTo(getPpm(photosynthesis.oxygenProducedMg, resources.water), 12);
      expect(delta('co2', 'photosynthesis')).toBeCloseTo(-getPpm(photosynthesis.co2ConsumedMg, resources.water), 12);
      for (const n of NUTRIENTS) expect(delta(n, 'photosynthesis')).toBe(0);

      const respiration = calculateRespiration(
        getTotalRateUnits(planting),
        resources.temperature,
        resources.oxygen,
        plantsConfig
      );
      expect(delta('oxygen', 'respiration')).toBeCloseTo(-getPpm(respiration.oxygenConsumedMg, resources.water), 12);
      expect(delta('co2', 'respiration')).toBeCloseTo(getPpm(respiration.co2ProducedMg, resources.water), 12);
    });

    it('burns a lone plant on its crown top only: never while the water over a full one keeps it under its edge', () => {
      const edge = PLANT_SPECIES_DATA.java_fern.tolerableLight[1];
      const fullTop = (capacity: number): number =>
        Math.exp(
          DEFAULT_CONFIG.optics.waterAttenuationPerCm *
            plantHeight({ species: 'java_fern', size: 100 }, calculateTankHeight(capacity))
        );
      const burn = (size: number, light: number): number => {
        const state = createTestState({
          plants: [plantRecord({ id: 'fern', species: 'java_fern', size, condition: C, surplus: 0 })],
          light,
        });
        return (
          processPlants(state, DEFAULT_CONFIG).vitalities[0].breakdown.stressors.find((s) => s.key === 'light')
            ?.amount ?? 0
        );
      };
      const atEdge = edge / fullTop(100);

      for (const size of [1, 10, 50, 100]) expect(burn(size, atEdge)).toBe(0);
      expect(burn(100, atEdge * 1.1)).toBeGreaterThan(0);
    });

    it('runs a size-0 unit, a dark tank and leaves that shade nothing without a NaN', () => {
      const seedlings: Plant[] = [
        ...planting,
        plantRecord({ id: 'stub', species: 'amazon_sword', size: 0, condition: 50, surplus: 5 }),
      ];
      const clear = { ...DEFAULT_CONFIG, optics: { ...DEFAULT_CONFIG.optics, leafAttenuationPerLai: 0 } };
      for (const config of [DEFAULT_CONFIG, clear]) {
        for (const light of [0, 70]) {
          const state = createTestState({ plants: seedlings, light, lightByHour: light > 0 ? LIT_DAY : new Array(24).fill(0) });
          const result = processPlants(state, config);
          for (const effect of result.effects) expect(Number.isFinite(effect.delta)).toBe(true);
          for (const plant of result.state.plants) {
            expect(Number.isFinite(plant.size)).toBe(true);
            expect(Number.isFinite(plant.condition)).toBe(true);
            expect(Number.isFinite(plant.surplus)).toBe(true);
          }
        }
      }
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
          plants: [plantRecord({ id: 'p1', species: 'java_fern', size: 50, condition: 100, surplus })],
          light: 0,
          water: 100,
        })
      );

    it('pays out at most its healing share of the bank however hard the damage, and the rest reaches condition', () => {
      const vitality = processPlants(sour(20), DEFAULT_CONFIG).vitalities[0];
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

    it('holds an over-cap bank to the cap before it buys anything', () => {
      const state = createTestState({
        plants: [plantRecord({ id: 'p1', species: 'java_fern', size: 50, condition: 100, surplus: 90 })],
        light: 0,
        lightByHour: LIT_DAY,
        water: 100,
      });
      const [parent, offshoot] = processPlants(state, DEFAULT_CONFIG).state.plants;
      expect(offshoot.size).toBeCloseTo(
        (plantsDefaults.surplusCap - parent.surplus) * sizePerBank('java_fern'),
        12
      );
      expect(parent.surplus).toBeLessThan(plantsDefaults.surplusCap / 10);
    });
  });

  describe('offshoots', () => {
    const CAP = plantsDefaults.surplusCap;

    /** A night after a good day: nothing earned, nothing lost, so the bank stands as given. */
    const night = (plants: Plant[], rng?: RngState): SimulationState =>
      produce(createTestState({ plants, light: 0, lightByHour: LIT_DAY, water: 100 }), (draft) => {
        if (rng) draft.rng = rng;
      });

    const mother = (surplus: number, fields: Partial<Plant> = {}): Plant =>
      plantRecord({ id: 'mother', species: 'amazon_sword', size: 90, condition: C, surplus, ...fields });

    it('fires iff the bank is at the cap, and before growth can draw it under', () => {
      const full = processPlants(night([mother(CAP)]), DEFAULT_CONFIG).state.plants;
      expect(full).toHaveLength(2);
      expect(full[0].size).toBe(90);

      const short = processPlants(night([mother(CAP - 1e-6)]), DEFAULT_CONFIG).state.plants;
      expect(short).toHaveLength(1);
      expect(short[0].size).toBeGreaterThan(90);
    });

    it('appends a full child on an empty bank to the family, at age 0, aging every survivor a tick', () => {
      const state = night([
        plantRecord({ id: 'aunt', species: 'java_fern', size: 60, condition: C, surplus: 0, age: 40 }),
        mother(CAP, { parentId: 'founder', familyId: 'founder', age: 500, vigour: 0.1 }),
      ]);
      const [aunt, parent, child] = processPlants(state, DEFAULT_CONFIG).state.plants;

      expect(aunt.age).toBe(41);
      expect(parent.age).toBe(501);
      expect(child).toMatchObject({
        species: 'amazon_sword',
        condition: 100,
        surplus: 0,
        age: 0,
        parentId: 'mother',
        familyId: 'founder',
      });
      expect(child.id).not.toBe('mother');
      expect(Math.abs(child.vigour)).toBeLessThanOrEqual(VIGOUR_SPAN);
    });

    it('acts from the next tick: born at the size the bank paid for, then living', () => {
      const born = processPlants(night([mother(CAP)]), DEFAULT_CONFIG).state;
      const [parent, child] = born.plants;
      const next = processPlants(born, DEFAULT_CONFIG).state.plants.find((p) => p.id === child.id)!;
      expect(child.size).toBeCloseTo((CAP - parent.surplus) * sizePerBank('amazon_sword'), 12);
      expect(child.size).toBeGreaterThan(0.9 * CAP * sizePerBank('amazon_sword'));
      expect(next.age).toBe(1);
    });

    it("logs the growth form's verb", () => {
      const logs = processPlants(
        night([
          mother(CAP),
          plantRecord({ id: 'carpet', species: 'monte_carlo', size: 90, condition: C, surplus: CAP }),
          plantRecord({ id: 'fern', species: 'java_fern', size: 90, condition: C, surplus: CAP }),
        ]),
        DEFAULT_CONFIG
      ).state.logs.filter((log) => log.event === 'plant-propagated');
      expect(logs.map((log) => log.message)).toEqual([
        'Amazon Sword threw a plantlet',
        'Monte Carlo sent a runner',
        'Java Fern branched at the rhizome',
      ]);
    });

    it('buys offshoots whatever the floor', () => {
      const crammed = Array.from({ length: 12 }, (_, i) => mother(CAP, { id: `m${i}`, familyId: `m${i}` }));
      const state = night(crammed);
      expect(floorCover(state.plants, state.tank.capacity)).toBeGreaterThan(1);
      expect(processPlants(state, DEFAULT_CONFIG).state.plants).toHaveLength(24);
    });

    it('draws ids and vigours in plant order, so one seed gives one lineage', () => {
      const mothers = ['a', 'b', 'c'].map((id) => mother(CAP, { id, familyId: id }));
      const born = (rngSeed: number): Plant[] =>
        processPlants(night(mothers, createRng(rngSeed)), DEFAULT_CONFIG).state.plants.slice(3);
      const lineage = (plants: Plant[]): unknown[] => plants.map(({ id, parentId, familyId, vigour }) => ({ id, parentId, familyId, vigour }));

      expect(born(11).map((p) => p.parentId)).toEqual(['a', 'b', 'c']);
      expect(lineage(born(11))).toEqual(lineage(born(11)));
      expect(born(11).map((p) => p.vigour)).not.toEqual(born(12).map((p) => p.vigour));
    });

    it('keeps every field finite through a propagating month', () => {
      let state = createTestState({
        plants: [mother(CAP), plantRecord({ id: 'mc', species: 'monte_carlo', size: 95, condition: C, surplus: CAP })],
        light: 80,
        lightByHour: LIT_DAY,
        co2: INJECTED_CO2,
        water: 100,
      });
      for (let hour = 0; hour < 30 * 24; hour++) state = processPlants(state, DEFAULT_CONFIG).state;
      expect(state.plants.length).toBeGreaterThan(2);
      for (const plant of state.plants) {
        for (const value of [plant.size, plant.condition, plant.surplus, plant.age, plant.vigour]) {
          expect(Number.isFinite(value)).toBe(true);
        }
      }
    });
  });
});

import { describe, it, expect } from 'vitest';
import { processFlora } from './index.js';
import { readPlantLight } from '../plants/index.js';
import { canopyLight, floorCover, plantHeight } from '../plants/canopy.js';
import { calculatePhotosynthesis, plantFixer } from '../systems/photosynthesis.js';
import { calculateRespiration } from '../systems/respiration.js';
import { calculateNutrientSufficiency, nutrientsIn, organicNutrients, tankPools } from '../systems/nutrients.js';
import { tissueMass } from '../systems/plant-lifecycle.js';
import { getPpm } from '../resources/index.js';
import {
  calculateTankHeight,
  createSimulation,
  type AlgaeState,
  type SimulationState,
  type Plant,
  type Resources,
} from '../state.js';
import { ALGAE, ALGAE_KINDS, bloomTissue, habitatGain, habitatSize, type AlgaeKind } from '../algae/index.js';
import { dailyLightIntegral } from '../equipment/light.js';
import { produce } from 'immer';
import { carbonateKh } from '../core/carbonate.js';
import { CACO3_PER_EQUIVALENT, MW_NH3, MW_NO3 } from '../core/chemistry.js';
import { getKhMass } from '../resources/helpers.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { plantsDefaults } from '../config/plants.js';
import { NUTRIENTS, nutrientsDefaults, ZERO_FORMS } from '../config/nutrients.js';
import { PLANT_SPECIES_DATA, growthFormOf, plantTraits, type PlantSpecies } from '../plants/species.js';
import { CARE_SHEET_PHOTOPERIOD, dailyLightEdge, floraHealingRate } from '../systems/flora.js';
import { getSubstrateNutrients } from '../equipment/substrate.js';
import { plantRecord } from '../tests/plant.js';
import { nonFinitePaths } from '../tests/leaves.js';
import { coverage } from '../core/logging.js';
import { VIGOUR_SPAN } from '../plants/create-plant.js';
import { createRng, type RngState } from '../core/rng.js';
import type { Effect } from '../core/effects.js';

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

const LITRES = 100;

type TankFields = { plants: Plant[]; algae: Partial<Record<AlgaeKind, Partial<AlgaeState>>> } & Pick<
  Resources,
  'light' | 'lightByHour' | 'co2' | 'nitrate' | 'phosphate' | 'potassium' | 'iron' | 'oxygen' | 'temperature' | 'water' | 'waste'
>;

/** A tank on rich water with this planting and these blooms — none of either unless it says so. */
function tank({ plants = [], algae = {}, ...resources }: Partial<TankFields> = {}): SimulationState {
  return produce(createSimulation({ tankCapacity: LITRES }), (draft) => {
    const water = resources.water ?? draft.resources.water;
    for (const n of NUTRIENTS) {
      draft.resources[n] = nutrientsDefaults.halfSaturation[n] * RICH * water;
    }
    draft.resources.nitrate = RICH_NITRATE_PPM * water;
    Object.assign(draft.resources, resources);
    for (const kind of ALGAE_KINDS) Object.assign(draft.algae[kind], algae[kind]);
    draft.plants = plants;
  });
}

/** Grams of tissue every kind of bloom holds. */
const bloomsTissue = (state: SimulationState): number =>
  ALGAE_KINDS.reduce(
    (sum, kind) => sum + bloomTissue(state.algae[kind].mass, habitatSize(ALGAE[kind].habitat, state), ALGAE[kind]),
    0
  );

const total = (effects: readonly Effect[], resource: string, source?: string): number =>
  effects
    .filter((e) => e.resource === resource && (source === undefined || e.source === source))
    .reduce((sum, e) => sum + e.delta, 0);

describe('processFlora — plants', () => {
  const C = 100;
  const BANK = plantsDefaults.surplusCap / 2;

  describe('with no plants', () => {
    it('lands only the hour’s spores in a tank with no bloom either, drawing just their tissue', () => {
      const result = processFlora(tank({ plants: [] }), DEFAULT_CONFIG);

      expect(result.state.plants).toEqual([]);
      for (const kind of ALGAE_KINDS) {
        expect(result.state.algae[kind].mass).toBeGreaterThan(0);
        expect(result.state.algae[kind].mass).toBeLessThanOrEqual(ALGAE[kind].sporeRate);
        expect(result.state.algae[kind].condition).toBe(100);
      }
      expect(result.effects.every((e) => e.source === 'growth')).toBe(true);
    });
  });

  describe('with plants and lights on (photosynthesis + respiration)', () => {
    const defaultPlants: Plant[] = [
      plantRecord({ id: 'p1', species: 'java_fern', size: 100, condition: C, surplus: 0 }),
    ];

    it('photosynthesises and respires as active effects', () => {
      const state = tank({
        plants: defaultPlants,
        light: 50,
        co2: INJECTED_CO2,
        nitrate: RICH_NITRATE_PPM * 100,
        water: 100,
      });
      const { effects } = processFlora(state, DEFAULT_CONFIG);

      expect(total(effects, 'oxygen', 'photosynthesis')).toBeGreaterThan(0);
      expect(total(effects, 'co2', 'photosynthesis')).toBeLessThan(0);
      expect(total(effects, 'nitrate', 'photosynthesis')).toBe(0);
      expect(total(effects, 'oxygen', 'respiration')).toBeLessThan(0);
      expect(total(effects, 'co2', 'respiration')).toBeGreaterThan(0);
      expect(effects.every((e) => e.tier === 'active')).toBe(true);
    });

    it('updates plant sizes due to growth', () => {
      const state = tank({
        plants: [plantRecord({ id: 'p1', species: 'java_fern', size: 50, condition: C, surplus: BANK })],
        light: 50,
        co2: INJECTED_CO2,
        nitrate: RICH_NITRATE_PPM * 100,
        water: 100,
      });
      const result = processFlora(state, DEFAULT_CONFIG);

      expect(result.state.plants[0].size).toBeGreaterThan(50);
    });

    it('heals a sub-100 plant on its income, banking none of it, while its bank still buys size', () => {
      const state = tank({
        plants: [plantRecord({ id: 'p1', species: 'java_fern', size: 50, condition: 80, surplus: BANK })],
        light: 50,
        co2: INJECTED_CO2,
        nitrate: RICH_NITRATE_PPM * 100,
        water: 100,
      });
      const after = processFlora(state, DEFAULT_CONFIG).state.plants[0];
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
      const state = tank({
        plants: defaultPlants,
        light: 0,
        co2: INJECTED_CO2,
        nitrate: RICH_NITRATE_PPM * 100,
        water: 100,
      });
      const result = processFlora(state, DEFAULT_CONFIG);

      const photoEffects = result.effects.filter((e) => e.source === 'photosynthesis');
      expect(photoEffects).toHaveLength(0);
    });

    it('respiration still occurs when lights off', () => {
      const state = tank({
        plants: defaultPlants,
        light: 0,
        temperature: 25,
      });
      const result = processFlora(state, DEFAULT_CONFIG);

      const respEffects = result.effects.filter((e) => e.source === 'respiration');
      expect(respEffects.length).toBeGreaterThan(0);
    });
  });

  describe('round the clock', () => {
    it('banks while lit and grows off the bank day and night', () => {
      const state = tank({
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
        for (let t = 0; t < ticks; t++) current = processFlora(current, DEFAULT_CONFIG).state;
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
      const state = tank({
        plants: [plantRecord({ id: 'p1', species: 'monte_carlo', size: 50, condition: 100, surplus: 10 })],
        light: 0,
        lightByHour: LIT_DAY,
        water: 100,
      });
      const after = processFlora(state, DEFAULT_CONFIG).state.plants[0];
      const grew = (after.size - 50) / (PLANT_SPECIES_DATA.monte_carlo.growthRate * plantsDefaults.sizePerSurplus);
      expect(after.condition).toBe(100);
      expect(10 - after.surplus).toBeCloseTo(grew, 12);
    });
  });

  describe('day/night O2 balance', () => {
    const netOxygen = (species: PlantSpecies, light: number): number =>
      processFlora(
        tank({
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
      const result = processFlora(
        tank({
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
      const drained = processFlora(
        tank({ plants: planting, light: 50, co2: 0, water: 0 }),
        DEFAULT_CONFIG
      );

      for (const effect of drained.effects) {
        expect(Number.isFinite(effect.delta)).toBe(true);
      }
      expect(drained.effects.filter((e) => e.resource === 'oxygen')).toHaveLength(0);
      expect(drained.effects.filter((e) => e.resource === 'co2')).toHaveLength(0);
    });
  });

  describe('tissue drawn from the water and the bed', () => {
    const CAP = plantsDefaults.surplusCap;
    const recipe = organicNutrients(DEFAULT_CONFIG.livestock, DEFAULT_CONFIG.nutrients);
    const fromWater = (result: ReturnType<typeof processFlora>, n: (typeof NUTRIENTS)[number]): number =>
      -total(result.effects, n, 'growth');
    const fromBed = (
      state: SimulationState,
      result: ReturnType<typeof processFlora>,
      n: (typeof NUTRIENTS)[number]
    ): number => state.equipment.substrate.nutrients[n] - result.state.equipment.substrate.nutrients[n];
    /** Grams of tissue the tick added: every survivor's gain and every offshoot, by species, and the spores that landed. */
    const tissueAdded = (before: SimulationState, after: SimulationState): number =>
      after.plants.reduce((sum, plant) => {
        const start = before.plants.find((p) => p.id === plant.id);
        return sum + tissueMass(plant.species, plant.size - (start?.size ?? 0));
      }, bloomsTissue(after) - bloomsTissue(before));
    /** A night after a good day over a charged bed: nothing earned or lost, so only the bank moves size. */
    const night = (plants: Plant[], water: Partial<Resources> = {}): SimulationState =>
      produce(tank({ plants, light: 0, lightByHour: LIT_DAY, water: 100, ...water }), (draft) => {
        draft.equipment.substrate.nutrients = getSubstrateNutrients('aqua_soil', draft.tank.capacity);
      });
    const growers = (): Plant[] => [
      plantRecord({ id: 'mother', species: 'amazon_sword', size: 90, condition: C, surplus: CAP }),
      plantRecord({ id: 'fern', species: 'java_fern', size: 40, condition: C, surplus: BANK }),
      plantRecord({ id: 'carpet', species: 'monte_carlo', size: 20, condition: C, surplus: BANK }),
    ];

    it('takes exactly the recipe of the tissue it grew across both pools, offshoots and spores included', () => {
      for (const water of [{}, { phosphate: 0.01 * nutrientsDefaults.halfSaturation.phosphate * 100 }]) {
        const state = night(growers(), water);
        const result = processFlora(state, DEFAULT_CONFIG);
        const tissue = tissueAdded(state, result.state);

        expect(result.state.plants.length).toBe(4);
        expect(tissue).toBeGreaterThan(0);
        for (const n of NUTRIENTS) {
          expect(fromBed(state, result, n)).toBeGreaterThan(0);
          expect(fromWater(result, n) + fromBed(state, result, n)).toBeCloseTo(tissue * recipe[n], 10);
        }
      }
    });

    it('takes ammonia from the water beside nitrate for the same nitrogen, and says who took it', () => {
      const state = night(growers(), { ammonia: 0.5 * 100 });
      const result = processFlora(state, DEFAULT_CONFIG);
      const ammonia = -total(result.effects, 'ammonia', 'growth');
      const nitrogen = nutrientsIn({ ...ZERO_FORMS, ammonia, nitrate: fromWater(result, 'nitrate') }).nitrate;

      expect(ammonia).toBeGreaterThan(0);
      expect(ammonia).toBeCloseTo(
        ALGAE_KINDS.reduce((sum, kind) => sum + result.algae[kind].waterUptake.ammonia, result.waterUptake.ammonia),
        12
      );
      expect(nitrogen + fromBed(state, result, 'nitrate')).toBeCloseTo(tissueAdded(state, result.state) * recipe.nitrate, 10);
    });

    it('spends KH on the ammonia its tissue takes and returns it on the nitrate, from either pool', () => {
      const state = night(growers(), { ammonia: 0.5 * 100 });
      const result = processFlora(state, DEFAULT_CONFIG);
      const ammonia = -total(result.effects, 'ammonia', 'growth');
      const nitrate = fromWater(result, 'nitrate') + fromBed(state, result, 'nitrate');

      expect(ammonia).toBeGreaterThan(0);
      expect(fromBed(state, result, 'nitrate')).toBeGreaterThan(0);
      expect(total(result.effects, 'kh', 'growth')).toBeCloseTo(
        (nitrate / MW_NO3 - ammonia / MW_NH3) * CACO3_PER_EQUIVALENT,
        10
      );
    });

    it('draws a fern from the water alone, and a sword and a carpet from the bed at their root shares', () => {
      const rich = { phosphate: 1000 * nutrientsDefaults.halfSaturation.phosphate * 100 };
      const bedShare = (plant: Plant): number => {
        const state = night([plant], rich);
        const result = processFlora(state, DEFAULT_CONFIG);
        const bed = fromBed(state, result, 'phosphate');
        const spores = (bloomsTissue(result.state) - bloomsTissue(state)) * recipe.phosphate;
        return bed / (bed + fromWater(result, 'phosphate') - spores);
      };
      const [sword, fern, carpet] = growers();
      expect(bedShare(fern)).toBe(0);
      for (const plant of [sword, carpet]) {
        expect(bedShare(plant)).toBeCloseTo(growthFormOf(plant.species).rootShare, 2);
      }
    });

    it('slows on short water rather than stopping, and the bank pays only for what arrived', () => {
      const grown = (phosphatePpm: number): { size: number; spent: number } => {
        const state = night([plantRecord({ id: 'fern', species: 'java_fern', size: 40, condition: C, surplus: BANK })], {
          phosphate: phosphatePpm * 100,
        });
        const after = processFlora(state, DEFAULT_CONFIG).state.plants[0];
        return { size: after.size - 40, spent: BANK - after.surplus };
      };
      const rich = grown(1);
      const lean = grown(0.001);

      expect(lean.size).toBeGreaterThan(0);
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
        const result = processFlora(state, DEFAULT_CONFIG);
        for (const n of NUTRIENTS) {
          expect(fromWater(result, n)).toBeGreaterThanOrEqual(0);
          expect(fromWater(result, n)).toBeLessThanOrEqual(state.resources[n]);
        }
      }
    });
  });

  describe('shedding and death', () => {
    it('sheds a plant in poor condition into waste and removes one at condition 0', () => {
      const state = tank({
        plants: [
          plantRecord({ id: 'poorly', species: 'java_fern', size: 50, condition: 50, surplus: 0 }),
          plantRecord({ id: 'dead', species: 'java_fern', size: 50, condition: 0, surplus: 0 }),
        ],
        light: 0,
        temperature: 25,
        water: 100,
      });
      const result = processFlora(state, DEFAULT_CONFIG);

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
      const state = tank({ plants, light: 0, lightByHour: new Array(24).fill(0), temperature: 25, water: 100 });
      const result = processFlora(state, DEFAULT_CONFIG);
      const living = plants.filter((_, i) => result.vitalities[i].newCondition > 0).map((p) => p.id);

      expect(living.length).toBeGreaterThan(0);
      expect(living.length).toBeLessThan(plants.length);
      expect(result.state.plants.map((p) => p.id)).toEqual(living);
    });

    it('grows a speck at full condition out of its bank', () => {
      const state = tank({
        plants: [plantRecord({ id: 'speck', species: 'monte_carlo', size: 1e-3, condition: 100, surplus: BANK })],
        light: 0,
        lightByHour: LIT_DAY,
        temperature: 25,
        water: 100,
      });

      expect(processFlora(state, DEFAULT_CONFIG).state.plants[0].size).toBeGreaterThan(1e-3);
    });

    it('sheds nothing at full condition, bank or no bank', () => {
      const state = tank({
        plants: [plantRecord({ id: 'p1', species: 'java_fern', size: 50, condition: 100, surplus: 0 })],
        light: 0,
        lightByHour: LIT_DAY,
        water: 100,
      });
      expect(processFlora(state, DEFAULT_CONFIG).state.plants[0].size).toBe(50);
    });
  });

  describe('multiple plants', () => {
    it('processes multiple plants correctly', () => {
      const state = tank({
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
      const result = processFlora(state, DEFAULT_CONFIG);

      expect(result.state.plants[0].size).toBeGreaterThan(50);
      expect(result.state.plants[1].size).toBeGreaterThan(60);
      expect(result.state.plants[2].size).toBeGreaterThan(70);
    });
  });

  describe('immutability', () => {
    it('does not modify original state', () => {
      const state = tank({
        plants: [plantRecord({ id: 'p1', species: 'java_fern', size: 50, condition: C, surplus: 0 })],
        light: 50,
        co2: INJECTED_CO2,
        nitrate: RICH_NITRATE_PPM * 100,
        water: 100,
      });
      const originalSize = state.plants[0].size;

      processFlora(state, DEFAULT_CONFIG);

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
      const state = tank({ plants: planting, light: 70, lightByHour: LIT_DAY });
      const canopy = canopyLight(planting, state.tank.capacity, DEFAULT_CONFIG.optics);
      const substrateDay = dailyLightIntegral(LIT_DAY);

      const light = readPlantLight(state, DEFAULT_CONFIG);
      light.forEach((reading, i) => {
        expect(reading.par).toBeCloseTo(70 * canopy[i].leaf, 12);
        expect(reading.crownPar).toBeCloseTo(70 * canopy[i].top, 12);
        expect(reading.dailyLight).toBeCloseTo(substrateDay * canopy[i].leaf, 12);
        expect(reading.needShare).toBeCloseTo(reading.dailyLight / dailyLightEdge(plantTraits(planting[i].species)), 12);
        expect(reading.needShare).toBeCloseTo(substrateDay / reading.substrateEdge, 12);
        expect(reading.heightCm).toBe(plantHeight(planting[i], calculateTankHeight(state.tank.capacity)));
      });
      expect(processFlora(state, DEFAULT_CONFIG).light).toEqual(light);
    });

    it('photosynthesises each plant on the PAR at its mean leaf, and respires on the rate units that fix', () => {
      const state = tank({ plants: planting, light: 70, co2: INJECTED_CO2 });
      const { resources } = state;
      const { plants: plantsConfig, nutrients } = DEFAULT_CONFIG;
      const { effects } = processFlora(state, DEFAULT_CONFIG);

      const canopy = canopyLight(planting, state.tank.capacity, DEFAULT_CONFIG.optics);
      const fixers = planting.map((p, i) =>
        plantFixer(
          p,
          resources.light * canopy[i].leaf,
          calculateNutrientSufficiency(tankPools(state), p.species, nutrients),
          plantsConfig
        )
      );
      const photosynthesis = calculatePhotosynthesis(fixers, resources.co2, resources.water, plantsConfig);
      expect(total(effects, 'oxygen', 'photosynthesis')).toBeCloseTo(getPpm(photosynthesis.oxygenProducedMg, resources.water), 12);
      expect(total(effects, 'co2', 'photosynthesis')).toBeCloseTo(-getPpm(photosynthesis.co2ConsumedMg, resources.water), 12);
      for (const n of NUTRIENTS) expect(total(effects, n, 'photosynthesis')).toBe(0);

      const respiration = calculateRespiration(
        fixers.reduce((sum, fixer) => sum + fixer.metabolicRateUnits, 0),
        resources.temperature,
        resources.oxygen,
        plantsConfig
      );
      expect(total(effects, 'oxygen', 'respiration')).toBeCloseTo(-getPpm(respiration.oxygenConsumedMg, resources.water), 12);
      expect(total(effects, 'co2', 'respiration')).toBeCloseTo(getPpm(respiration.co2ProducedMg, resources.water), 12);
    });

    it('burns a lone plant on its crown top only: never while the water over a full one keeps it under its edge', () => {
      const edge = PLANT_SPECIES_DATA.java_fern.tolerableLight[1];
      const fullTop = (capacity: number): number =>
        Math.exp(
          DEFAULT_CONFIG.optics.waterAttenuationPerCm *
            plantHeight({ species: 'java_fern', size: 100 }, calculateTankHeight(capacity))
        );
      const burn = (size: number, light: number): number => {
        const state = tank({
          plants: [plantRecord({ id: 'fern', species: 'java_fern', size, condition: C, surplus: 0 })],
          light,
        });
        return (
          processFlora(state, DEFAULT_CONFIG).vitalities[0].breakdown.stressors.find((s) => s.key === 'light')
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
          const state = tank({ plants: seedlings, light, lightByHour: light > 0 ? LIT_DAY : new Array(24).fill(0) });
          const result = processFlora(state, config);
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
        tank({
          plants: [plantRecord({ id: 'p1', species: 'java_fern', size: 50, condition: 100, surplus })],
          light: 0,
          water: 100,
        })
      );

    it('pays out at most its healing share of the bank however hard the damage, and the rest reaches condition', () => {
      const vitality = processFlora(sour(20), DEFAULT_CONFIG).vitalities[0];
      const share = -Math.expm1(-floraHealingRate(plantTraits('java_fern'), plantsDefaults));

      expect(vitality.breakdown.damageRate).toBeGreaterThan(share * 20);
      expect(vitality.breakdown.healed).toBeCloseTo(share * 20, 12);
      expect(vitality.surplus).toBeCloseTo(20 - vitality.breakdown.healed, 12);
      expect(vitality.newCondition).toBeLessThan(100);
    });

    it('holds condition a bare plant loses', () => {
      const banked = processFlora(sour(20), DEFAULT_CONFIG).state.plants[0];
      const bare = processFlora(sour(0), DEFAULT_CONFIG).state.plants[0];
      expect(banked.condition).toBeGreaterThan(bare.condition);
    });

    it('holds an over-cap bank to the cap before it buys anything', () => {
      const state = tank({
        plants: [plantRecord({ id: 'p1', species: 'java_fern', size: 50, condition: 100, surplus: 90 })],
        light: 0,
        lightByHour: LIT_DAY,
        water: 100,
      });
      const [parent, offshoot] = processFlora(state, DEFAULT_CONFIG).state.plants;
      expect(offshoot.size).toBeCloseTo(
        (plantsDefaults.surplusCap - parent.surplus) * sizePerBank('java_fern'),
        12
      );
    });
  });

  describe('offshoots', () => {
    const CAP = plantsDefaults.surplusCap;

    /** A night after a good day: nothing earned, nothing lost, so the bank stands as given. */
    const night = (plants: Plant[], rng?: RngState): SimulationState =>
      produce(tank({ plants, light: 0, lightByHour: LIT_DAY, water: 100 }), (draft) => {
        if (rng) draft.rng = rng;
      });

    const mother = (surplus: number, fields: Partial<Plant> = {}): Plant =>
      plantRecord({ id: 'mother', species: 'amazon_sword', size: 90, condition: C, surplus, ...fields });

    it('fires iff the bank is at the cap, and before growth can draw it under', () => {
      const full = processFlora(night([mother(CAP)]), DEFAULT_CONFIG).state.plants;
      expect(full).toHaveLength(2);
      expect(full[0].size).toBe(90);

      const short = processFlora(night([mother(CAP - 1e-6)]), DEFAULT_CONFIG).state.plants;
      expect(short).toHaveLength(1);
      expect(short[0].size).toBeGreaterThan(90);
    });

    it('appends a full child on an empty bank to the family, at age 0, aging every survivor a tick', () => {
      const state = night([
        plantRecord({ id: 'aunt', species: 'java_fern', size: 60, condition: C, surplus: 0, age: 40 }),
        mother(CAP, { parentId: 'founder', familyId: 'founder', age: 500, vigour: 0.1 }),
      ]);
      const [aunt, parent, child] = processFlora(state, DEFAULT_CONFIG).state.plants;

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
      const born = processFlora(night([mother(CAP)]), DEFAULT_CONFIG).state;
      const [parent, child] = born.plants;
      const next = processFlora(born, DEFAULT_CONFIG).state.plants.find((p) => p.id === child.id)!;
      expect(child.size).toBeCloseTo((CAP - parent.surplus) * sizePerBank('amazon_sword'), 12);
      expect(next.age).toBe(1);
    });

    it("logs the growth form's verb", () => {
      const logs = processFlora(
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
      expect(processFlora(state, DEFAULT_CONFIG).state.plants).toHaveLength(24);
    });

    it('draws ids and vigours in plant order, so one seed gives one lineage', () => {
      const mothers = ['a', 'b', 'c'].map((id) => mother(CAP, { id, familyId: id }));
      const born = (rngSeed: number): Plant[] =>
        processFlora(night(mothers, createRng(rngSeed)), DEFAULT_CONFIG).state.plants.slice(3);
      const lineage = (plants: Plant[]): unknown[] => plants.map(({ id, parentId, familyId, vigour }) => ({ id, parentId, familyId, vigour }));

      expect(born(11).map((p) => p.parentId)).toEqual(['a', 'b', 'c']);
      expect(lineage(born(11))).toEqual(lineage(born(11)));
      expect(born(11).map((p) => p.vigour)).not.toEqual(born(12).map((p) => p.vigour));
    });

    it('keeps every field finite every hour of a month that buds', () => {
      let state = tank({
        plants: [mother(CAP), plantRecord({ id: 'mc', species: 'monte_carlo', size: 95, condition: C, surplus: CAP })],
        light: 80,
        lightByHour: LIT_DAY,
        co2: INJECTED_CO2,
        water: 100,
      });
      for (let hour = 0; hour < 30 * 24; hour++) {
        state = processFlora(state, DEFAULT_CONFIG).state;
        expect(nonFinitePaths(state)).toEqual([]);
      }
      expect(state.logs.some((log) => log.event === 'plant-propagated')).toBe(true);
    });
  });
});

describe.each(ALGAE_KINDS)('processFlora — %s', (kind) => {
  const traits = ALGAE[kind];
  const BLOOM = { mass: 20, condition: 100, surplus: 10 };
  /** The lamps off after a lit day: its bank buys, and nothing starves it. */
  const NIGHT = { light: 0, lightByHour: LIT_DAY };
  const DARK = { light: 0, lightByHour: new Array(24).fill(0) };

  it('photosynthesises by day and respires day and night, alone in the tank', () => {
    const day = processFlora(tank({ algae: { [kind]: BLOOM }, light: 60, lightByHour: LIT_DAY }), DEFAULT_CONFIG).effects;
    const night = processFlora(tank({ algae: { [kind]: BLOOM }, ...NIGHT }), DEFAULT_CONFIG).effects;

    expect(total(day, 'oxygen', 'photosynthesis')).toBeGreaterThan(0);
    expect(total(day, 'co2', 'photosynthesis')).toBeLessThan(0);
    expect(total(night, 'oxygen', 'photosynthesis')).toBe(0);
    expect(total(night, 'oxygen', 'respiration')).toBeLessThan(0);
    expect(total(night, 'oxygen', 'respiration')).toBeCloseTo(total(day, 'oxygen', 'respiration'), 12);
  });

  it('reads the light over its own habitat, and holds its tissue in proportion to that habitat', () => {
    const planted = tank({
      algae: { [kind]: BLOOM },
      plants: [plantRecord({ id: 'sword', species: 'amazon_sword', size: 100, condition: 100, surplus: 0 })],
      light: 60,
      lightByHour: LIT_DAY,
    });
    const { light } = processFlora(planted, DEFAULT_CONFIG).algae[kind];

    expect(light.par).toBeCloseTo(60 * habitatGain(traits.habitat, planted, DEFAULT_CONFIG.optics), 12);
    expect(bloomsTissue(planted)).toBeCloseTo(bloomTissue(BLOOM.mass, habitatSize(traits.habitat, planted), traits), 12);
  });

  it('respires in proportion to its mass', () => {
    const respired = (mass: number): number =>
      total(processFlora(tank({ algae: { [kind]: { ...BLOOM, mass } }, ...NIGHT }), DEFAULT_CONFIG).effects, 'oxygen', 'respiration');
    expect(respired(40)).toBeCloseTo(2 * respired(20), 10);
  });

  it('grows on its bank at night too, drawing its tissue from the water and never the bed', () => {
    const start = produce(tank({ algae: { [kind]: BLOOM }, ...NIGHT }), (draft) => {
      draft.equipment.substrate.nutrients = getSubstrateNutrients('aqua_soil', LITRES);
    });
    const { state, effects } = processFlora(start, DEFAULT_CONFIG);

    expect(state.algae[kind].mass).toBeGreaterThan(start.algae[kind].mass);
    expect(state.algae[kind].surplus).toBeLessThan(start.algae[kind].surplus);
    for (const n of NUTRIENTS) {
      expect(total(effects, n, 'growth')).toBeLessThan(0);
      expect(state.equipment.substrate.nutrients[n]).toBe(start.equipment.substrate.nutrients[n]);
    }
  });

  it('draws exactly the recipe of the tissue it grew', () => {
    const start = tank({ algae: { [kind]: BLOOM }, ...NIGHT });
    const { state, effects } = processFlora(start, DEFAULT_CONFIG);
    const grown = bloomsTissue(state) - bloomsTissue(start);
    const recipe = { nitrate: -total(effects, 'nitrate', 'growth') / grown, phosphate: -total(effects, 'phosphate', 'growth') / grown };

    expect(recipe.phosphate).toBeCloseTo(nutrientsDefaults.foodMineralContent.phosphate, 8);
    expect(recipe.nitrate).toBeGreaterThan(0);
  });

  it('dies back at condition 0 into waste, every gram of it, and logs the coverage it took', () => {
    const starved = tank({ algae: { [kind]: { ...BLOOM, condition: 0.001, surplus: 0 } }, ...DARK });
    const { state, effects, algae } = processFlora(starved, DEFAULT_CONFIG);
    const dieBacks = state.logs.filter((log) => log.event === 'algae-died');

    expect(total(effects, 'waste', 'algae-shedding') + total(effects, 'waste', 'algae-death')).toBeCloseTo(
      bloomsTissue(starved),
      12
    );
    expect(dieBacks.map((log) => log.quantities)).toEqual([[coverage(starved.algae[kind].mass)]]);
    expect(dieBacks[0].message).toContain(traits.name);
    expect(algae[kind].spent).toBe(0);
  });

  it('comes back from a die-back as the spores that landed: healthy, with no bank', () => {
    const bloom = processFlora(tank({ algae: { [kind]: { ...BLOOM, condition: 0.001, surplus: 5 } }, ...DARK }), DEFAULT_CONFIG)
      .state.algae[kind];

    expect(bloom.mass).toBeGreaterThan(0);
    expect(bloom.mass).toBeLessThanOrEqual(traits.sporeRate);
    expect(bloom.condition).toBe(100);
    expect(bloom.surplus).toBe(0);
  });

  it('lands its spores at full condition on an empty bank, diluting its deficit and its bank by one share', () => {
    const start = tank({ algae: { [kind]: { mass: 0.004, condition: 40, surplus: 2 } }, ...NIGHT });
    const { state, algae } = processFlora(start, DEFAULT_CONFIG);
    const hour = algae[kind];
    const kept = (100 - state.algae[kind].condition) / (100 - hour.vitality.newCondition);

    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(1);
    expect(state.algae[kind].surplus).toBeCloseTo((hour.vitality.surplus - hour.spent) * kept, 12);
  });

  it('is harmed by thriving plants, and the more of them the more', () => {
    const harm = (count: number): number => {
      const plants = Array.from({ length: count }, (_, i) =>
        plantRecord({ id: `s${i}`, species: 'amazon_sword', size: 100, condition: 100, surplus: 0 })
      );
      return processFlora(tank({ algae: { [kind]: BLOOM }, plants, light: 60, lightByHour: LIT_DAY }), DEFAULT_CONFIG).algae[
        kind
      ].vitality.breakdown.stressors.find((s) => s.key === 'allelopathy')!.amount;
    };
    expect(harm(0)).toBe(0);
    expect(harm(2)).toBeCloseTo(2 * harm(1), 12);
  });

  it('shares one pool with the plants: a bloom beside them leaves each plant a smaller share of lean water', () => {
    const lean = (bloom: Partial<AlgaeState>): SimulationState =>
      produce(
        tank({ algae: { [kind]: bloom }, plants: [plantRecord({ id: 'fern', species: 'java_fern', size: 50, condition: 100, surplus: 20 })], ...NIGHT }),
        (draft) => {
          for (const n of NUTRIENTS) draft.resources[n] = 0.05 * nutrientsDefaults.halfSaturation[n] * draft.resources.water;
        }
      );
    const grown = (state: SimulationState): number => processFlora(state, DEFAULT_CONFIG).state.plants[0].size - state.plants[0].size;

    expect(grown(lean({ mass: 80, surplus: 40 }))).toBeLessThan(grown(lean({ mass: 0, surplus: 0 })));
  });
});

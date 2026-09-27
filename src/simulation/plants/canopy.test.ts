import { describe, it, expect } from 'vitest';
import {
  canopyLight,
  floorCover,
  floorLight,
  floorShade,
  isOvergrown,
  LEAF_AREA_PER_RATE_UNIT,
  leafArea,
  lightAtHeight,
  plantHeight,
  plantLightTaken,
  rateUnits,
  type CanopyLight,
} from './canopy.js';
import { GROWTH_FORMS, growthFormOf, PLANT_SPECIES_DATA, type PlantSpecies } from './species.js';
import { createSimulation, type Blooms, type Plant, type SimulationState } from '../state.js';
import { calculateFloorArea, calculateTankHeight } from '../core/geometry.js';
import { opticsDefaults, type OpticsConfig } from '../config/optics.js';
import { plantsDefaults } from '../config/plants.js';
import { buildPlantBenefits, buildPlantStressors } from '../systems/plant-vitality.js';
import { calculateNutrientSufficiency } from '../systems/nutrients.js';
import { nutrientsDefaults, type Nutrient } from '../config/nutrients.js';
import { scheduledLightByHour } from '../equipment/light.js';
import { emptyBlooms } from '../algae/blooms.js';
import { ALGAE_KINDS } from '../algae/traits.js';
import { lightLoss, waterExtinction } from '../algae/light-loss.js';
import { produce } from 'immer';
import { plantRecord } from '../tests/plant.js';
import { mirroredPools } from '../tests/pools.js';

type Unit = Pick<Plant, 'species' | 'size'>;

const CAPACITY = 150;
const DEPTH = calculateTankHeight(CAPACITY);
const K_W = opticsDefaults.waterAttenuationPerCm;
const SPECIES = Object.keys(PLANT_SPECIES_DATA) as PlantSpecies[];

const unit = (species: PlantSpecies, size = 100): Unit => ({ species, size });
const light = (plants: Unit[], optics: OpticsConfig = opticsDefaults): CanopyLight[] =>
  canopyLight(plants, CAPACITY, optics, emptyBlooms());

const A_FEW_PERCENT = 3;
const MIXED: Unit[] = [
  unit('amazon_sword', 80),
  unit('amazon_sword', 30),
  unit('java_fern', 60),
  unit('anubias', 10),
  unit('monte_carlo', 70),
  unit('dwarf_hairgrass', 0),
];

describe('geometry', () => {
  it('stands a carpet at its full height whatever its size, and grows the others up with it', () => {
    expect(plantHeight(unit('monte_carlo', 5), DEPTH)).toBe(GROWTH_FORMS.carpet.heightCm);
    expect(plantHeight(unit('amazon_sword', 100), DEPTH)).toBe(GROWTH_FORMS.rosette.heightCm);
    expect(plantHeight(unit('amazon_sword', 20), DEPTH)).toBeLessThan(GROWTH_FORMS.rosette.heightCm);
    expect(plantHeight(unit('amazon_sword', 0), DEPTH)).toBe(0);
  });

  it('lays a crown taller than the water along the surface', () => {
    expect(plantHeight(unit('amazon_sword'), 25)).toBe(25);
  });

  it('carries its leaf area over its footprint: a full unit is LAI × F, in 500 cm² rate units', () => {
    for (const species of SPECIES) {
      const { leafAreaIndex, footprintCm2 } = growthFormOf(species);
      expect(rateUnits(unit(species))).toBeCloseTo((leafAreaIndex * footprintCm2) / LEAF_AREA_PER_RATE_UNIT, 12);
      expect(rateUnits(unit(species, 40))).toBeCloseTo(0.4 * rateUnits(unit(species)), 12);
    }
  });
});

describe('canopyLight', () => {
  it('reads a lone full unit at the water gain alone: e^(k_w·z) at its mean leaf, e^(k_w·h) at its top', () => {
    for (const species of SPECIES) {
      const h = plantHeight(unit(species), DEPTH);
      const [lone] = light([unit(species)]);
      expect(lone.leaf).toBeCloseTo(Math.exp((K_W * h) / 2), 12);
      expect(lone.top).toBeCloseTo(Math.exp(K_W * h), 12);
    }
  });

  it('with leaves that shade nothing, is the water alone for every plant, whatever the neighbours', () => {
    const clear = { ...opticsDefaults, leafAttenuationPerLai: 0 };
    light(MIXED, clear).forEach((at, i) => {
      const h = plantHeight(MIXED[i], DEPTH);
      expect(at.leaf).toBeCloseTo(Math.exp((K_W * h) / 2), 12);
      expect(at.top).toBeCloseTo(Math.exp(K_W * h), 12);
    });
  });

  it('lets a lone unit more light at its leaf as its own size falls, down to a few % of a unit', () => {
    for (const species of SPECIES) {
      let previous = 0;
      for (let size = 100; size >= A_FEW_PERCENT; size -= 0.25) {
        const [own] = light([unit(species, size)]);
        expect(own.leaf).toBeGreaterThanOrEqual(previous);
        previous = own.leaf;
      }
    }
  });

  it('is never shaded by a crown no taller than the leaf', () => {
    const sword = unit('amazon_sword', 60);
    const carpets = [unit('monte_carlo'), unit('dwarf_hairgrass', 80)];
    expect(plantHeight(carpets[0], DEPTH)).toBeLessThanOrEqual(plantHeight(sword, DEPTH) / 2);

    expect(light([sword, ...carpets])[0]).toEqual(light([sword])[0]);
  });

  it('never lets anyone more light when a crown is added', () => {
    const before = light(MIXED);
    for (const species of SPECIES) {
      for (const size of [1, 30, 100]) {
        const after = light([...MIXED, unit(species, size)]);
        before.forEach((was, i) => {
          expect(after[i].leaf).toBeLessThanOrEqual(was.leaf);
          expect(after[i].top).toBeLessThanOrEqual(was.top);
        });
      }
    }
  });

  it('takes at most its floor share from any leaf', () => {
    const floor = calculateFloorArea(CAPACITY);
    for (const species of SPECIES) {
      const crown = unit(species);
      const share = growthFormOf(species).footprintCm2 / floor;
      const before = light(MIXED);
      const after = light([...MIXED, crown]);
      before.forEach((was, i) => {
        expect(Math.log(was.leaf / after[i].leaf)).toBeLessThanOrEqual(share + 1e-12);
        expect(Math.log(was.top / after[i].top)).toBeLessThanOrEqual(share + 1e-12);
      });
    }
  });

  it('never reads more at the crown top than the water above it lets through', () => {
    light(MIXED).forEach((at, i) => {
      expect(at.top).toBeLessThanOrEqual(Math.exp(K_W * plantHeight(MIXED[i], DEPTH)) + 1e-12);
    });
  });

  it('stays finite for an empty tank, size-0 units and leaves that shade nothing', () => {
    expect(light([])).toEqual([]);
    const seedlings = SPECIES.map((species) => unit(species, 0));
    for (const optics of [opticsDefaults, { ...opticsDefaults, leafAttenuationPerLai: 0 }]) {
      for (const at of light([...seedlings, ...MIXED], optics)) {
        expect(Number.isFinite(at.leaf)).toBe(true);
        expect(Number.isFinite(at.top)).toBe(true);
      }
    }
  });
});

describe('the regulator', () => {
  const tapWater = createSimulation({ tankCapacity: CAPACITY }).resources;
  const saturating = (nutrient: Exclude<Nutrient, 'nitrate'>): number =>
    nutrientsDefaults.halfSaturation[nutrient] * 1000 * tapWater.water;
  const resources = {
    ...tapWater,
    co2: 25,
    nitrate: 90 * tapWater.water,
    phosphate: saturating('phosphate'),
    potassium: saturating('potassium'),
    iron: saturating('iron'),
  };

  function dailyNet(species: PlantSpecies, size: number, fixturePar: number): number {
    const plant: Plant = plantRecord({ id: 'lone', species, size, condition: 100, surplus: 0 });
    const [canopy] = light([plant]);
    const day = scheduledLightByHour(
      { enabled: true, par: fixturePar, schedule: { startHour: 0, duration: 8 } },
      DEPTH,
      K_W
    );
    return day.reduce((net, par) => {
      const hour = { ...resources, light: par, lightByHour: day };
      const ctx = {
        plant,
        resources: hour,
        waterVolume: resources.water,
        plantsConfig: plantsDefaults,
        nutrientSufficiency: calculateNutrientSufficiency(mirroredPools(resources), species, nutrientsDefaults),
        light: lightAtHeight(plant, canopy, hour, DEPTH),
      };
      const sum = (factors: { amount: number }[]): number => factors.reduce((s, f) => s + f.amount, 0);
      return net + sum(buildPlantBenefits(ctx)) - sum(buildPlantStressors(ctx));
    }, 0);
  }

  it('pays a lone unit in good water less over a day the bigger it grows past a few % of a unit, dim or bright', () => {
    for (const species of SPECIES) {
      for (const fixturePar of [12, 40, 200]) {
        let previous = Infinity;
        for (let size = A_FEW_PERCENT; size <= 100; size += 0.5) {
          const net = dailyNet(species, size, fixturePar);
          expect(net).toBeLessThanOrEqual(previous + 1e-12);
          previous = net;
        }
      }
    }
  });
});

describe('floor cover and shade', () => {
  it('covers the floor by footprint, grown or not, and is overgrown past it', () => {
    const floor = calculateFloorArea(CAPACITY);
    const footprint = MIXED.reduce((sum, p) => sum + growthFormOf(p.species).footprintCm2, 0);
    expect(floorCover(MIXED, CAPACITY)).toBeCloseTo(footprint / floor, 12);
    expect(floorCover(MIXED.map((p) => ({ ...p, size: 1 })), CAPACITY)).toBe(floorCover(MIXED, CAPACITY));

    const tank = (plants: Plant[]): Pick<SimulationState, 'plants' | 'tank'> => ({
      plants,
      tank: { capacity: CAPACITY, hardscapeSlots: 0 },
    });
    const swords = (n: number): Plant[] =>
      Array.from({ length: n }, (_, i) => plantRecord({ id: `s${i}`, species: 'amazon_sword', size: 50, condition: 100, surplus: 0 }));
    const fit = Math.floor(floor / GROWTH_FORMS.rosette.footprintCm2);
    expect(isOvergrown(tank(swords(fit)))).toBe(false);
    expect(isOvergrown(tank(swords(fit + 1)))).toBe(true);
  });

  it('shades nothing bare, shades more as the planting grows, and never the whole floor', () => {
    expect(floorShade([], CAPACITY, opticsDefaults)).toBe(0);
    const young = MIXED.map((p) => ({ ...p, size: p.size / 2 }));
    expect(floorShade(young, CAPACITY, opticsDefaults)).toBeLessThan(floorShade(MIXED, CAPACITY, opticsDefaults));
    const jungle = Array.from({ length: 40 }, () => unit('amazon_sword'));
    expect(floorShade(jungle, CAPACITY, opticsDefaults)).toBeLessThan(1);
    expect(floorShade(MIXED, CAPACITY, { ...opticsDefaults, leafAttenuationPerLai: 0 })).toBe(0);
  });

  it('is the shade the canopy casts on a leaf at the floor', () => {
    const [floorLeaf, ...planting] = [unit('amazon_sword', 0), ...MIXED];
    const [atFloor] = light([floorLeaf, ...planting]);
    const relief = 0.5 * opticsDefaults.leafAttenuationPerLai * growthFormOf(floorLeaf.species).leafAreaIndex;
    expect(atFloor.leaf * Math.exp(-relief)).toBeCloseTo(1 - floorShade(planting, CAPACITY, opticsDefaults), 12);
  });
});

describe('under the blooms', () => {
  const blooms = (greenWater: number, film: number): Blooms =>
    produce(emptyBlooms(), (draft) => {
      draft.greenWater.mass = greenWater;
      draft.film.mass = film;
    });
  const under = (plants: Unit[], algae: Blooms): CanopyLight[] => canopyLight(plants, CAPACITY, opticsDefaults, algae);
  const TWO: Unit[] = [unit('monte_carlo', 80), unit('amazon_sword', 80)];

  it('carries the lamp to each leaf along its path: the path is the leaf’s share of the lamp', () => {
    const algae = blooms(40, 30);
    const k = waterExtinction(algae, opticsDefaults);
    under(MIXED, algae).forEach(({ leaf, path }) => {
      const passed = Object.values(path.blooms).reduce((product, pass) => product * pass, path.water * path.canopy);
      expect(leaf * Math.exp(-k * DEPTH)).toBeCloseTo(passed, 12);
    });
  });

  it('dims every leaf and crown top by the share the film on it passes, wherever it stands', () => {
    const { leafPass } = lightLoss(blooms(0, 60), opticsDefaults);
    const clear = under(MIXED, emptyBlooms());
    under(MIXED, blooms(0, 60)).forEach((coated, i) => {
      expect(coated.leaf).toBeCloseTo(clear[i].leaf * leafPass, 12);
      expect(coated.top).toBeCloseTo(clear[i].top * leafPass, 12);
    });
  });

  it('takes green water’s share from a leaf by the depth above it, so a carpet loses more than a sword', () => {
    const green = blooms(60, 0);
    const k = lightLoss(green, opticsDefaults).blooms.greenWater.extinction;
    const clear = under(TWO, emptyBlooms());
    const [carpet, sword] = under(TWO, green).map((at, i) => (at.leaf * Math.exp(-k * DEPTH)) / clear[i].leaf);

    expect(carpet).toBeCloseTo(Math.exp(-k * (DEPTH - plantHeight(TWO[0], DEPTH) / 2)), 12);
    expect(carpet).toBeLessThan(sword);
  });
});

describe('plantLightTaken', () => {
  const tank = (plants: Plant[], greenWater: number, film: number): Pick<SimulationState, 'plants' | 'tank' | 'algae'> => ({
    plants,
    tank: { capacity: CAPACITY, hardscapeSlots: 0 },
    algae: produce(emptyBlooms(), (draft) => {
      draft.greenWater.mass = greenWater;
      draft.film.mass = film;
    }),
  });
  const plant = (id: string, species: PlantSpecies): Plant => plantRecord({ id, species, size: 80, condition: 100, surplus: 0 });
  const carpet = plant('carpet', 'monte_carlo');
  const sword = plant('sword', 'amazon_sword');

  it('takes nothing with nothing planted', () => {
    expect(plantLightTaken(tank([], 90, 90), opticsDefaults)).toEqual({ greenWater: 0, film: 0 });
  });

  it('takes film’s coat from every planting alike', () => {
    const { coat } = lightLoss(tank([], 0, 50).algae, opticsDefaults).blooms.film;
    for (const plants of [[carpet], [sword], [carpet, sword]]) {
      expect(plantLightTaken(tank(plants, 0, 50), opticsDefaults).film).toBeCloseTo(coat, 12);
    }
  });

  it('is each kind’s take along the canopy’s own path to every leaf, weighted by leaf area', () => {
    const plants = MIXED.map((p, i) => plantRecord({ id: `p${i}`, ...p, condition: 100, surplus: 0 }));
    const state = tank(plants, 40, 30);
    const paths = canopyLight(plants, CAPACITY, opticsDefaults, state.algae).map(({ path }) => path);
    const leaf = plants.reduce((sum, p) => sum + leafArea(p), 0);
    const taken = plantLightTaken(state, opticsDefaults);
    for (const kind of ALGAE_KINDS) {
      const alongPaths = plants.reduce((sum, p, i) => sum + leafArea(p) * (1 - paths[i].blooms[kind]), 0) / leaf;
      expect(taken[kind]).toBeGreaterThan(0);
      expect(taken[kind]).toBeCloseTo(alongPaths, 12);
    }
  });

  it('weighs green water’s take at each leaf by the leaf area there', () => {
    const taken = (plants: Plant[]): number => plantLightTaken(tank(plants, 50, 0), opticsDefaults).greenWater;
    const both = (leafArea(carpet) * taken([carpet]) + leafArea(sword) * taken([sword])) / (leafArea(carpet) + leafArea(sword));
    expect(taken([carpet])).toBeGreaterThan(taken([sword]));
    expect(taken([carpet, sword])).toBeCloseTo(both, 12);
  });
});

describe('floorLight', () => {
  it('is the lamp through the water as it stands, less the canopy’s floor shade', () => {
    const state = produce(createSimulation({ tankCapacity: CAPACITY }), (draft) => {
      draft.plants = MIXED.map((p, i) => plantRecord({ id: `p${i}`, ...p, condition: 100, surplus: 0 }));
      draft.algae.greenWater.mass = 30;
    });
    const k = waterExtinction(state.algae, opticsDefaults);
    expect(floorLight(state, opticsDefaults)).toBeCloseTo(
      state.equipment.light.par * Math.exp(-k * DEPTH) * (1 - floorShade(state.plants, CAPACITY, opticsDefaults)),
      12
    );
    expect(floorLight(produce(state, (draft) => void (draft.equipment.light.enabled = false)), opticsDefaults)).toBe(0);
  });
});

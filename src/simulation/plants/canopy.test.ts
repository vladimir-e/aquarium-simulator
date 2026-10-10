import { describe, it, expect } from 'vitest';
import {
  canopyLight,
  floorCover,
  floorLight,
  floorShade,
  isOvergrown,
  LEAF_AREA_PER_RATE_UNIT,
  leafArea,
  plantHeight,
  plantLightTaken,
  rateUnits,
  sizeOf,
  tissueMass,
  type CanopyLight,
  type Unit,
} from './canopy.js';
import { GROWTH_FORMS, growthFormOf, PLANT_SPECIES_DATA, type PlantSpecies } from './species.js';
import { createSimulation, type Plant, type SimulationState } from '../state.js';
import { calculateFloorArea, calculateTankHeight } from '../core/geometry.js';
import { opticsDefaults, type OpticsConfig } from '../config/optics.js';
import { ALGAE_KINDS } from '../algae/traits.js';
import { lightLoss, waterExtinction } from '../algae/light-loss.js';
import { produce } from 'immer';
import { plantRecord } from '../tests/plant.js';
import { bloomAt } from '../tests/blooms.js';

const CAPACITY = 150;
const DEPTH = calculateTankHeight(CAPACITY);
const K_W = opticsDefaults.waterAttenuationPerCm;
const SPECIES = Object.keys(PLANT_SPECIES_DATA) as PlantSpecies[];

const BARE = createSimulation({ tankCapacity: CAPACITY });

const unit = (species: PlantSpecies, size = 100): Unit => ({ species, size });
const planted = (units: readonly Unit[]): Plant[] =>
  units.map(({ species, size }, i) => plantRecord({ id: `u${i}`, species, size }));
const light = (plants: Unit[], optics: OpticsConfig = opticsDefaults): CanopyLight[] =>
  canopyLight(planted(plants), BARE, optics);

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

  it('weighs a unit’s tissue by its leaf, and reads a plant’s size back off its structure', () => {
    for (const species of SPECIES) {
      expect(tissueMass(species, 40)).toBeCloseTo(0.4 * tissueMass(species, 100), 12);
      expect(sizeOf(plantRecord({ id: 'p', species, size: 37 }))).toBeCloseTo(37, 12);
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

describe('floor cover and shade', () => {
  it('covers the floor by footprint, grown or not, and is overgrown past it', () => {
    const floor = calculateFloorArea(CAPACITY);
    const footprint = MIXED.reduce((sum, p) => sum + growthFormOf(p.species).footprintCm2, 0);
    expect(floorCover(MIXED, CAPACITY)).toBeCloseTo(footprint / floor, 12);

    const tank = (plants: Plant[]): Pick<SimulationState, 'plants' | 'tank'> => ({
      plants,
      tank: { capacity: CAPACITY, hardscapeSlots: 0 },
    });
    const swords = (n: number): Plant[] =>
      Array.from({ length: n }, (_, i) => plantRecord({ id: `s${i}`, species: 'amazon_sword', size: 50 }));
    const fit = Math.floor(floor / GROWTH_FORMS.rosette.footprintCm2);
    expect(isOvergrown(tank(swords(fit)))).toBe(false);
    expect(isOvergrown(tank(swords(fit + 1)))).toBe(true);
  });

  it('shades nothing bare, shades more as the planting grows, and never the whole floor', () => {
    expect(floorShade([], CAPACITY, opticsDefaults)).toBe(0);
    const young = planted(MIXED.map((p) => ({ ...p, size: p.size / 2 })));
    expect(floorShade(young, CAPACITY, opticsDefaults)).toBeLessThan(floorShade(planted(MIXED), CAPACITY, opticsDefaults));
    const jungle = planted(Array.from({ length: 40 }, () => unit('amazon_sword')));
    expect(floorShade(jungle, CAPACITY, opticsDefaults)).toBeLessThan(1);
    expect(floorShade(planted(MIXED), CAPACITY, { ...opticsDefaults, leafAttenuationPerLai: 0 })).toBe(0);
  });

  it('is the shade the canopy casts on a leaf at the floor', () => {
    const [floorLeaf, ...planting] = [unit('amazon_sword', 0), ...MIXED];
    const [atFloor] = light([floorLeaf, ...planting]);
    const relief = 0.5 * opticsDefaults.leafAttenuationPerLai * growthFormOf(floorLeaf.species).leafAreaIndex;
    expect(atFloor.leaf * Math.exp(-relief)).toBeCloseTo(1 - floorShade(planted(planting), CAPACITY, opticsDefaults), 12);
  });
});

describe('under the blooms', () => {
  const blooms = (greenWater: number, film: number): SimulationState =>
    produce(BARE, (draft) => {
      draft.algae.greenWater = bloomAt(draft, 'greenWater', greenWater);
      draft.algae.film = bloomAt(draft, 'film', film);
    });
  const under = (plants: Unit[], tank: SimulationState): CanopyLight[] => canopyLight(planted(plants), tank, opticsDefaults);
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
    const clear = under(MIXED, BARE);
    under(MIXED, blooms(0, 60)).forEach((coated, i) => {
      expect(coated.leaf).toBeCloseTo(clear[i].leaf * leafPass, 12);
      expect(coated.top).toBeCloseTo(clear[i].top * leafPass, 12);
    });
  });

  it('takes green water’s share from a leaf by the depth above it, so a carpet loses more than a sword', () => {
    const green = blooms(60, 0);
    const k = lightLoss(green, opticsDefaults).blooms.greenWater.extinction;
    const clear = under(TWO, BARE);
    const [carpet, sword] = under(TWO, green).map((at, i) => (at.leaf * Math.exp(-k * DEPTH)) / clear[i].leaf);

    expect(carpet).toBeCloseTo(Math.exp(-k * (DEPTH - plantHeight(TWO[0], DEPTH) / 2)), 12);
    expect(carpet).toBeLessThan(sword);
  });
});

describe('plantLightTaken', () => {
  const tank = (plants: Plant[], greenWater: number, film: number): SimulationState =>
    produce(BARE, (draft) => {
      draft.plants = plants;
      draft.algae.greenWater = bloomAt(draft, 'greenWater', greenWater);
      draft.algae.film = bloomAt(draft, 'film', film);
    });
  const plant = (id: string, species: PlantSpecies): Plant => plantRecord({ id, species, size: 80 });
  const leafOf = (p: Plant): number => leafArea({ species: p.species, size: sizeOf(p) });
  const carpet = plant('carpet', 'monte_carlo');
  const sword = plant('sword', 'amazon_sword');

  it('takes nothing with nothing planted', () => {
    expect(plantLightTaken(tank([], 90, 90), opticsDefaults)).toEqual({ greenWater: 0, film: 0 });
  });

  it('takes film’s coat from every planting alike', () => {
    const { coat } = lightLoss(tank([], 0, 50), opticsDefaults).blooms.film;
    for (const plants of [[carpet], [sword], [carpet, sword]]) {
      expect(plantLightTaken(tank(plants, 0, 50), opticsDefaults).film).toBeCloseTo(coat, 12);
    }
  });

  it('is each kind’s take along the canopy’s own path to every leaf, weighted by leaf area', () => {
    const plants = planted(MIXED);
    const state = tank(plants, 40, 30);
    const paths = canopyLight(plants, state, opticsDefaults).map(({ path }) => path);
    const leaf = plants.reduce((sum, p) => sum + leafOf(p), 0);
    const taken = plantLightTaken(state, opticsDefaults);
    for (const kind of ALGAE_KINDS) {
      const alongPaths = plants.reduce((sum, p, i) => sum + leafOf(p) * (1 - paths[i].blooms[kind]), 0) / leaf;
      expect(taken[kind]).toBeGreaterThan(0);
      expect(taken[kind]).toBeCloseTo(alongPaths, 12);
    }
  });

  it('weighs green water’s take at each leaf by the leaf area there', () => {
    const taken = (plants: Plant[]): number => plantLightTaken(tank(plants, 50, 0), opticsDefaults).greenWater;
    const both = (leafOf(carpet) * taken([carpet]) + leafOf(sword) * taken([sword])) / (leafOf(carpet) + leafOf(sword));
    expect(taken([carpet])).toBeGreaterThan(taken([sword]));
    expect(taken([carpet, sword])).toBeCloseTo(both, 12);
  });
});

describe('floorLight', () => {
  it('is the lamp through the water as it stands, less the canopy’s floor shade', () => {
    const state = produce(createSimulation({ tankCapacity: CAPACITY }), (draft) => {
      draft.plants = planted(MIXED);
      draft.algae.greenWater = bloomAt(draft, 'greenWater', 30);
    });
    const k = waterExtinction(state, opticsDefaults);
    expect(floorLight(state, opticsDefaults)).toBeCloseTo(
      state.equipment.light.par * Math.exp(-k * DEPTH) * (1 - floorShade(state.plants, CAPACITY, opticsDefaults)),
      12
    );
    expect(floorLight(produce(state, (draft) => void (draft.equipment.light.enabled = false)), opticsDefaults)).toBe(0);
  });
});

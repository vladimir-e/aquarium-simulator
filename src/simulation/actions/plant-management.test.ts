import { describe, it, expect } from 'vitest';
import {
  isSubstrateCompatible,
  getSubstrateIncompatibilityReason,
  addPlant,
  removePlant,
  canAddPlant,
  checkPlantFootprint,
} from './plant-management.js';
import { calculateFloorArea, createSimulation, type Plant, type SimulationState } from '../state.js';
import { GROWTH_FORMS, type PlantSpecies } from '../plants/species.js';
import { plantsDefaults } from '../config/plants.js';
import type { SubstrateType } from '../equipment/substrate.js';
import type { ActionResult } from './types.js';
import { DEFAULT_PLANT_SIZE } from '../plants/create-plant.js';
import { produce } from 'immer';
import { plantRecord } from '../tests/plant.js';

const SMALL = 19;
const FERN_FOOTPRINT = GROWTH_FORMS.attached.footprintCm2;
/** Java ferns that leave the small tank's floor with room for one more and no second. */
const FERNS_TO_LAST_GAP = Math.floor(calculateFloorArea(SMALL) / FERN_FOOTPRINT) - 1;

function plant(id: string, size = 50): Plant {
  return plantRecord({ id, species: 'java_fern', size, condition: 100, surplus: 0 });
}

function planted(count: number, size = 50): SimulationState {
  return produce(createSimulation({ tankCapacity: SMALL }), (draft) => {
    for (let i = 0; i < count; i++) draft.plants.push(plant(`plant_${i}`, size));
  });
}

function onSubstrate(type: SubstrateType): SimulationState {
  return produce(createSimulation({ tankCapacity: 100 }), (draft) => {
    draft.equipment.substrate.type = type;
  });
}

const add = (
  state: SimulationState,
  species: PlantSpecies,
  initialSize?: number
): ActionResult =>
  addPlant(state, { type: 'addPlant', species, initialSize });

describe('canAddPlant / checkPlantFootprint', () => {
  it('fits a unit while its footprint fits the floor left free', () => {
    const state = planted(FERNS_TO_LAST_GAP);
    const free = calculateFloorArea(SMALL) - FERNS_TO_LAST_GAP * FERN_FOOTPRINT;

    expect(canAddPlant(state, 'java_fern')).toBe(true);
    expect(checkPlantFootprint(state.plants, 'java_fern', SMALL)).toEqual({
      ok: true,
      message: '',
      free,
      needed: FERN_FOOTPRINT,
    });
  });

  it('refuses when the planted footprints and the new one overrun the floor, in the words addPlant emits', () => {
    const state = planted(FERNS_TO_LAST_GAP);
    const footprint = checkPlantFootprint(state.plants, 'amazon_sword', SMALL);

    expect(canAddPlant(state, 'amazon_sword')).toBe(false);
    expect(footprint.ok).toBe(false);
    expect(footprint.message).toBe(
      `Not enough floor: ${Math.floor(footprint.free)} cm² free, Amazon Sword needs ${GROWTH_FORMS.rosette.footprintCm2}`
    );
    expect(add(state, 'amazon_sword').message).toBe(footprint.message);
  });

  it('counts a seedling as the grown unit it will be', () => {
    const seedlings = checkPlantFootprint(planted(FERNS_TO_LAST_GAP, 1).plants, 'java_fern', SMALL);
    const grown = checkPlantFootprint(planted(FERNS_TO_LAST_GAP, 100).plants, 'java_fern', SMALL);
    expect(seedlings).toEqual(grown);
  });
});

describe('substrate compatibility', () => {
  it.each<[PlantSpecies, SubstrateType[]]>([
    ['java_fern', ['none', 'sand', 'aqua_soil']],
    ['anubias', ['none', 'sand', 'aqua_soil']],
    ['amazon_sword', ['sand', 'aqua_soil']],
    ['dwarf_hairgrass', ['aqua_soil']],
    ['monte_carlo', ['aqua_soil']],
  ])('%s roots in %j', (species, accepted) => {
    for (const substrate of ['none', 'sand', 'aqua_soil'] as SubstrateType[]) {
      const ok = accepted.includes(substrate);
      expect(isSubstrateCompatible(species, substrate)).toBe(ok);
      expect(getSubstrateIncompatibilityReason(species, substrate) === null).toBe(ok);
    }
  });

  it('names the plant and what it needs', () => {
    const reason = getSubstrateIncompatibilityReason('amazon_sword', 'none')!;
    expect(reason).toContain('Amazon Sword');
    expect(reason).toContain('sand');
    expect(reason).toContain('aqua soil');
  });
});

describe('addPlant', () => {
  it('plants the species at the default size, with a fresh id, and logs it', () => {
    let state = onSubstrate('none');
    state = add(state, 'java_fern').state;
    const result = add(state, 'java_fern');
    const [first, second] = result.state.plants;
    const log = result.state.logs.at(-1)!;

    expect(result.state.plants).toHaveLength(2);
    expect(second.species).toBe('java_fern');
    expect(second.size).toBe(DEFAULT_PLANT_SIZE);
    expect(second.id).not.toBe(first.id);
    expect(result.message).toBe('Added Java Fern');
    expect(result.state.logs).toHaveLength(state.logs.length + 1);
    expect(log).toMatchObject({ source: 'user', severity: 'info' });
    expect(log.message).toContain('Java Fern');
    expect(log.message).toContain(`${DEFAULT_PLANT_SIZE}%`);
  });

  it.each([plantsDefaults.deathSizeThreshold, 10, 100])('takes an initial size of %d%%', (initialSize) => {
    const result = add(onSubstrate('none'), 'java_fern', initialSize);
    expect(result.state.plants[0].size).toBe(initialSize);
    expect(result.state.logs.at(-1)!.message).toContain(`${initialSize}%`);
  });

  it.each([-10, 0, 100.5, 250, NaN])('refuses an initial size of %d', (initialSize) => {
    const state = onSubstrate('none');
    const result = add(state, 'java_fern', initialSize);

    expect(result.state).toBe(state);
    expect(result.message).toContain('Invalid initial size');
  });

  it('refuses a size under `deathSizeThreshold`, which the next tick would retire', () => {
    const state = onSubstrate('none');
    const plantsConfig = { ...plantsDefaults, deathSizeThreshold: 5 };
    const planting = (initialSize: number): ActionResult =>
      addPlant(state, { type: 'addPlant', species: 'java_fern', initialSize }, plantsConfig);

    expect(planting(4.9).state).toBe(state);
    expect(planting(4.9).message).toContain('Invalid initial size');
    expect(planting(5).state.plants).toHaveLength(1);
  });

  it('refuses a species the substrate cannot root, leaving the tank alone', () => {
    const state = onSubstrate('sand');
    const result = add(state, 'dwarf_hairgrass');

    expect(result.state).toBe(state);
    expect(result.message).toBe(getSubstrateIncompatibilityReason('dwarf_hairgrass', 'sand'));
  });

  it('checks the floor before the substrate', () => {
    expect(add(planted(FERNS_TO_LAST_GAP + 1), 'monte_carlo').message).toContain('Not enough floor');
  });
});

describe('removePlant', () => {
  const twoPlants = (): SimulationState =>
    add(add(onSubstrate('none'), 'java_fern').state, 'anubias').state;

  it('removes the plant by id, keeps the rest, and logs it', () => {
    const state = twoPlants();
    const [fern, anubias] = state.plants;
    const result = removePlant(state, { type: 'removePlant', plantId: fern.id });

    expect(result.state.plants).toEqual([anubias]);
    expect(result.message).toBe('Removed Java Fern');
    expect(result.state.logs).toHaveLength(state.logs.length + 1);
    expect(result.state.logs.at(-1)!.message).toContain('Java Fern');
    expect(state.plants).toHaveLength(2);
  });

  it('stirs its footprint share of the bed when it uproots a rooted plant', () => {
    const soil = produce(
      createSimulation({ tankCapacity: 100, substrate: { type: 'aqua_soil' } }),
      (draft) => void (draft.resources.aob = 1000)
    );
    const sword = add(soil, 'amazon_sword').state;
    const result = removePlant(sword, { type: 'removePlant', plantId: sword.plants[0].id });
    const share = GROWTH_FORMS.rosette.footprintCm2 / calculateFloorArea(sword.tank.capacity);
    const reserve = sword.equipment.substrate.organicReserve;

    expect(reserve).toBeGreaterThan(0);
    expect(result.state.equipment.substrate.organicReserve).toBeCloseTo(reserve * (1 - share), 12);
    expect(result.state.resources.waste).toBeCloseTo(sword.resources.waste + reserve * share, 12);
    expect(result.state.resources.aob).toBeLessThan(1000);
  });

  it('takes an epiphyte off the hardscape without touching the bed', () => {
    const soil = produce(
      createSimulation({ tankCapacity: 100, substrate: { type: 'aqua_soil' } }),
      (draft) => void (draft.resources.aob = 1000)
    );
    const fern = add(soil, 'java_fern').state;
    const result = removePlant(fern, { type: 'removePlant', plantId: fern.plants[0].id });

    expect(result.state.equipment.substrate).toEqual(fern.equipment.substrate);
    expect(result.state.resources).toEqual(fern.resources);
  });

  it.each(['nonexistent_id', ''])('leaves the tank alone for an unknown id %j', (plantId) => {
    const state = twoPlants();
    const result = removePlant(state, { type: 'removePlant', plantId });

    expect(result.state).toBe(state);
    expect(result.message).toBe('Plant not found');
  });
});

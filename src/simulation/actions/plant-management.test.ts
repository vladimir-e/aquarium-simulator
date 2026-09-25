import { describe, it, expect } from 'vitest';
import {
  isSubstrateCompatible,
  getSubstrateIncompatibilityReason,
  addPlant,
  removePlant,
  getMaxPlants,
  canAddPlant,
  checkPlantCapacity,
} from './plant-management.js';
import { createSimulation, type Plant, type SimulationState } from '../state.js';
import type { PlantSpecies } from '../plants/species.js';
import type { SubstrateType } from '../equipment/substrate.js';
import { plantsDefaults } from '../config/plants.js';
import type { ActionResult } from './types.js';
import { DEFAULT_PLANT_SIZE } from '../plants/create-plant.js';
import { produce } from 'immer';

const SMALL = 19;

function plant(id: string): Plant {
  return { id, species: 'java_fern', size: 50, condition: 100, surplus: 0 };
}

function planted(count: number, tankCapacity = SMALL): SimulationState {
  return produce(createSimulation({ tankCapacity }), (draft) => {
    for (let i = 0; i < count; i++) draft.plants.push(plant(`plant_${i}`));
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
  addPlant(state, { type: 'addPlant', species, initialSize }, plantsDefaults);

describe('getMaxPlants', () => {
  it('is zero without a tank, at least one in any tank, and grows with it', () => {
    expect(getMaxPlants(0)).toBe(0);
    expect(getMaxPlants(-10)).toBe(0);
    expect(getMaxPlants(5)).toBe(1);
    const sizes = [5, 19, 38, 57, 95, 208].map(getMaxPlants);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThan(sizes[i - 1]!);
  });
});

describe('canAddPlant / checkPlantCapacity', () => {
  const max = getMaxPlants(SMALL);

  it('allows a plant while a slot is free', () => {
    expect(canAddPlant(planted(max - 1))).toBe(true);
    expect(checkPlantCapacity(planted(max - 1).plants, SMALL)).toEqual({ ok: true, message: '' });
  });

  it('refuses at capacity in the words addPlant itself emits', () => {
    const full = planted(max);
    const capacity = checkPlantCapacity(full.plants, SMALL);

    expect(canAddPlant(full)).toBe(false);
    expect(capacity).toEqual({ ok: false, message: `Tank at plant capacity (${max} plants max)` });
    expect(add(full, 'java_fern').message).toBe(capacity.message);
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

  it.each([0, 10, 100, 200])('takes an initial size of %d%%', (initialSize) => {
    const result = add(onSubstrate('none'), 'java_fern', initialSize);
    expect(result.state.plants[0].size).toBe(initialSize);
    expect(result.state.logs.at(-1)!.message).toContain(`${initialSize}%`);
  });

  it.each([-10, 250, NaN])('refuses an initial size of %d', (initialSize) => {
    const state = onSubstrate('none');
    const result = add(state, 'java_fern', initialSize);

    expect(result.state).toBe(state);
    expect(result.message).toContain('Invalid initial size');
  });

  it('refuses a species the substrate cannot root, leaving the tank alone', () => {
    const state = onSubstrate('sand');
    const result = add(state, 'dwarf_hairgrass');

    expect(result.state).toBe(state);
    expect(result.message).toBe(getSubstrateIncompatibilityReason('dwarf_hairgrass', 'sand'));
  });

  it('checks capacity before substrate', () => {
    expect(add(planted(getMaxPlants(SMALL)), 'monte_carlo').message).toContain('capacity');
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

  it.each(['nonexistent_id', ''])('leaves the tank alone for an unknown id %j', (plantId) => {
    const state = twoPlants();
    const result = removePlant(state, { type: 'removePlant', plantId });

    expect(result.state).toBe(state);
    expect(result.message).toBe('Plant not found');
  });
});

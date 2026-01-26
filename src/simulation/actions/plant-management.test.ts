import { describe, it, expect } from 'vitest';
import {
  isSubstrateCompatible,
  getSubstrateIncompatibilityReason,
  addPlant,
  removePlant,
  getMaxPlants,
  canAddPlant,
} from './plant-management.js';
import { createSimulation, type SimulationState, type PlantSpecies, type SubstrateType } from '../state.js';
import { produce } from 'immer';

describe('getMaxPlants', () => {
  // 3 plants per 5 gallons = 3 plants per 18.927 liters

  it('returns 0 for zero capacity', () => {
    expect(getMaxPlants(0)).toBe(0);
  });

  it('returns 0 for negative capacity', () => {
    expect(getMaxPlants(-10)).toBe(0);
  });

  it('returns minimum of 1 for small tanks', () => {
    expect(getMaxPlants(5)).toBe(1); // 5L is less than 5 gallons
    expect(getMaxPlants(10)).toBe(1);
  });

  it('returns 3 for 5 gallon (19L) tank', () => {
    expect(getMaxPlants(19)).toBe(3);
  });

  it('returns 6 for 10 gallon (38L) tank', () => {
    expect(getMaxPlants(38)).toBe(6);
  });

  it('returns 9 for 15 gallon (57L) tank', () => {
    expect(getMaxPlants(57)).toBe(9);
  });

  it('returns 15 for 25 gallon (95L) tank', () => {
    expect(getMaxPlants(95)).toBe(15);
  });

  it('scales correctly with standard tank sizes', () => {
    // 10 gallon = 37.85L ~= 5 plants (exactly 6 would need 37.85L)
    expect(getMaxPlants(38)).toBe(6);
    // 20 gallon = 75.7L = 11 plants
    expect(getMaxPlants(76)).toBe(12);
    // 55 gallon = 208L = 32 plants
    expect(getMaxPlants(208)).toBe(32);
  });
});

describe('canAddPlant', () => {
  it('returns true when below capacity', () => {
    const state = createSimulation({ tankCapacity: 38 }); // 10 gallon = 6 max
    expect(canAddPlant(state)).toBe(true);
  });

  it('returns false when at capacity', () => {
    let state = createSimulation({ tankCapacity: 19 }); // 5 gallon = 3 max
    // Add 3 plants
    for (let i = 0; i < 3; i++) {
      state = produce(state, (draft) => {
        draft.plants.push({ id: `plant_${i}`, species: 'java_fern', size: 50 });
      });
    }
    expect(canAddPlant(state)).toBe(false);
  });

  it('returns true when just below capacity', () => {
    let state = createSimulation({ tankCapacity: 19 }); // 5 gallon = 3 max
    // Add 2 plants
    state = produce(state, (draft) => {
      draft.plants.push({ id: 'plant_1', species: 'java_fern', size: 50 });
      draft.plants.push({ id: 'plant_2', species: 'anubias', size: 50 });
    });
    expect(canAddPlant(state)).toBe(true);
  });
});

describe('isSubstrateCompatible', () => {
  describe('plants with no substrate requirement (epiphytes)', () => {
    const epiphytes: PlantSpecies[] = ['java_fern', 'anubias'];

    it.each(epiphytes)('%s is compatible with no substrate', (species) => {
      expect(isSubstrateCompatible(species, 'none')).toBe(true);
    });

    it.each(epiphytes)('%s is compatible with sand substrate', (species) => {
      expect(isSubstrateCompatible(species, 'sand')).toBe(true);
    });

    it.each(epiphytes)('%s is compatible with aqua_soil substrate', (species) => {
      expect(isSubstrateCompatible(species, 'aqua_soil')).toBe(true);
    });
  });

  describe('plants requiring sand substrate', () => {
    const sandPlants: PlantSpecies[] = ['amazon_sword'];

    it.each(sandPlants)('%s is NOT compatible with no substrate', (species) => {
      expect(isSubstrateCompatible(species, 'none')).toBe(false);
    });

    it.each(sandPlants)('%s is compatible with sand substrate', (species) => {
      expect(isSubstrateCompatible(species, 'sand')).toBe(true);
    });

    it.each(sandPlants)('%s is compatible with aqua_soil substrate', (species) => {
      expect(isSubstrateCompatible(species, 'aqua_soil')).toBe(true);
    });
  });

  describe('plants requiring aqua_soil substrate', () => {
    const aquaSoilPlants: PlantSpecies[] = ['dwarf_hairgrass', 'monte_carlo'];

    it.each(aquaSoilPlants)('%s is NOT compatible with no substrate', (species) => {
      expect(isSubstrateCompatible(species, 'none')).toBe(false);
    });

    it.each(aquaSoilPlants)('%s is NOT compatible with sand substrate', (species) => {
      expect(isSubstrateCompatible(species, 'sand')).toBe(false);
    });

    it.each(aquaSoilPlants)('%s is compatible with aqua_soil substrate', (species) => {
      expect(isSubstrateCompatible(species, 'aqua_soil')).toBe(true);
    });
  });

  describe('comprehensive species/substrate matrix', () => {
    it('java_fern (epiphyte) compatibility', () => {
      expect(isSubstrateCompatible('java_fern', 'none')).toBe(true);
      expect(isSubstrateCompatible('java_fern', 'sand')).toBe(true);
      expect(isSubstrateCompatible('java_fern', 'aqua_soil')).toBe(true);
    });

    it('anubias (epiphyte) compatibility', () => {
      expect(isSubstrateCompatible('anubias', 'none')).toBe(true);
      expect(isSubstrateCompatible('anubias', 'sand')).toBe(true);
      expect(isSubstrateCompatible('anubias', 'aqua_soil')).toBe(true);
    });

    it('amazon_sword (sand requirement) compatibility', () => {
      expect(isSubstrateCompatible('amazon_sword', 'none')).toBe(false);
      expect(isSubstrateCompatible('amazon_sword', 'sand')).toBe(true);
      expect(isSubstrateCompatible('amazon_sword', 'aqua_soil')).toBe(true);
    });

    it('dwarf_hairgrass (aqua_soil requirement) compatibility', () => {
      expect(isSubstrateCompatible('dwarf_hairgrass', 'none')).toBe(false);
      expect(isSubstrateCompatible('dwarf_hairgrass', 'sand')).toBe(false);
      expect(isSubstrateCompatible('dwarf_hairgrass', 'aqua_soil')).toBe(true);
    });

    it('monte_carlo (aqua_soil requirement) compatibility', () => {
      expect(isSubstrateCompatible('monte_carlo', 'none')).toBe(false);
      expect(isSubstrateCompatible('monte_carlo', 'sand')).toBe(false);
      expect(isSubstrateCompatible('monte_carlo', 'aqua_soil')).toBe(true);
    });
  });
});

describe('getSubstrateIncompatibilityReason', () => {
  it('returns null for compatible combinations', () => {
    expect(getSubstrateIncompatibilityReason('java_fern', 'none')).toBeNull();
    expect(getSubstrateIncompatibilityReason('amazon_sword', 'sand')).toBeNull();
    expect(getSubstrateIncompatibilityReason('monte_carlo', 'aqua_soil')).toBeNull();
  });

  it('returns reason for sand-requiring plant without substrate', () => {
    const reason = getSubstrateIncompatibilityReason('amazon_sword', 'none');
    expect(reason).not.toBeNull();
    expect(reason).toContain('Amazon Sword');
    expect(reason).toContain('sand');
    expect(reason).toContain('aqua soil');
  });

  it('returns reason for aqua_soil-requiring plant without substrate', () => {
    const reason = getSubstrateIncompatibilityReason('dwarf_hairgrass', 'none');
    expect(reason).not.toBeNull();
    expect(reason).toContain('Dwarf Hairgrass');
    expect(reason).toContain('aqua soil');
  });

  it('returns reason for aqua_soil-requiring plant with sand', () => {
    const reason = getSubstrateIncompatibilityReason('monte_carlo', 'sand');
    expect(reason).not.toBeNull();
    expect(reason).toContain('Monte Carlo');
    expect(reason).toContain('aqua soil');
  });
});

describe('addPlant', () => {
  function createStateWithSubstrate(substrateType: SubstrateType): SimulationState {
    const state = createSimulation({ tankCapacity: 100 });
    return produce(state, (draft) => {
      draft.equipment.substrate.type = substrateType;
    });
  }

  describe('with compatible substrate', () => {
    it('adds epiphyte to tank with no substrate', () => {
      const state = createStateWithSubstrate('none');
      const result = addPlant(state, { type: 'addPlant', species: 'java_fern' });

      expect(result.state.plants).toHaveLength(1);
      expect(result.state.plants[0].species).toBe('java_fern');
    });

    it('adds sand-requiring plant to sand substrate', () => {
      const state = createStateWithSubstrate('sand');
      const result = addPlant(state, { type: 'addPlant', species: 'amazon_sword' });

      expect(result.state.plants).toHaveLength(1);
      expect(result.state.plants[0].species).toBe('amazon_sword');
    });

    it('adds aqua_soil-requiring plant to aqua_soil substrate', () => {
      const state = createStateWithSubstrate('aqua_soil');
      const result = addPlant(state, { type: 'addPlant', species: 'monte_carlo' });

      expect(result.state.plants).toHaveLength(1);
      expect(result.state.plants[0].species).toBe('monte_carlo');
    });

    it('plant gets unique ID', () => {
      const state = createStateWithSubstrate('none');
      const result = addPlant(state, { type: 'addPlant', species: 'java_fern' });

      expect(result.state.plants[0].id).toBeDefined();
      expect(result.state.plants[0].id.length).toBeGreaterThan(0);
    });

    it('plant IDs are unique', () => {
      let state = createStateWithSubstrate('none');
      state = addPlant(state, { type: 'addPlant', species: 'java_fern' }).state;
      state = addPlant(state, { type: 'addPlant', species: 'java_fern' }).state;

      expect(state.plants[0].id).not.toBe(state.plants[1].id);
    });

    it('default initial size is 50%', () => {
      const state = createStateWithSubstrate('none');
      const result = addPlant(state, { type: 'addPlant', species: 'java_fern' });

      expect(result.state.plants[0].size).toBe(50);
    });

    it('returns success message with plant name', () => {
      const state = createStateWithSubstrate('none');
      const result = addPlant(state, { type: 'addPlant', species: 'java_fern' });

      expect(result.message).toBe('Added Java Fern');
    });

    it('creates log entry', () => {
      const state = createStateWithSubstrate('none');
      const initialLogCount = state.logs.length;
      const result = addPlant(state, { type: 'addPlant', species: 'java_fern' });

      expect(result.state.logs.length).toBe(initialLogCount + 1);
    });

    it('log entry contains plant name and size', () => {
      const state = createStateWithSubstrate('none');
      const result = addPlant(state, { type: 'addPlant', species: 'java_fern' });

      const lastLog = result.state.logs[result.state.logs.length - 1];
      expect(lastLog.source).toBe('user');
      expect(lastLog.severity).toBe('info');
      expect(lastLog.message).toContain('Java Fern');
      expect(lastLog.message).toContain('50%');
    });
  });

  describe('with custom initial size', () => {
    it('uses provided initial size', () => {
      const state = createStateWithSubstrate('none');
      const result = addPlant(state, { type: 'addPlant', species: 'java_fern', initialSize: 75 });

      expect(result.state.plants[0].size).toBe(75);
    });

    it('allows small initial size', () => {
      const state = createStateWithSubstrate('none');
      const result = addPlant(state, { type: 'addPlant', species: 'java_fern', initialSize: 10 });

      expect(result.state.plants[0].size).toBe(10);
    });

    it('allows large initial size', () => {
      const state = createStateWithSubstrate('none');
      const result = addPlant(state, { type: 'addPlant', species: 'java_fern', initialSize: 100 });

      expect(result.state.plants[0].size).toBe(100);
    });

    it('log entry shows custom size', () => {
      const state = createStateWithSubstrate('none');
      const result = addPlant(state, { type: 'addPlant', species: 'java_fern', initialSize: 80 });

      const lastLog = result.state.logs[result.state.logs.length - 1];
      expect(lastLog.message).toContain('80%');
    });

    it('allows overgrown initial size up to 200%', () => {
      const state = createStateWithSubstrate('none');
      const result = addPlant(state, { type: 'addPlant', species: 'java_fern', initialSize: 200 });

      expect(result.state.plants[0].size).toBe(200);
    });

    it('rejects negative initial size', () => {
      const state = createStateWithSubstrate('none');
      const result = addPlant(state, { type: 'addPlant', species: 'java_fern', initialSize: -10 });

      expect(result.state.plants).toHaveLength(0);
      expect(result.message).toContain('Invalid initial size');
    });

    it('rejects initial size over 200%', () => {
      const state = createStateWithSubstrate('none');
      const result = addPlant(state, { type: 'addPlant', species: 'java_fern', initialSize: 250 });

      expect(result.state.plants).toHaveLength(0);
      expect(result.message).toContain('Invalid initial size');
      expect(result.message).toContain('0-200%');
    });
  });

  describe('rejection with incompatible substrate', () => {
    it('rejects amazon_sword without substrate', () => {
      const state = createStateWithSubstrate('none');
      const result = addPlant(state, { type: 'addPlant', species: 'amazon_sword' });

      expect(result.state.plants).toHaveLength(0);
      expect(result.message).toContain('sand');
      expect(result.message).toContain('aqua soil');
    });

    it('rejects monte_carlo without substrate', () => {
      const state = createStateWithSubstrate('none');
      const result = addPlant(state, { type: 'addPlant', species: 'monte_carlo' });

      expect(result.state.plants).toHaveLength(0);
      expect(result.message).toContain('aqua soil');
    });

    it('rejects dwarf_hairgrass with sand', () => {
      const state = createStateWithSubstrate('sand');
      const result = addPlant(state, { type: 'addPlant', species: 'dwarf_hairgrass' });

      expect(result.state.plants).toHaveLength(0);
      expect(result.message).toContain('aqua soil');
    });

    it('does not create log entry when rejected', () => {
      const state = createStateWithSubstrate('none');
      const initialLogCount = state.logs.length;
      const result = addPlant(state, { type: 'addPlant', species: 'monte_carlo' });

      expect(result.state.logs.length).toBe(initialLogCount);
    });

    it('state is unchanged when rejected', () => {
      const state = createStateWithSubstrate('none');
      const result = addPlant(state, { type: 'addPlant', species: 'monte_carlo' });

      expect(result.state).toBe(state);
    });
  });

  describe('plant capacity limit', () => {
    it('rejects adding plant when at capacity', () => {
      // 19L tank = 3 plants max
      let state = createSimulation({ tankCapacity: 19 });
      // Add 3 plants to reach capacity
      state = addPlant(state, { type: 'addPlant', species: 'java_fern' }).state;
      state = addPlant(state, { type: 'addPlant', species: 'java_fern' }).state;
      state = addPlant(state, { type: 'addPlant', species: 'java_fern' }).state;

      expect(state.plants).toHaveLength(3);

      // Try to add 4th plant
      const result = addPlant(state, { type: 'addPlant', species: 'java_fern' });
      expect(result.state.plants).toHaveLength(3);
      expect(result.message).toContain('capacity');
    });

    it('returns error message with max count', () => {
      let state = createSimulation({ tankCapacity: 19 }); // 3 max
      state = produce(state, (draft) => {
        draft.plants.push({ id: 'p1', species: 'java_fern', size: 50 });
        draft.plants.push({ id: 'p2', species: 'java_fern', size: 50 });
        draft.plants.push({ id: 'p3', species: 'java_fern', size: 50 });
      });

      const result = addPlant(state, { type: 'addPlant', species: 'java_fern' });
      expect(result.message).toContain('3 plants max');
    });

    it('does not create log when rejected for capacity', () => {
      let state = createSimulation({ tankCapacity: 19 }); // 3 max
      state = produce(state, (draft) => {
        draft.plants.push({ id: 'p1', species: 'java_fern', size: 50 });
        draft.plants.push({ id: 'p2', species: 'java_fern', size: 50 });
        draft.plants.push({ id: 'p3', species: 'java_fern', size: 50 });
      });
      const initialLogCount = state.logs.length;

      const result = addPlant(state, { type: 'addPlant', species: 'java_fern' });
      expect(result.state.logs.length).toBe(initialLogCount);
    });

    it('capacity limit is checked before substrate compatibility', () => {
      // Even with incompatible substrate, capacity is checked first
      let state = createSimulation({ tankCapacity: 19 }); // 3 max
      state = produce(state, (draft) => {
        draft.plants.push({ id: 'p1', species: 'java_fern', size: 50 });
        draft.plants.push({ id: 'p2', species: 'java_fern', size: 50 });
        draft.plants.push({ id: 'p3', species: 'java_fern', size: 50 });
      });

      const result = addPlant(state, { type: 'addPlant', species: 'monte_carlo' });
      expect(result.message).toContain('capacity'); // Not substrate error
    });
  });

  describe('adding multiple plants', () => {
    it('can add multiple plants sequentially', () => {
      let state = createStateWithSubstrate('aqua_soil');
      state = addPlant(state, { type: 'addPlant', species: 'java_fern' }).state;
      state = addPlant(state, { type: 'addPlant', species: 'amazon_sword' }).state;
      state = addPlant(state, { type: 'addPlant', species: 'monte_carlo' }).state;

      expect(state.plants).toHaveLength(3);
      expect(state.plants[0].species).toBe('java_fern');
      expect(state.plants[1].species).toBe('amazon_sword');
      expect(state.plants[2].species).toBe('monte_carlo');
    });

    it('can add same species multiple times', () => {
      let state = createStateWithSubstrate('none');
      state = addPlant(state, { type: 'addPlant', species: 'java_fern' }).state;
      state = addPlant(state, { type: 'addPlant', species: 'java_fern' }).state;

      expect(state.plants).toHaveLength(2);
      expect(state.plants[0].species).toBe('java_fern');
      expect(state.plants[1].species).toBe('java_fern');
    });
  });

  describe('immutability', () => {
    it('does not modify original state', () => {
      const state = createStateWithSubstrate('none');
      const originalPlantCount = state.plants.length;

      addPlant(state, { type: 'addPlant', species: 'java_fern' });

      expect(state.plants.length).toBe(originalPlantCount);
    });
  });
});

describe('removePlant', () => {
  function createStateWithPlants(substrateType: SubstrateType = 'none'): SimulationState {
    let state = createSimulation({ tankCapacity: 100 });
    state = produce(state, (draft) => {
      draft.equipment.substrate.type = substrateType;
    });
    // Add some plants
    state = addPlant(state, { type: 'addPlant', species: 'java_fern' }).state;
    state = addPlant(state, { type: 'addPlant', species: 'anubias' }).state;
    return state;
  }

  it('removes plant by ID', () => {
    const state = createStateWithPlants();
    const plantIdToRemove = state.plants[0].id;

    const result = removePlant(state, { type: 'removePlant', plantId: plantIdToRemove });

    expect(result.state.plants).toHaveLength(1);
    expect(result.state.plants.find((p) => p.id === plantIdToRemove)).toBeUndefined();
  });

  it('keeps other plants unchanged', () => {
    const state = createStateWithPlants();
    const plantIdToRemove = state.plants[0].id;
    const remainingPlantId = state.plants[1].id;

    const result = removePlant(state, { type: 'removePlant', plantId: plantIdToRemove });

    expect(result.state.plants.find((p) => p.id === remainingPlantId)).toBeDefined();
  });

  it('returns success message with plant name', () => {
    const state = createStateWithPlants();
    const plantIdToRemove = state.plants[0].id; // java_fern

    const result = removePlant(state, { type: 'removePlant', plantId: plantIdToRemove });

    expect(result.message).toBe('Removed Java Fern');
  });

  it('creates log entry', () => {
    const state = createStateWithPlants();
    const initialLogCount = state.logs.length;
    const plantIdToRemove = state.plants[0].id;

    const result = removePlant(state, { type: 'removePlant', plantId: plantIdToRemove });

    expect(result.state.logs.length).toBe(initialLogCount + 1);
  });

  it('log entry contains plant name', () => {
    const state = createStateWithPlants();
    const plantIdToRemove = state.plants[0].id; // java_fern

    const result = removePlant(state, { type: 'removePlant', plantId: plantIdToRemove });

    const lastLog = result.state.logs[result.state.logs.length - 1];
    expect(lastLog.source).toBe('user');
    expect(lastLog.severity).toBe('info');
    expect(lastLog.message).toContain('Java Fern');
  });

  describe('invalid ID handling', () => {
    it('returns unchanged state for invalid ID', () => {
      const state = createStateWithPlants();
      const result = removePlant(state, { type: 'removePlant', plantId: 'nonexistent_id' });

      expect(result.state.plants).toHaveLength(2);
      expect(result.state).toBe(state);
    });

    it('returns error message for invalid ID', () => {
      const state = createStateWithPlants();
      const result = removePlant(state, { type: 'removePlant', plantId: 'nonexistent_id' });

      expect(result.message).toBe('Plant not found');
    });

    it('does not create log entry for invalid ID', () => {
      const state = createStateWithPlants();
      const initialLogCount = state.logs.length;

      const result = removePlant(state, { type: 'removePlant', plantId: 'nonexistent_id' });

      expect(result.state.logs.length).toBe(initialLogCount);
    });

    it('handles empty string ID', () => {
      const state = createStateWithPlants();
      const result = removePlant(state, { type: 'removePlant', plantId: '' });

      expect(result.state.plants).toHaveLength(2);
      expect(result.message).toBe('Plant not found');
    });
  });

  describe('removing all plants', () => {
    it('can remove all plants', () => {
      let state = createStateWithPlants();
      const plant1Id = state.plants[0].id;
      const plant2Id = state.plants[1].id;

      state = removePlant(state, { type: 'removePlant', plantId: plant1Id }).state;
      state = removePlant(state, { type: 'removePlant', plantId: plant2Id }).state;

      expect(state.plants).toHaveLength(0);
    });

    it('removing from empty plants returns not found', () => {
      const state = createSimulation({ tankCapacity: 100 });
      const result = removePlant(state, { type: 'removePlant', plantId: 'any_id' });

      expect(result.message).toBe('Plant not found');
    });
  });

  describe('immutability', () => {
    it('does not modify original state', () => {
      const state = createStateWithPlants();
      const originalPlantCount = state.plants.length;
      const plantIdToRemove = state.plants[0].id;

      removePlant(state, { type: 'removePlant', plantId: plantIdToRemove });

      expect(state.plants.length).toBe(originalPlantCount);
    });
  });
});

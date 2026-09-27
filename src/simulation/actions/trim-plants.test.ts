import { describe, it, expect } from 'vitest';
import { canTrimPlants, getPlantsToTrimCount, trimPlants } from './trim-plants.js';
import { createSimulation, type SimulationState, type Plant } from '../state.js';
import { MIN_PLANTABLE_SIZE } from '../plants/create-plant.js';
import { produce } from 'immer';
import { plantRecord } from '../tests/plant.js';

function tankWith(...sizes: number[]): SimulationState {
  return produce(createSimulation({ tankCapacity: 100 }), (draft) => {
    draft.plants = sizes.map(
      (size, i): Plant => plantRecord({ id: `p${i + 1}`, species: 'java_fern', size, condition: 100, surplus: 0 })
    );
  });
}

const sizes = (state: SimulationState): number[] => state.plants.map((p) => p.size);

describe('canTrimPlants', () => {
  it('answers exactly whether trimPlants would cut anything, for every scope', () => {
    const state = produce(tankWith(40, 95, 20, 60), (draft) => {
      draft.plants[1].familyId = 'p1';
    });
    for (const targetSize of [0, MIN_PLANTABLE_SIZE - 0.1, MIN_PLANTABLE_SIZE, 20, 30, 59, 60, 100, 101]) {
      for (const scope of [{}, { familyId: 'p1' }, { familyId: 'p3' }, { plantId: 'p2' }, { plantId: 'p3' }, { plantId: 'gone' }]) {
        const action = { type: 'trimPlants' as const, targetSize, ...scope };
        const trimmed = trimPlants(state, action).state !== state;
        expect(canTrimPlants(state, action)).toBe(trimmed);
      }
    }
  });
});

describe('getPlantsToTrimCount', () => {
  it('counts plants strictly above the target', () => {
    const state = tankWith(60, 85, 90, 97);

    expect(getPlantsToTrimCount(tankWith(), 50)).toBe(0);
    expect(getPlantsToTrimCount(state, 50)).toBe(4);
    expect(getPlantsToTrimCount(state, 85)).toBe(2);
    expect(getPlantsToTrimCount(state, 95)).toBe(1);
    expect(getPlantsToTrimCount(state, 100)).toBe(0);
  });
});

describe('trimPlants — every plant', () => {
  it('cuts everything above the target down to it and leaves the rest', () => {
    const state = tankWith(60, 85, 97, 30);
    const result = trimPlants(state, { type: 'trimPlants', targetSize: 85 });

    expect(sizes(result.state)).toEqual([60, 85, 85, 30]);
    expect(sizes(state)).toEqual([60, 85, 97, 30]);
    expect(result.message).toBe('Trimmed 1 plant(s) to 85%');
  });

  it('logs the count, the target and the total removed', () => {
    const state = tankWith(100, 80);
    const result = trimPlants(state, { type: 'trimPlants', targetSize: 50 });
    const log = result.state.logs.at(-1)!;

    expect(result.state.logs).toHaveLength(state.logs.length + 1);
    expect(log).toMatchObject({ source: 'user', severity: 'info' });
    expect(log.message).toContain('2 plant(s)');
    expect(log.message).toContain('50%');
    expect(log.message).toContain('80% total removed');
  });

  it('does nothing, and logs nothing, when nothing is above the target', () => {
    for (const state of [tankWith(), tankWith(40, 50)]) {
      const result = trimPlants(state, { type: 'trimPlants', targetSize: 50 });

      expect(sizes(result.state)).toEqual(sizes(state));
      expect(result.state.logs).toHaveLength(state.logs.length);
      expect(result.message).toContain('No plants above');
    }
  });

  it.each([MIN_PLANTABLE_SIZE, 25, 60, 100])('accepts a target of %d', (targetSize) => {
    expect(trimPlants(tankWith(99), { type: 'trimPlants', targetSize }).message).not.toContain(
      'Invalid'
    );
  });

  it.each([-1, 0, MIN_PLANTABLE_SIZE - 0.1, 101, NaN])('refuses a target of %d', (targetSize) => {
    const state = tankWith(99);
    const result = trimPlants(state, { type: 'trimPlants', targetSize });

    expect(result.state).toBe(state);
    expect(result.message).toContain('Invalid target size');
  });

});

describe('trimPlants — one plant', () => {
  it('trims only that plant and names what came off', () => {
    const state = tankWith(92, 88, 97);
    const result = trimPlants(state, { type: 'trimPlants', plantId: 'p1', targetSize: 60 });

    expect(sizes(result.state)).toEqual([60, 88, 97]);
    expect(result.message).toBe('Trimmed Java Fern to 60% (32% removed)');
    expect(result.state.logs.at(-1)).toMatchObject({ source: 'user', message: result.message });
  });

  it.each([60, 80])('leaves a plant already at or below a target of %d', (targetSize) => {
    const state = tankWith(60);
    const result = trimPlants(state, { type: 'trimPlants', plantId: 'p1', targetSize });

    expect(result.state).toBe(state);
    expect(result.message).toContain('already at or below');
  });

  it('leaves the tank alone for an unknown plant', () => {
    const state = tankWith(100);
    const result = trimPlants(state, { type: 'trimPlants', plantId: 'nonexistent', targetSize: 60 });

    expect(result.state).toBe(state);
    expect(result.message).toContain('not found');
  });

  it('checks the target before looking for the plant', () => {
    const state = tankWith(100);
    const result = trimPlants(state, { type: 'trimPlants', plantId: 'p1', targetSize: 150 });

    expect(result.state).toBe(state);
    expect(result.message).toContain('Invalid target size');
  });
});

describe('trimPlants — one family', () => {
  const families = (): SimulationState =>
    produce(tankWith(95, 90, 97, 99), (draft) => {
      draft.plants[1].parentId = 'p1';
      draft.plants[1].familyId = 'p1';
      draft.plants[3].parentId = 'p2';
      draft.plants[3].familyId = 'p1';
    });

  it('cuts the founder and every offshoot of its line, and no one else', () => {
    const state = families();
    const result = trimPlants(state, { type: 'trimPlants', familyId: 'p1', targetSize: 85 });

    expect(sizes(result.state)).toEqual([85, 85, 97, 85]);
    expect(result.message).toBe('Trimmed 3 plant(s) to 85%');
  });

  it('outlives its founder', () => {
    const state = produce(families(), (draft) => {
      draft.plants.splice(0, 1);
    });
    const result = trimPlants(state, { type: 'trimPlants', familyId: 'p1', targetSize: 85 });

    expect(sizes(result.state)).toEqual([85, 97, 85]);
  });

  it('does nothing for a family with nothing above the target', () => {
    const state = families();
    for (const familyId of ['p1', 'gone']) {
      const result = trimPlants(state, { type: 'trimPlants', familyId, targetSize: 99 });
      expect(result.state).toBe(state);
      expect(result.message).toContain('No plants above');
    }
  });
});

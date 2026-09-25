import { describe, it, expect } from 'vitest';
import { canTrimPlants, getPlantsToTrimCount, trimPlants } from './trim-plants.js';
import { createSimulation, type SimulationState, type Plant } from '../state.js';
import { produce } from 'immer';

function tankWith(...sizes: number[]): SimulationState {
  return produce(createSimulation({ tankCapacity: 100 }), (draft) => {
    draft.plants = sizes.map(
      (size, i): Plant => ({ id: `p${i + 1}`, species: 'java_fern', size, condition: 100, surplus: 0 })
    );
  });
}

const sizes = (state: SimulationState): number[] => state.plants.map((p) => p.size);

describe('canTrimPlants', () => {
  it('needs a plant above half size', () => {
    expect(canTrimPlants(tankWith())).toBe(false);
    expect(canTrimPlants(tankWith(30, 45))).toBe(false);
    expect(canTrimPlants(tankWith(50))).toBe(false);
    expect(canTrimPlants(tankWith(30, 51))).toBe(true);
    expect(canTrimPlants(tankWith(200))).toBe(true);
  });
});

describe('getPlantsToTrimCount', () => {
  it('counts plants strictly above the target', () => {
    const state = tankWith(60, 85, 90, 120);

    expect(getPlantsToTrimCount(tankWith(), 50)).toBe(0);
    expect(getPlantsToTrimCount(state, 50)).toBe(4);
    expect(getPlantsToTrimCount(state, 85)).toBe(2);
    expect(getPlantsToTrimCount(state, 100)).toBe(1);
  });
});

describe('trimPlants — every plant', () => {
  it('cuts everything above the target down to it and leaves the rest', () => {
    const state = tankWith(60, 85, 110, 30);
    const result = trimPlants(state, { type: 'trimPlants', targetSize: 85 });

    expect(sizes(result.state)).toEqual([60, 85, 85, 30]);
    expect(sizes(state)).toEqual([60, 85, 110, 30]);
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

  it.each([0, 25, 60, 100])('accepts a target of %d', (targetSize) => {
    expect(trimPlants(tankWith(200), { type: 'trimPlants', targetSize }).message).not.toContain(
      'Invalid'
    );
  });

  it.each([-1, 101, NaN])('refuses a target of %d', (targetSize) => {
    const state = tankWith(200);
    const result = trimPlants(state, { type: 'trimPlants', targetSize });

    expect(result.state).toBe(state);
    expect(result.message).toContain('Invalid target size');
  });
});

describe('trimPlants — one plant', () => {
  it('trims only that plant and names what came off', () => {
    const state = tankWith(92, 88, 150);
    const result = trimPlants(state, { type: 'trimPlants', plantId: 'p1', targetSize: 60 });

    expect(sizes(result.state)).toEqual([60, 88, 150]);
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

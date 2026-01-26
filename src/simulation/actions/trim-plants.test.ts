import { describe, it, expect } from 'vitest';
import { canTrimPlants, getPlantsToTrimCount, trimPlants } from './trim-plants.js';
import { createSimulation, type SimulationState, type Plant } from '../state.js';
import { produce } from 'immer';
import type { TrimTargetSize } from './types.js';

describe('canTrimPlants', () => {
  function createStateWithPlants(plants: Plant[]): SimulationState {
    const state = createSimulation({ tankCapacity: 100 });
    return produce(state, (draft) => {
      draft.plants = plants;
    });
  }

  it('returns false when no plants exist', () => {
    const state = createStateWithPlants([]);
    expect(canTrimPlants(state)).toBe(false);
  });

  it('returns false when all plants are below 50%', () => {
    const state = createStateWithPlants([
      { id: 'p1', species: 'java_fern', size: 30 },
      { id: 'p2', species: 'anubias', size: 45 },
    ]);
    expect(canTrimPlants(state)).toBe(false);
  });

  it('returns false when largest plant is exactly 50%', () => {
    const state = createStateWithPlants([
      { id: 'p1', species: 'java_fern', size: 50 },
    ]);
    expect(canTrimPlants(state)).toBe(false);
  });

  it('returns true when any plant is above 50%', () => {
    const state = createStateWithPlants([
      { id: 'p1', species: 'java_fern', size: 51 },
    ]);
    expect(canTrimPlants(state)).toBe(true);
  });

  it('returns true when only one of multiple plants is above 50%', () => {
    const state = createStateWithPlants([
      { id: 'p1', species: 'java_fern', size: 30 },
      { id: 'p2', species: 'anubias', size: 75 },
      { id: 'p3', species: 'amazon_sword', size: 45 },
    ]);
    expect(canTrimPlants(state)).toBe(true);
  });

  it('returns true when plant is at 100%', () => {
    const state = createStateWithPlants([
      { id: 'p1', species: 'java_fern', size: 100 },
    ]);
    expect(canTrimPlants(state)).toBe(true);
  });

  it('returns true when plant is overgrown (>100%)', () => {
    const state = createStateWithPlants([
      { id: 'p1', species: 'java_fern', size: 150 },
    ]);
    expect(canTrimPlants(state)).toBe(true);
  });

  it('returns true when plant is extremely overgrown (200%)', () => {
    const state = createStateWithPlants([
      { id: 'p1', species: 'java_fern', size: 200 },
    ]);
    expect(canTrimPlants(state)).toBe(true);
  });
});

describe('getPlantsToTrimCount', () => {
  function createStateWithPlants(plants: Plant[]): SimulationState {
    const state = createSimulation({ tankCapacity: 100 });
    return produce(state, (draft) => {
      draft.plants = plants;
    });
  }

  it('returns 0 for no plants', () => {
    const state = createStateWithPlants([]);
    expect(getPlantsToTrimCount(state, 50)).toBe(0);
    expect(getPlantsToTrimCount(state, 85)).toBe(0);
    expect(getPlantsToTrimCount(state, 100)).toBe(0);
  });

  it('returns 0 when no plants exceed target', () => {
    const state = createStateWithPlants([
      { id: 'p1', species: 'java_fern', size: 40 },
      { id: 'p2', species: 'anubias', size: 30 },
    ]);
    expect(getPlantsToTrimCount(state, 50)).toBe(0);
  });

  it('counts plants above 50% target', () => {
    const state = createStateWithPlants([
      { id: 'p1', species: 'java_fern', size: 60 },
      { id: 'p2', species: 'anubias', size: 40 },
      { id: 'p3', species: 'amazon_sword', size: 80 },
    ]);
    expect(getPlantsToTrimCount(state, 50)).toBe(2);
  });

  it('counts plants above 85% target', () => {
    const state = createStateWithPlants([
      { id: 'p1', species: 'java_fern', size: 60 },
      { id: 'p2', species: 'anubias', size: 90 },
      { id: 'p3', species: 'amazon_sword', size: 100 },
    ]);
    expect(getPlantsToTrimCount(state, 85)).toBe(2);
  });

  it('counts plants above 100% target', () => {
    const state = createStateWithPlants([
      { id: 'p1', species: 'java_fern', size: 90 },
      { id: 'p2', species: 'anubias', size: 110 },
      { id: 'p3', species: 'amazon_sword', size: 150 },
    ]);
    expect(getPlantsToTrimCount(state, 100)).toBe(2);
  });

  it('does not count plants exactly at target', () => {
    const state = createStateWithPlants([
      { id: 'p1', species: 'java_fern', size: 85 },
    ]);
    expect(getPlantsToTrimCount(state, 85)).toBe(0);
  });

  it('different targets give different counts', () => {
    const state = createStateWithPlants([
      { id: 'p1', species: 'java_fern', size: 60 },
      { id: 'p2', species: 'anubias', size: 90 },
      { id: 'p3', species: 'amazon_sword', size: 120 },
    ]);
    expect(getPlantsToTrimCount(state, 50)).toBe(3);
    expect(getPlantsToTrimCount(state, 85)).toBe(2);
    expect(getPlantsToTrimCount(state, 100)).toBe(1);
  });
});

describe('trimPlants', () => {
  function createStateWithPlants(plants: Plant[]): SimulationState {
    const state = createSimulation({ tankCapacity: 100 });
    return produce(state, (draft) => {
      draft.plants = plants;
    });
  }

  describe('trimming to 50%', () => {
    it('trims plants above 50% to 50%', () => {
      const state = createStateWithPlants([
        { id: 'p1', species: 'java_fern', size: 80 },
        { id: 'p2', species: 'anubias', size: 100 },
      ]);
      const result = trimPlants(state, { type: 'trimPlants', targetSize: 50 });

      expect(result.state.plants[0].size).toBe(50);
      expect(result.state.plants[1].size).toBe(50);
    });

    it('does not change plants below 50%', () => {
      const state = createStateWithPlants([
        { id: 'p1', species: 'java_fern', size: 30 },
        { id: 'p2', species: 'anubias', size: 80 },
      ]);
      const result = trimPlants(state, { type: 'trimPlants', targetSize: 50 });

      expect(result.state.plants[0].size).toBe(30); // unchanged
      expect(result.state.plants[1].size).toBe(50); // trimmed
    });

    it('does not change plants exactly at 50%', () => {
      const state = createStateWithPlants([
        { id: 'p1', species: 'java_fern', size: 50 },
      ]);
      const result = trimPlants(state, { type: 'trimPlants', targetSize: 50 });

      expect(result.state.plants[0].size).toBe(50);
      expect(result.message).toContain('No plants above');
    });
  });

  describe('trimming to 85%', () => {
    it('trims plants above 85% to 85%', () => {
      const state = createStateWithPlants([
        { id: 'p1', species: 'java_fern', size: 120 },
        { id: 'p2', species: 'anubias', size: 90 },
      ]);
      const result = trimPlants(state, { type: 'trimPlants', targetSize: 85 });

      expect(result.state.plants[0].size).toBe(85);
      expect(result.state.plants[1].size).toBe(85);
    });

    it('leaves plants at or below 85% unchanged', () => {
      const state = createStateWithPlants([
        { id: 'p1', species: 'java_fern', size: 60 },
        { id: 'p2', species: 'anubias', size: 85 },
        { id: 'p3', species: 'amazon_sword', size: 110 },
      ]);
      const result = trimPlants(state, { type: 'trimPlants', targetSize: 85 });

      expect(result.state.plants[0].size).toBe(60); // unchanged
      expect(result.state.plants[1].size).toBe(85); // unchanged
      expect(result.state.plants[2].size).toBe(85); // trimmed
    });
  });

  describe('trimming to 100%', () => {
    it('trims overgrown plants to 100%', () => {
      const state = createStateWithPlants([
        { id: 'p1', species: 'java_fern', size: 150 },
        { id: 'p2', species: 'anubias', size: 200 },
      ]);
      const result = trimPlants(state, { type: 'trimPlants', targetSize: 100 });

      expect(result.state.plants[0].size).toBe(100);
      expect(result.state.plants[1].size).toBe(100);
    });

    it('leaves plants at or below 100% unchanged', () => {
      const state = createStateWithPlants([
        { id: 'p1', species: 'java_fern', size: 80 },
        { id: 'p2', species: 'anubias', size: 100 },
        { id: 'p3', species: 'amazon_sword', size: 130 },
      ]);
      const result = trimPlants(state, { type: 'trimPlants', targetSize: 100 });

      expect(result.state.plants[0].size).toBe(80); // unchanged
      expect(result.state.plants[1].size).toBe(100); // unchanged
      expect(result.state.plants[2].size).toBe(100); // trimmed
    });
  });

  describe('no-op when no plants need trimming', () => {
    it('returns unchanged state when no plants exist', () => {
      const state = createStateWithPlants([]);
      const result = trimPlants(state, { type: 'trimPlants', targetSize: 50 });

      expect(result.state.plants).toHaveLength(0);
      expect(result.message).toContain('No plants above');
    });

    it('returns unchanged state when all plants below target', () => {
      const state = createStateWithPlants([
        { id: 'p1', species: 'java_fern', size: 40 },
        { id: 'p2', species: 'anubias', size: 30 },
      ]);
      const result = trimPlants(state, { type: 'trimPlants', targetSize: 50 });

      expect(result.state.plants[0].size).toBe(40);
      expect(result.state.plants[1].size).toBe(30);
      expect(result.message).toContain('No plants above');
    });
  });

  describe('invalid target size handling', () => {
    it('rejects target size of 0', () => {
      const state = createStateWithPlants([
        { id: 'p1', species: 'java_fern', size: 80 },
      ]);
      const result = trimPlants(state, { type: 'trimPlants', targetSize: 0 as unknown as TrimTargetSize });

      expect(result.state.plants[0].size).toBe(80); // unchanged
      expect(result.message).toContain('Invalid target size');
    });

    it('rejects target size of 25', () => {
      const state = createStateWithPlants([
        { id: 'p1', species: 'java_fern', size: 80 },
      ]);
      const result = trimPlants(state, { type: 'trimPlants', targetSize: 25 as unknown as TrimTargetSize });

      expect(result.state.plants[0].size).toBe(80); // unchanged
      expect(result.message).toContain('Invalid target size');
    });

    it('rejects target size of 75', () => {
      const state = createStateWithPlants([
        { id: 'p1', species: 'java_fern', size: 80 },
      ]);
      const result = trimPlants(state, { type: 'trimPlants', targetSize: 75 as unknown as TrimTargetSize });

      expect(result.state.plants[0].size).toBe(80); // unchanged
      expect(result.message).toContain('Invalid target size');
    });

    it('rejects target size of 150', () => {
      const state = createStateWithPlants([
        { id: 'p1', species: 'java_fern', size: 200 },
      ]);
      const result = trimPlants(state, { type: 'trimPlants', targetSize: 150 as unknown as TrimTargetSize });

      expect(result.state.plants[0].size).toBe(200); // unchanged
      expect(result.message).toContain('Invalid target size');
    });

    it('only accepts 50, 85, and 100 as valid targets', () => {
      const state = createStateWithPlants([
        { id: 'p1', species: 'java_fern', size: 200 },
      ]);

      // Valid targets
      expect(trimPlants(state, { type: 'trimPlants', targetSize: 50 }).message).not.toContain('Invalid');
      expect(trimPlants(state, { type: 'trimPlants', targetSize: 85 }).message).not.toContain('Invalid');
      expect(trimPlants(state, { type: 'trimPlants', targetSize: 100 }).message).not.toContain('Invalid');
    });
  });

  describe('log entry creation', () => {
    it('creates log entry when trimming occurs', () => {
      const state = createStateWithPlants([
        { id: 'p1', species: 'java_fern', size: 80 },
      ]);
      const initialLogCount = state.logs.length;
      const result = trimPlants(state, { type: 'trimPlants', targetSize: 50 });

      expect(result.state.logs.length).toBe(initialLogCount + 1);
    });

    it('log entry contains correct information', () => {
      const state = createStateWithPlants([
        { id: 'p1', species: 'java_fern', size: 100 },
        { id: 'p2', species: 'anubias', size: 80 },
      ]);
      const result = trimPlants(state, { type: 'trimPlants', targetSize: 50 });

      const lastLog = result.state.logs[result.state.logs.length - 1];
      expect(lastLog.source).toBe('user');
      expect(lastLog.severity).toBe('info');
      expect(lastLog.message).toContain('Trimmed');
      expect(lastLog.message).toContain('2 plant(s)');
      expect(lastLog.message).toContain('50%');
    });

    it('log entry shows total amount removed', () => {
      const state = createStateWithPlants([
        { id: 'p1', species: 'java_fern', size: 100 }, // removes 50%
        { id: 'p2', species: 'anubias', size: 80 }, // removes 30%
      ]);
      const result = trimPlants(state, { type: 'trimPlants', targetSize: 50 });

      const lastLog = result.state.logs[result.state.logs.length - 1];
      expect(lastLog.message).toContain('80% total removed'); // 50 + 30 = 80
    });

    it('does not create log entry when no trimming needed', () => {
      const state = createStateWithPlants([
        { id: 'p1', species: 'java_fern', size: 40 },
      ]);
      const initialLogCount = state.logs.length;
      const result = trimPlants(state, { type: 'trimPlants', targetSize: 50 });

      expect(result.state.logs.length).toBe(initialLogCount);
    });

    it('does not create log entry for invalid target', () => {
      const state = createStateWithPlants([
        { id: 'p1', species: 'java_fern', size: 80 },
      ]);
      const initialLogCount = state.logs.length;
      const result = trimPlants(state, { type: 'trimPlants', targetSize: 25 as unknown as TrimTargetSize });

      expect(result.state.logs.length).toBe(initialLogCount);
    });
  });

  describe('message content', () => {
    it('returns success message with count when trimmed', () => {
      const state = createStateWithPlants([
        { id: 'p1', species: 'java_fern', size: 100 },
      ]);
      const result = trimPlants(state, { type: 'trimPlants', targetSize: 50 });

      expect(result.message).toBe('Trimmed 1 plant(s) to 50%');
    });

    it('returns correct count for multiple plants', () => {
      const state = createStateWithPlants([
        { id: 'p1', species: 'java_fern', size: 100 },
        { id: 'p2', species: 'anubias', size: 90 },
        { id: 'p3', species: 'amazon_sword', size: 60 },
      ]);
      const result = trimPlants(state, { type: 'trimPlants', targetSize: 85 });

      expect(result.message).toBe('Trimmed 2 plant(s) to 85%');
    });
  });

  describe('immutability', () => {
    it('does not modify original state', () => {
      const state = createStateWithPlants([
        { id: 'p1', species: 'java_fern', size: 100 },
      ]);
      const originalSize = state.plants[0].size;

      trimPlants(state, { type: 'trimPlants', targetSize: 50 });

      expect(state.plants[0].size).toBe(originalSize);
    });

    it('returns new state object', () => {
      const state = createStateWithPlants([
        { id: 'p1', species: 'java_fern', size: 100 },
      ]);
      const result = trimPlants(state, { type: 'trimPlants', targetSize: 50 });

      expect(result.state).not.toBe(state);
    });
  });
});

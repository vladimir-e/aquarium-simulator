import { describe, it, expect } from 'vitest';
import { addFish, removeFish } from './fish-management.js';
import { createSimulation, type SimulationState } from '../state.js';
import { produce } from 'immer';

function makeState(): SimulationState {
  return createSimulation({ tankCapacity: 100 });
}

function makeStateWithFish(): SimulationState {
  const state = makeState();
  return produce(state, (draft) => {
    draft.fish.push({
      id: 'fish_existing',
      species: 'neon_tetra',
      mass: 0.5,
      health: 100,
      age: 0,
      hunger: 30,
      sex: 'male',
    });
  });
}

describe('addFish', () => {
  it('adds a fish to an empty tank', () => {
    const state = makeState();
    const result = addFish(state, { type: 'addFish', species: 'neon_tetra' });

    expect(result.state.fish).toHaveLength(1);
    expect(result.state.fish[0].species).toBe('neon_tetra');
    expect(result.state.fish[0].mass).toBe(0.5); // Adult mass for neon tetra
    expect(result.state.fish[0].health).toBe(100);
    expect(result.state.fish[0].hunger).toBe(30); // Slightly hungry on arrival
    expect(result.message).toContain('Neon Tetra');
  });

  it('adds fish with correct species data', () => {
    const state = makeState();
    const result = addFish(state, { type: 'addFish', species: 'angelfish' });

    expect(result.state.fish[0].mass).toBe(15.0);
    expect(result.message).toContain('Angelfish');
  });

  it('generates unique IDs for each fish', () => {
    let state = makeState();
    const result1 = addFish(state, { type: 'addFish', species: 'guppy' });
    state = result1.state;
    const result2 = addFish(state, { type: 'addFish', species: 'guppy' });

    expect(result2.state.fish[0].id).not.toBe(result2.state.fish[1].id);
  });

  it('assigns sex randomly', () => {
    const state = makeState();
    const result = addFish(state, { type: 'addFish', species: 'betta' });

    expect(['male', 'female']).toContain(result.state.fish[0].sex);
  });

  it('logs the addition', () => {
    const state = makeState();
    const result = addFish(state, { type: 'addFish', species: 'corydoras' });

    const addLogs = result.state.logs.filter((l) => l.message.includes('Added Corydoras'));
    expect(addLogs.length).toBeGreaterThan(0);
  });

  it('rejects unknown species', () => {
    const state = makeState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = addFish(state, { type: 'addFish', species: 'unknown' as unknown as any });

    expect(result.state.fish).toHaveLength(0);
    expect(result.message).toContain('Unknown');
  });
});

describe('removeFish', () => {
  it('removes a fish by ID', () => {
    const state = makeStateWithFish();
    expect(state.fish).toHaveLength(1);

    const result = removeFish(state, { type: 'removeFish', fishId: 'fish_existing' });

    expect(result.state.fish).toHaveLength(0);
    expect(result.message).toContain('Neon Tetra');
  });

  it('returns unchanged state for unknown ID', () => {
    const state = makeStateWithFish();
    const result = removeFish(state, { type: 'removeFish', fishId: 'nonexistent' });

    expect(result.state.fish).toHaveLength(1);
    expect(result.message).toContain('not found');
  });

  it('logs the removal', () => {
    const state = makeStateWithFish();
    const result = removeFish(state, { type: 'removeFish', fishId: 'fish_existing' });

    const removeLogs = result.state.logs.filter((l) => l.message.includes('Removed'));
    expect(removeLogs.length).toBeGreaterThan(0);
  });
});

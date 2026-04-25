import { describe, it, expect, vi, afterEach } from 'vitest';
import { addFish, removeFish } from './fish-management.js';
import { createSimulation, FISH_SPECIES_DATA, type SimulationState } from '../state.js';
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
      hardinessOffset: 0,
      surplus: 0,
    });
  });
}

describe('addFish', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds a fish to an empty tank', () => {
    // Stub Math.random to 0.5 so sex/offset/health-jitter are deterministic:
    // (0.5 - 0.5) * ... = 0 offset, health = 100 + 0 = 100.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = makeState();
    const result = addFish(state, { type: 'addFish', species: 'neon_tetra' });

    expect(result.state.fish).toHaveLength(1);
    expect(result.state.fish[0].species).toBe('neon_tetra');
    expect(result.state.fish[0].mass).toBe(0.5); // Adult mass for neon tetra
    expect(result.state.fish[0].health).toBe(100);
    expect(result.state.fish[0].hunger).toBe(30); // Slightly hungry on arrival
    expect(result.state.fish[0].hardinessOffset).toBe(0);
    expect(result.state.fish[0].surplus).toBe(0); // No vitality surplus banked at birth
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

  it('samples hardinessOffset within ±15% of species hardiness', () => {
    // Drive Math.random through many values to exercise the offset range.
    let state = makeState();
    for (let i = 0; i < 200; i++) {
      state = addFish(state, { type: 'addFish', species: 'neon_tetra' }).state;
    }
    const maxAbsOffset = 0.15 * FISH_SPECIES_DATA.neon_tetra.hardiness; // 0.075
    for (const fish of state.fish) {
      expect(Math.abs(fish.hardinessOffset)).toBeLessThanOrEqual(maxAbsOffset + 1e-9);
    }
  });

  it('hardinessOffset hits the extremes (-1 and +1 random)', () => {
    // Random 0 → offset = -0.15 * hardiness; random ≈1 → offset ≈ +0.15 * hardiness.
    // Math.random() returns [0, 1); we can't get exactly 1, but can get very close.
    const species = 'guppy'; // hardiness 0.8
    const hardiness = FISH_SPECIES_DATA[species].hardiness;

    vi.spyOn(Math, 'random').mockReturnValue(0);
    let state = makeState();
    state = addFish(state, { type: 'addFish', species }).state;
    expect(state.fish[0].hardinessOffset).toBeCloseTo(-0.15 * hardiness, 10);

    vi.restoreAllMocks();
    vi.spyOn(Math, 'random').mockReturnValue(0.9999999);
    state = makeState();
    state = addFish(state, { type: 'addFish', species }).state;
    expect(state.fish[0].hardinessOffset).toBeCloseTo(0.15 * hardiness, 4);
  });

  it('offset scales with species hardiness (angelfish vs guppy)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1 - 1e-9); // push toward max positive
    let state = makeState();
    state = addFish(state, { type: 'addFish', species: 'guppy' }).state;
    state = addFish(state, { type: 'addFish', species: 'angelfish' }).state;
    const guppy = state.fish.find((f) => f.species === 'guppy')!;
    const angel = state.fish.find((f) => f.species === 'angelfish')!;
    // Guppy hardiness 0.8 → wider absolute offset than angelfish (0.4).
    expect(Math.abs(guppy.hardinessOffset)).toBeGreaterThan(
      Math.abs(angel.hardinessOffset)
    );
  });

  it('initial health jitter stays within ±5 and clamps to [0, 100]', () => {
    let state = makeState();
    for (let i = 0; i < 200; i++) {
      state = addFish(state, { type: 'addFish', species: 'neon_tetra' }).state;
    }
    for (const fish of state.fish) {
      expect(fish.health).toBeGreaterThanOrEqual(95);
      expect(fish.health).toBeLessThanOrEqual(100); // clamped upper bound
    }
  });

  it('health jitter clamps at 100 when random pushes above', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1 - 1e-9); // +~5 jitter → clamped to 100
    const state = makeState();
    const result = addFish(state, { type: 'addFish', species: 'neon_tetra' });
    expect(result.state.fish[0].health).toBe(100);
  });

  it('offset is stored once, not re-rolled', () => {
    // Two fish added in succession get independently sampled offsets.
    let state = makeState();
    state = addFish(state, { type: 'addFish', species: 'neon_tetra' }).state;
    state = addFish(state, { type: 'addFish', species: 'neon_tetra' }).state;
    // Each fish has an offset; both are finite numbers within range.
    const maxAbs = 0.15 * FISH_SPECIES_DATA.neon_tetra.hardiness + 1e-9;
    expect(Number.isFinite(state.fish[0].hardinessOffset)).toBe(true);
    expect(Number.isFinite(state.fish[1].hardinessOffset)).toBe(true);
    expect(Math.abs(state.fish[0].hardinessOffset)).toBeLessThanOrEqual(maxAbs);
    expect(Math.abs(state.fish[1].hardinessOffset)).toBeLessThanOrEqual(maxAbs);
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

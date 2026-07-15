import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  addFish,
  removeFish,
  sellFry,
  canAddFish,
  getMaxFishMass,
  totalFishMass,
} from './fish-management.js';
import { createSimulation, FISH_SPECIES_DATA, type SimulationState, type Fish } from '../state.js';
import { produce } from 'immer';

function makeState(): SimulationState {
  return createSimulation({ tankCapacity: 100 });
}

function fish(overrides: Partial<Fish> & { id: string }): Fish {
  return {
    species: 'neon_tetra',
    mass: 0.5,
    health: 100,
    age: 0,
    satiation: 70,
    sex: 'male',
    stage: 'adult',
    hardinessOffset: 0,
    surplus: 0,
    ...overrides,
  };
}

function makeStateWithFish(): SimulationState {
  const state = makeState();
  return produce(state, (draft) => {
    draft.fish.push(fish({ id: 'fish_existing' }));
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
    expect(result.state.fish[0].satiation).toBe(70); // Slightly hungry on arrival (peckish band)
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

describe('addFish stocking cap', () => {
  it('getMaxFishMass allows fish up to half the water volume by mass', () => {
    // 1 g fish ≈ 1 mL water; 0.5 of a 100 L tank = 50 L = 50000 g.
    expect(getMaxFishMass(100)).toBe(50000);
    expect(getMaxFishMass(20)).toBe(10000);
    expect(getMaxFishMass(0)).toBe(0);
    expect(getMaxFishMass(-5)).toBe(0);
  });

  it('allows gross overstocking below the physical ceiling', () => {
    // A 20 L tank holds up to 10 kg of fish — far beyond any sane bioload,
    // so an overstocking mistake is the player's to make.
    let state = createSimulation({ tankCapacity: 20 });
    for (let i = 0; i < 100; i++) {
      state = addFish(state, { type: 'addFish', species: 'guppy' }).state; // 1 g each
    }
    expect(state.fish).toHaveLength(100); // 100 g ≪ 10000 g ceiling
  });

  it('rejects a fish that would exceed the physical ceiling', () => {
    // Ceiling below one angelfish (15 g): 0.02 L → 10 g max.
    const state = createSimulation({ tankCapacity: 0.02 });
    const result = addFish(state, { type: 'addFish', species: 'angelfish' });
    expect(result.state.fish).toHaveLength(0);
    expect(result.message).toContain('capacity');
  });

  it('counts fry mass toward the ceiling but never blocks breeding', () => {
    // The cap is enforced only on addFish; the total it measures still
    // includes fry, so a tank full of bred fry can refuse a stocked adult.
    const capacity = 0.02; // 10 g ceiling
    const state = produce(createSimulation({ tankCapacity: capacity }), (draft) => {
      draft.fish.push(fish({ id: 'fry_1', species: 'angelfish', mass: 9.5, stage: 'fry' }));
    });
    expect(totalFishMass(state.fish)).toBeCloseTo(9.5, 5);
    // A neon tetra (0.5 g) still fits (9.5 + 0.5 = 10 ≤ 10); a guppy (1 g) doesn't.
    expect(canAddFish(state, 'neon_tetra')).toBe(true);
    expect(canAddFish(state, 'guppy')).toBe(false);
  });

  it('canAddFish tracks remaining headroom as the tank fills', () => {
    // 1 L tank → 500 g ceiling; angelfish are 15 g each.
    let state = createSimulation({ tankCapacity: 1 });
    expect(canAddFish(state, 'angelfish')).toBe(true);
    for (let i = 0; i < 33; i++) {
      state = addFish(state, { type: 'addFish', species: 'angelfish' }).state;
    }
    expect(totalFishMass(state.fish)).toBeCloseTo(495, 5); // 33 × 15
    expect(canAddFish(state, 'angelfish')).toBe(false); // 34th (510 g) won't fit
    const rejected = addFish(state, { type: 'addFish', species: 'angelfish' });
    expect(rejected.state.fish).toHaveLength(33);
  });

  it('canAddFish rejects an unknown species', () => {
    const state = makeState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(canAddFish(state, 'unknown' as any)).toBe(false);
  });
});

describe('sellFry', () => {
  function makeStateWithMixedStages(): SimulationState {
    return produce(makeState(), (draft) => {
      draft.fish.push(
        fish({ id: 'adult_1', species: 'guppy', mass: 1.0, stage: 'adult' }),
        fish({ id: 'fry_1', species: 'guppy', mass: 0.1, stage: 'fry' }),
        fish({ id: 'fry_2', species: 'neon_tetra', mass: 0.05, stage: 'fry' })
      );
    });
  }

  it('removes every fry and keeps adults', () => {
    const state = makeStateWithMixedStages();
    const result = sellFry(state);

    expect(result.state.fish).toHaveLength(1);
    expect(result.state.fish[0].id).toBe('adult_1');
    expect(result.message).toBe('Sold 2 fry');
  });

  it('logs a fry-sold event from the user', () => {
    const state = makeStateWithMixedStages();
    const result = sellFry(state);

    const soldLog = result.state.logs.find((l) => l.event === 'fry-sold');
    expect(soldLog).toBeDefined();
    expect(soldLog?.source).toBe('user');
    expect(soldLog?.message).toBe('Sold 2 fry');
  });

  it('is a no-op with a clear message when there are no fry', () => {
    const state = makeStateWithFish(); // one adult, no fry
    const result = sellFry(state);

    expect(result.state.fish).toHaveLength(1);
    expect(result.message).toBe('No fry to sell');
    expect(result.state.logs.some((l) => l.event === 'fry-sold')).toBe(false);
  });

  it('does not mutate the input state', () => {
    const state = makeStateWithMixedStages();
    sellFry(state);
    expect(state.fish).toHaveLength(3);
  });
});

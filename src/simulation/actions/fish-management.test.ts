import { describe, it, expect } from 'vitest';
import {
  addFish,
  removeFish,
  sellFry,
  canAddFish,
  checkFishCapacity,
  getMaxFishMass,
  stockedMass,
  totalFishMass,
} from './fish-management.js';
import { MAX_STOCKED_SIZE, STOCKED_FISH_SIZE } from '../livestock/create-fish.js';
import { fishMass, fishSize } from '../systems/fish-body.js';
import { createSimulation, type SimulationState, type Fish } from '../state.js';
import type { FishSpecies } from '../livestock/species.js';
import { produce } from 'immer';
import { fishRecord } from '../tests/fish.js';

function makeState(rngSeed = 31337): SimulationState {
  return createSimulation({ tankCapacity: 100 }, undefined, rngSeed);
}

function stockedRoster(species: FishSpecies, count: number, rngSeed?: number): Fish[] {
  let state = makeState(rngSeed);
  for (let i = 0; i < count; i++) {
    state = addFish(state, { type: 'addFish', species }).state;
  }
  return state.fish;
}

function makeStateWithFish(): SimulationState {
  const state = makeState();
  return produce(state, (draft) => {
    draft.fish.push(fishRecord({ id: 'fish_existing' }));
  });
}

describe('addFish', () => {
  it('adds a fish to an empty tank', () => {
    const state = makeState();
    const result = addFish(state, { type: 'addFish', species: 'neon_tetra' });

    expect(result.state.fish).toHaveLength(1);
    expect(result.state.fish[0].species).toBe('neon_tetra');
    expect(fishMass(result.state.fish[0])).toBe(stockedMass('neon_tetra', STOCKED_FISH_SIZE));
    expect(result.message).toContain('Neon Tetra');
  });

  it('stocks a fish at the size it names, as that share of grown length', () => {
    const [fish] = addFish(makeState(), { type: 'addFish', species: 'guppy', size: 40 }).state.fish;

    expect(fishSize(fish)).toBeGreaterThanOrEqual(40);
    expect(fishSize(fish)).toBeLessThan(40.1);
    expect(fishMass(fish)).toBe(stockedMass('guppy', 40));
  });

  it('refuses a size smaller than a fry or bigger than a shop sells', () => {
    for (const size of [0.1, MAX_STOCKED_SIZE + 1, 101, Number.NaN]) {
      const result = addFish(makeState(), { type: 'addFish', species: 'guppy', size });
      expect(result.state.fish).toHaveLength(0);
    }
  });

  it('stocks the same fish from one rng seed, and a different one from another', () => {
    expect(stockedRoster('guppy', 3, 4242)).toEqual(stockedRoster('guppy', 3, 4242));
    expect(stockedRoster('guppy', 3, 4242)).not.toEqual(stockedRoster('guppy', 3, 99));
  });

  it('spends the stream it draws from', () => {
    const state = makeState();
    const stocked = addFish(state, { type: 'addFish', species: 'guppy' }).state;

    expect(stocked.rng.seed).toBe(state.rng.seed);
    expect(stocked.rng.counter).toBeGreaterThan(state.rng.counter);
  });

  it('leaves the stream alone when it rejects the fish', () => {
    const state = makeState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = addFish(state, { type: 'addFish', species: 'unknown' as unknown as any });

    expect(result.state.rng).toEqual(state.rng);
  });

  it('generates unique IDs for each fish', () => {
    let state = makeState();
    const result1 = addFish(state, { type: 'addFish', species: 'guppy' });
    state = result1.state;
    const result2 = addFish(state, { type: 'addFish', species: 'guppy' });

    expect(result2.state.fish[0].id).not.toBe(result2.state.fish[1].id);
  });

  it('assigns sex randomly', () => {
    const sexes = new Set(stockedRoster('betta', 20).map((f) => f.sex));

    expect(sexes).toEqual(new Set(['male', 'female']));
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

  it('takes the brood she carries with her, and leaves the rest', () => {
    const state = produce(makeStateWithFish(), (draft) => {
      draft.clutches = [
        { id: 'hers', species: 'guppy', eggs: 10, development: 0.4, motherId: 'fish_existing' },
        { id: 'laid', species: 'neon_tetra', eggs: 20, development: 0.4 },
      ];
    });
    const result = removeFish(state, { type: 'removeFish', fishId: 'fish_existing' });
    expect(result.state.clutches.map((c) => c.id)).toEqual(['laid']);
  });

  it('logs the removal', () => {
    const state = makeStateWithFish();
    const result = removeFish(state, { type: 'removeFish', fishId: 'fish_existing' });

    const removeLogs = result.state.logs.filter((l) => l.message.includes('Removed'));
    expect(removeLogs.length).toBeGreaterThan(0);
  });
});

describe('addFish stocking cap', () => {
  it('getMaxFishMass scales with the tank and is zero without one', () => {
    expect(getMaxFishMass(100)).toBeGreaterThan(0);
    expect(getMaxFishMass(100)).toBe(5 * getMaxFishMass(20));
    expect(getMaxFishMass(0)).toBe(0);
    expect(getMaxFishMass(-5)).toBe(0);
  });

  it('counts every fish, fry included, against the ceiling', () => {
    const resident = fishRecord({ id: 'fry_1', species: 'angelfish', size: 20 });
    const guppy = stockedMass('guppy', STOCKED_FISH_SIZE);
    const tank = (room: number): SimulationState =>
      produce(createSimulation({ tankCapacity: (fishMass(resident) + room) / getMaxFishMass(1) }), (draft) => {
        draft.fish.push(resident);
      });

    expect(totalFishMass(tank(guppy).fish)).toBe(fishMass(resident));
    expect(canAddFish(tank(guppy * 1.001), 'guppy')).toBe(true);
    expect(canAddFish(tank(guppy * 0.999), 'guppy')).toBe(false);
  });

  it('weighs a small fish at its stocked size', () => {
    const resident = fishRecord({ id: 'resident', species: 'angelfish', size: 20 });
    const capacityFor = (room: number): number => (fishMass(resident) + room) / getMaxFishMass(1);
    const half = stockedMass('guppy', 50);

    expect(checkFishCapacity([resident], capacityFor(1.01 * half), 'guppy').ok).toBe(false);
    expect(checkFishCapacity([resident], capacityFor(1.01 * half), 'guppy', 50).ok).toBe(true);
    expect(checkFishCapacity([resident], capacityFor(0.99 * half), 'guppy', 50).ok).toBe(false);
  });

  it('rejects a fish that would exceed the physical ceiling', () => {
    const state = createSimulation({ tankCapacity: 0.02 });
    const result = addFish(state, { type: 'addFish', species: 'angelfish' });
    expect(result.state.fish).toHaveLength(0);
    expect(result.message).toContain('capacity');
  });

  it('refuses an unstockable size before weighing it, as addFish does', () => {
    const state = makeState();
    for (const size of [-50, 0.1, MAX_STOCKED_SIZE + 1, Number.NaN]) {
      const check = checkFishCapacity(state.fish, state.tank.capacity, 'guppy', size);
      const added = addFish(state, { type: 'addFish', species: 'guppy', size });

      expect(canAddFish(state, 'guppy', size)).toBe(false);
      expect(check.ok).toBe(false);
      expect(check.message).toBe(added.message);
    }
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
        fishRecord({ id: 'adult_1', species: 'guppy', size: 80 }),
        fishRecord({ id: 'fry_1', species: 'guppy', size: 20 }),
        fishRecord({ id: 'fry_2', species: 'neon_tetra', size: 20 })
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

  it('takes out a sold mother’s brood with her, and leaves the adults’', () => {
    const state = produce(makeStateWithMixedStages(), (draft) => {
      draft.clutches = [
        { id: 'fry-mother', species: 'guppy', eggs: 4, development: 0.3, motherId: 'fry_1' },
        { id: 'adult-mother', species: 'guppy', eggs: 12, development: 0.3, motherId: 'adult_1' },
      ];
    });
    expect(sellFry(state).state.clutches.map((c) => c.id)).toEqual(['adult-mother']);
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
    const state = makeStateWithFish();
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

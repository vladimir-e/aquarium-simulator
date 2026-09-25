import { describe, it, expect } from 'vitest';
import {
  addFish,
  removeFish,
  sellFry,
  canAddFish,
  getMaxFishMass,
  totalFishMass,
} from './fish-management.js';
import { createSimulation, type SimulationState, type Fish } from '../state.js';
import { computeFishVitality } from '../systems/fish-health.js';
import { livestockDefaults } from '../config/livestock.js';
import { FISH_SPECIES_DATA, type FishSpecies } from '../livestock/species.js';
import { produce } from 'immer';

function makeState(rngSeed = 31337): SimulationState {
  return createSimulation({ tankCapacity: 100 }, undefined, rngSeed);
}

/** Stock `count` of a species into a fresh tank and hand back the roster. */
function stockedRoster(species: FishSpecies, count: number, rngSeed?: number): Fish[] {
  let state = makeState(rngSeed);
  for (let i = 0; i < count; i++) {
    state = addFish(state, { type: 'addFish', species }).state;
  }
  return state.fish;
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
  it('adds a fish to an empty tank', () => {
    const state = makeState();
    const result = addFish(state, { type: 'addFish', species: 'neon_tetra' });

    expect(result.state.fish).toHaveLength(1);
    expect(result.state.fish[0].species).toBe('neon_tetra');
    expect(result.state.fish[0].mass).toBe(FISH_SPECIES_DATA.neon_tetra.adultMass);
    expect(result.message).toContain('Neon Tetra');
  });

  it('stocks a fish already grown, at the age its species matures', () => {
    const state = makeState();
    const result = addFish(state, { type: 'addFish', species: 'guppy' });

    expect(result.state.fish[0].stage).toBe('adult');
    expect(result.state.fish[0].age).toBe(FISH_SPECIES_DATA.guppy.breeding.maturityAge);
  });

  it('stocks it part-lived: old age is maxAge − maturityAge away, not maxAge', () => {
    const { maxAge, breeding } = FISH_SPECIES_DATA.neon_tetra;
    const state = addFish(makeState(), { type: 'addFish', species: 'neon_tetra' }).state;
    const [bought] = state.fish;
    const ageStressIn = (hours: number): number =>
      computeFishVitality(
        { ...bought, age: bought.age + hours },
        state.resources,
        state.plants,
        state.resources.water,
        state.tank.capacity,
        livestockDefaults
      ).breakdown.stressors.find((s) => s.key === 'age')?.amount ?? 0;

    // The arrival age is not cosmetic: every hour of it is an hour off the far
    // end, so a bought fish meets old age a whole maturity before one born in
    // the tank the day it was bought.
    const left = maxAge - breeding.maturityAge;
    expect(ageStressIn(left)).toBe(0);
    expect(ageStressIn(left + 1)).toBeGreaterThan(0);
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
    const capacity = 1;
    const ceiling = getMaxFishMass(capacity);
    const { adultMass } = FISH_SPECIES_DATA.guppy;
    const filled = (mass: number): SimulationState =>
      produce(createSimulation({ tankCapacity: capacity }), (draft) => {
        draft.fish.push(fish({ id: 'fry_1', species: 'angelfish', mass, stage: 'fry' }));
      });

    expect(totalFishMass(filled(3).fish)).toBe(3);
    expect(canAddFish(filled(ceiling - adultMass), 'guppy')).toBe(true);
    expect(canAddFish(filled(ceiling - adultMass + 0.01), 'guppy')).toBe(false);
    expect(addFish(filled(ceiling), { type: 'addFish', species: 'guppy' }).state.fish).toHaveLength(1);
  });

  it('rejects a fish that would exceed the physical ceiling', () => {
    // Ceiling below one angelfish (15 g): 0.02 L → 10 g max.
    const state = createSimulation({ tankCapacity: 0.02 });
    const result = addFish(state, { type: 'addFish', species: 'angelfish' });
    expect(result.state.fish).toHaveLength(0);
    expect(result.message).toContain('capacity');
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

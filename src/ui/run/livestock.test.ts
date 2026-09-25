import { describe, it, expect } from 'vitest';
import type { Clutch, Fish, SimulationState } from '../../simulation/index.js';
import { applyAction, createSimulation, FISH_SPECIES_DATA } from '../../simulation/index.js';
import { livestockDefaults } from '../../simulation/config/livestock.js';
import {
  bandStatus,
  groupBySpecies,
  groupFry,
  hungerOf,
  isHungryBand,
  rosterSummary,
} from './livestock';

function makeFish(overrides: Partial<Fish> & { id: string }): Fish {
  return {
    species: 'neon_tetra',
    mass: 0.5,
    health: 100,
    age: 0,
    satiation: 90,
    sex: 'male',
    stage: 'adult',
    hardinessOffset: 0,
    surplus: 0,
    ...overrides,
  };
}

function tank(fish: Fish[], clutches: Clutch[] = [], tick = 0): SimulationState {
  return { ...createSimulation({ tankCapacity: 200 }), fish, clutches, tick };
}

describe('bandStatus / isHungryBand', () => {
  it('maps bands onto the status vocabulary', () => {
    expect(bandStatus('wellFed')).toBe('ok');
    expect(bandStatus('peckish')).toBe('neutral');
    expect(bandStatus('hungry')).toBe('warn');
    expect(bandStatus('overfed')).toBe('warn');
    expect(bandStatus('starving')).toBe('alert');
  });

  it('counts only hungry and starving as hungry', () => {
    expect(isHungryBand('hungry')).toBe(true);
    expect(isHungryBand('starving')).toBe(true);
    expect(isHungryBand('peckish')).toBe(false);
    expect(isHungryBand('wellFed')).toBe(false);
  });
});

describe('hungerOf', () => {
  it('tallies fish in the hungry and starving bands, fry included', () => {
    const fish = [
      makeFish({ id: 'a', satiation: 90 }),
      makeFish({ id: 'b', satiation: 60 }),
      makeFish({ id: 'c', satiation: 40 }),
      makeFish({ id: 'd', satiation: 10, stage: 'fry', age: 24 }),
    ];
    expect(hungerOf(fish, livestockDefaults)).toEqual({ count: 2, band: 'starving' });
  });

  it('reads the worst band present, not the first one found', () => {
    const fish = [makeFish({ id: 'a', satiation: 40 }), makeFish({ id: 'b', satiation: 40 })];
    expect(hungerOf(fish, livestockDefaults)).toEqual({ count: 2, band: 'hungry' });
  });

  it('is null when nothing is hungry', () => {
    expect(hungerOf([makeFish({ id: 'a', satiation: 90 })], livestockDefaults)).toBeNull();
  });
});

describe('groupBySpecies', () => {
  it('folds adults into per-species rows and excludes fry', () => {
    const fish = [
      makeFish({ id: 'n1', species: 'neon_tetra', satiation: 80 }),
      makeFish({ id: 'n2', species: 'neon_tetra', satiation: 40 }),
      makeFish({ id: 'g1', species: 'guppy', satiation: 90 }),
      makeFish({ id: 'f1', species: 'neon_tetra', stage: 'fry', age: 24 }),
    ];
    const groups = groupBySpecies(tank(fish), livestockDefaults);
    expect(groups.map((g) => g.species)).toEqual(['neon_tetra', 'guppy']);
    const neon = groups[0];
    expect(neon.count).toBe(2);
    expect(neon.satiation).toBe(60);
    expect(neon.hunger).toEqual({ count: 1, band: 'hungry' });
    expect(neon.name).toBe(FISH_SPECIES_DATA.neon_tetra.name);
  });

  it('keeps a starving fish visible behind a calm average', () => {
    const fish = [
      makeFish({ id: 'a', satiation: 100 }),
      makeFish({ id: 'b', satiation: 0 }),
    ];
    const [neon] = groupBySpecies(tank(fish), livestockDefaults);

    expect(neon.satiation).toBe(50);
    expect(bandStatus(neon.band)).toBe('neutral');
    expect(neon.hunger).toEqual({ count: 1, band: 'starving' });
  });

  it('sums the group’s mass but averages its age and condition', () => {
    const fish = [
      makeFish({ id: 'a', mass: 0.4, age: 24 * 10, health: 90, satiation: 80 }),
      makeFish({ id: 'b', mass: 0.9, age: 24 * 20, health: 60, satiation: 80 }),
      makeFish({ id: 'c', mass: 1.1, age: 24 * 33, health: 30, satiation: 80 }),
    ];
    const [neon] = groupBySpecies(tank(fish), livestockDefaults);

    expect(neon.massG).toBeCloseTo(2.4, 10);
    expect(neon.ageDays).toBe(21);
    expect(neon.condition).toBeCloseTo(60, 10);
  });

  it('reads a bought fish at the age it arrives, which is not day zero', () => {
    const bought = applyAction(createSimulation({ tankCapacity: 200 }), {
      type: 'addFish',
      species: 'neon_tetra',
    }).state;
    const [neon] = groupBySpecies(bought, livestockDefaults);

    expect(neon.ageDays).toBeGreaterThan(0);
    expect(neon.ageDays).toBe(FISH_SPECIES_DATA.neon_tetra.breeding.maturityAge / 24);
  });
});

describe('groupFry', () => {
  it('folds every fry in the tank into one batch, whatever they are', () => {
    const fish = [
      makeFish({ id: 'f1', species: 'guppy', stage: 'fry', age: 24, mass: 0.03 }),
      makeFish({ id: 'f2', species: 'betta', stage: 'fry', age: 72, mass: 0.09 }),
      makeFish({ id: 'a1', species: 'guppy', stage: 'adult', mass: 1 }),
    ];
    const batch = groupFry(tank(fish), livestockDefaults)!;

    expect(batch.count).toBe(2);
    expect(batch.species).toEqual(['guppy', 'betta']);
    expect(batch.massG).toBeCloseTo(0.12, 10);
    expect(batch.ageDays).toBe(2);
  });

  it('gives the batch the same satiation and condition figures a species row gets', () => {
    const fish = [
      makeFish({ id: 'f1', species: 'guppy', stage: 'fry', satiation: 80, health: 90 }),
      makeFish({ id: 'f2', species: 'guppy', stage: 'fry', satiation: 10, health: 50 }),
    ];
    const batch = groupFry(tank(fish), livestockDefaults)!;

    expect(batch.satiation).toBe(45);
    expect(batch.condition).toBe(70);
    expect(batch.hunger).toEqual({ count: 1, band: 'starving' });
  });

  it('has nothing to sell where nothing is growing out', () => {
    expect(groupFry(tank([makeFish({ id: 'a' })]), livestockDefaults)).toBeNull();
  });
});

describe('the reading behind a fish', () => {
  function poisoned(fish: Fish[], ppm: number): SimulationState {
    const state = tank(fish);
    return { ...state, resources: { ...state.resources, ammonia: ppm * state.resources.water } };
  }

  it('reads a fish across every channel it keeps, not just its condition', () => {
    const state = tank([makeFish({ id: 'a', health: 100, satiation: 5 })]);
    const [group] = groupBySpecies(state, livestockDefaults);

    expect(group.members[0].reading).toEqual({ status: 'alert', word: 'starving' });
  });

  it('leaves a thriving fish alone, bank or no bank', () => {
    const state = tank([makeFish({ id: 'a', health: 100, surplus: 5 })]);
    const [group] = groupBySpecies(state, livestockDefaults);

    expect(group.members[0].reading).toEqual({ status: 'ok', word: 'thriving' });
  });

  it('gives every member its own reading, so the group cannot hide one', () => {
    const state = poisoned(
      [
        makeFish({ id: 'fish_a_1', health: 100, satiation: 90 }),
        makeFish({ id: 'fish_a_2', health: 100, satiation: 2 }),
      ],
      20
    );
    const [group] = groupBySpecies(state, livestockDefaults);

    expect(group.condition).toBe(100);
    expect(group.members.map((member) => member.reading.word)).toEqual(['thriving', 'starving']);
  });

  it('reads each fish once, and hands the reading to the row', () => {
    const state = tank([makeFish({ id: 'a' }), makeFish({ id: 'b' })]);
    const [group] = groupBySpecies(state, livestockDefaults);

    expect(group.members.map((member) => member.fish.id)).toEqual(['a', 'b']);
  });
});

describe('rosterSummary', () => {
  it('says only what the tank has', () => {
    expect(rosterSummary(tank([]))).toBe('0 fish');
  });

  it('holds the adult count at zero for a tank that is all fry', () => {
    const fish = [makeFish({ id: 'a', species: 'guppy', stage: 'fry', age: 24 })];
    expect(rosterSummary(tank(fish))).toBe('0 fish · 1 species · 1 fry');
  });

  it('counts fry apart from the adults rather than folding them in', () => {
    const fish = [
      makeFish({ id: 'a', species: 'neon_tetra' }),
      makeFish({ id: 'b', species: 'neon_tetra' }),
      makeFish({ id: 'c', species: 'guppy', stage: 'fry', age: 24 }),
      makeFish({ id: 'd', species: 'guppy', stage: 'fry', age: 24 }),
      makeFish({ id: 'e', species: 'guppy', stage: 'fry', age: 24 }),
    ];
    expect(rosterSummary(tank(fish))).toBe('2 fish · 2 species · 3 fry');
  });

  it('pluralises the clutch clause on the count, and keeps clause order', () => {
    const fish = [makeFish({ id: 'a' })];
    const one: Clutch = { id: 'c1', species: 'neon_tetra', eggCount: 25, laidTick: 0 };
    const two: Clutch = { id: 'c2', species: 'neon_tetra', eggCount: 25, laidTick: 4 };

    expect(rosterSummary(tank(fish, [one]))).toBe('1 fish · 1 species · 1 clutch');
    expect(rosterSummary(tank(fish, [one, two]))).toBe('1 fish · 1 species · 2 clutches');
  });
});

import { describe, it, expect } from 'vitest';
import type { Clutch, Fish, SimulationState } from '../../simulation/index.js';
import {
  createSimulation,
  FISH_SPECIES_DATA,
  tick,
} from '../../simulation/index.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../../simulation/config/index.js';
import { livestockDefaults } from '../../simulation/config/livestock.js';
import type { VitalityBreakdown } from '../../simulation/index.js';
import {
  groupBySpecies,
  gutBand,
  gutStatus,
  groupFry,
  readFish,
  rosterSummary,
  type FryBatch,
  type SpeciesGroup,
} from './livestock';
import { readHourAhead } from './ahead';
import { projectedTrend } from './status';
import { FED, HUNGRY, STARVING, gutAt } from '../test/gut';

function makeFish(overrides: Partial<Fish> & { id: string }): Fish {
  return {
    species: 'neon_tetra',
    mass: 0.5,
    health: 100,
    age: 0,
    gut: FED,
    sex: 'male',
    hardinessOffset: 0,
    surplus: 0,
    ...overrides,
  };
}

function tank(fish: Fish[], clutches: Clutch[] = [], hour = 0): SimulationState {
  return { ...createSimulation({ tankCapacity: 200 }), fish, clutches, tick: hour };
}

function species(state: SimulationState, config: TunableConfig = DEFAULT_CONFIG): SpeciesGroup[] {
  return groupBySpecies(readFish(state, config, readHourAhead(state, config)));
}

function fry(state: SimulationState): FryBatch | null {
  return groupFry(readFish(state, DEFAULT_CONFIG, readHourAhead(state, DEFAULT_CONFIG)));
}

describe('gutStatus', () => {
  it('maps bands onto the status vocabulary, starving at alert only once it makes the fish sick', () => {
    expect(gutStatus('fed', false)).toBe('ok');
    expect(gutStatus('hungry', true)).toBe('warn');
    expect(gutStatus('starving', false)).toBe('warn');
    expect(gutStatus('starving', true)).toBe('alert');
  });
});

describe('gutBand', () => {
  const breakdown = (hunger: number | null, benefitRate: number): VitalityBreakdown => ({
    stressors: hunger === null ? [] : [{ key: 'hunger', label: 'Hunger', amount: hunger }],
    benefits: [],
    damageRate: hunger ?? 0,
    benefitRate,
    net: benefitRate - (hunger ?? 0),
    healed: 0,
    banked: 0,
  });

  it('reads fed while hunger charges nothing', () => {
    expect(gutBand(breakdown(0, 0.5))).toBe('fed');
    expect(gutBand(breakdown(null, 0))).toBe('fed');
  });

  it('reads hungry once hunger charges, and starving once it alone outruns what the fish earns', () => {
    expect(gutBand(breakdown(0.1, 0.5))).toBe('hungry');
    expect(gutBand(breakdown(0.5, 0.5))).toBe('starving');
    expect(gutBand(breakdown(0.1, 0))).toBe('starving');
  });

  it('reads the engine: an empty gut starves, a full one is fed, and a fish with no mass needs nothing', () => {
    const state = tank([
      makeFish({ id: 'a', gut: FED }),
      makeFish({ id: 'b', gut: STARVING }),
      makeFish({ id: 'c', gut: 0, mass: 0 }),
    ]);
    const bands = readFish(state, DEFAULT_CONFIG, readHourAhead(state, DEFAULT_CONFIG)).map((read) => read.gut.word);
    expect(bands).toEqual(['fed', 'starving', 'fed']);
  });
});

describe('groupBySpecies', () => {
  it('folds adults into per-species rows and excludes fry', () => {
    const fish = [
      makeFish({ id: 'n1', species: 'neon_tetra', gut: gutAt(0.8) }),
      makeFish({ id: 'n2', species: 'neon_tetra', gut: HUNGRY }),
      makeFish({ id: 'g1', species: 'guppy', gut: FED }),
      makeFish({ id: 'f1', species: 'neon_tetra', mass: 0.01, age: 24 }),
    ];
    const groups = species(tank(fish));
    expect(groups.map((g) => g.species)).toEqual(['neon_tetra', 'guppy']);
    const neon = groups[0];
    expect(neon.count).toBe(2);
    expect(neon.gut.at).toBeCloseTo((0.8 + HUNGRY / gutAt(1)) / 2, 12);
    expect(neon.gut).toMatchObject({ word: '1 hungry', status: 'warn' });
    expect(neon.name).toBe(FISH_SPECIES_DATA.neon_tetra.name);
  });

  it('keeps a starving fish visible behind a calm average', () => {
    const fish = [
      makeFish({ id: 'a', gut: FED }),
      makeFish({ id: 'b', gut: STARVING }),
    ];
    const [neon] = species(tank(fish));

    expect(neon.gut.at).toBeCloseTo(0.5, 12);
    expect(neon.gut).toMatchObject({ word: '1 starving', status: 'alert' });
  });

  it('sums the group’s mass but averages its age and condition', () => {
    const fish = [
      makeFish({ id: 'a', mass: 0.4, age: 24 * 10, health: 90, gut: FED }),
      makeFish({ id: 'b', mass: 0.9, age: 24 * 20, health: 60, gut: FED }),
      makeFish({ id: 'c', mass: 1.1, age: 24 * 33, health: 30, gut: FED }),
    ];
    const [neon] = species(tank(fish));

    expect(neon.massG).toBeCloseTo(2.4, 10);
    expect(neon.ageDays).toBe(21);
    expect(neon.condition).toBeCloseTo(60, 10);
  });
});

describe('groupFry', () => {
  it('folds every fry in the tank into one batch, whatever they are', () => {
    const fish = [
      makeFish({ id: 'f1', species: 'guppy', age: 24, mass: 0.03 }),
      makeFish({ id: 'f2', species: 'betta', age: 72, mass: 0.09 }),
      makeFish({ id: 'a1', species: 'guppy', mass: 1 }),
    ];
    const batch = fry(tank(fish))!;

    expect(batch.count).toBe(2);
    expect(batch.species).toEqual(['guppy', 'betta']);
    expect(batch.massG).toBeCloseTo(0.12, 10);
    expect(batch.ageDays).toBe(2);
  });

  it('gives the batch the same gut and condition figures a species row gets', () => {
    const fish = [
      makeFish({ id: 'f1', species: 'guppy', mass: 0.1, gut: gutAt(1, 0.1), health: 90 }),
      makeFish({ id: 'f2', species: 'guppy', mass: 0.1, gut: STARVING, health: 50 }),
    ];
    const batch = fry(tank(fish))!;

    expect(batch.gut.at).toBeCloseTo(0.5, 12);
    expect(batch.condition).toBe(70);
    expect(batch.gut).toMatchObject({ word: '1 starving', status: 'alert' });
  });

  it('has nothing to sell where nothing is growing out', () => {
    expect(fry(tank([makeFish({ id: 'a' })]))).toBeNull();
  });
});

describe('the reading behind a fish', () => {
  function poisoned(fish: Fish[], ppm: number): SimulationState {
    const state = tank(fish);
    return { ...state, resources: { ...state.resources, ammonia: ppm * state.resources.water } };
  }

  it('reads a fish across every channel it keeps, not just its condition', () => {
    const state = tank([makeFish({ id: 'a', health: 100, gut: STARVING })]);
    const [group] = species(state);

    expect(group.members[0].reading).toEqual({ status: 'alert', word: 'starving' });
  });

  it('reads a starving fish its bank still holds up at the tone the need asks in', () => {
    const state = tank([makeFish({ id: 'a', health: 100, gut: STARVING, surplus: livestockDefaults.surplusCap })]);
    const [member] = species(state)[0].members;

    expect(member.sick).toBe(false);
    expect(member.reading).toEqual({ status: 'warn', word: 'starving' });
  });

  it('leaves a thriving fish alone, bank or no bank', () => {
    const state = tank([makeFish({ id: 'a', health: 100, surplus: 5 })]);
    const [group] = species(state);

    expect(group.members[0].reading).toEqual({ status: 'ok', word: 'thriving' });
  });

  it('gives every member its own reading, so the group cannot hide one', () => {
    const state = poisoned(
      [
        makeFish({ id: 'fish_a_1', health: 100, gut: FED }),
        makeFish({ id: 'fish_a_2', health: 100, gut: STARVING }),
      ],
      20
    );
    const [group] = species(state);

    expect(group.condition).toBe(100);
    expect(group.members.map((member) => member.reading.word)).toEqual(['sick', 'starving']);
  });

  it('calls a fish sick exactly while the next tick takes condition off it, as the trend shows', () => {
    for (const surplus of [0, livestockDefaults.surplusCap]) {
      const state = poisoned([makeFish({ id: 'a', health: 100, gut: FED, surplus })], 10);
      const [read] = readFish(state, DEFAULT_CONFIG, readHourAhead(state, DEFAULT_CONFIG));
      const next = tick(state, DEFAULT_CONFIG).fish[0];

      expect(read.sick).toBe(read.reading.word === 'sick');
      expect(read.sick).toBe(projectedTrend(next.health - 100).startsWith('↘'));
    }
  });

  it('is not sick while a bank that heals it whole holds it up', () => {
    const config = {
      ...DEFAULT_CONFIG,
      livestock: { ...livestockDefaults, healingDrawRate: 1e6 },
    };
    const banked = poisoned([makeFish({ id: 'a', health: 100, gut: FED, surplus: 50 })], 10);

    expect(species(banked, config)[0].members[0].reading.word).toBe('thriving');
  });

  it('reads each fish once, and hands the reading to the row', () => {
    const state = tank([makeFish({ id: 'a' }), makeFish({ id: 'b' })]);
    const [group] = species(state);

    expect(group.members.map((member) => member.fish.id)).toEqual(['a', 'b']);
  });
});

describe('rosterSummary', () => {
  it('says only what the tank has', () => {
    expect(rosterSummary(tank([]))).toBe('0 fish');
  });

  it('holds the adult count at zero for a tank that is all fry', () => {
    const fish = [makeFish({ id: 'a', species: 'guppy', mass: 0.01, age: 24 })];
    expect(rosterSummary(tank(fish))).toBe('0 fish · 1 species · 1 fry');
  });

  it('counts fry apart from the adults rather than folding them in', () => {
    const fish = [
      makeFish({ id: 'a', species: 'neon_tetra' }),
      makeFish({ id: 'b', species: 'neon_tetra' }),
      makeFish({ id: 'c', species: 'guppy', mass: 0.01, age: 24 }),
      makeFish({ id: 'd', species: 'guppy', mass: 0.01, age: 24 }),
      makeFish({ id: 'e', species: 'guppy', mass: 0.01, age: 24 }),
    ];
    expect(rosterSummary(tank(fish))).toBe('2 fish · 2 species · 3 fry');
  });

  it('pluralises the clutch clause on the count, and keeps clause order', () => {
    const fish = [makeFish({ id: 'a' })];
    const one: Clutch = { id: 'c1', species: 'neon_tetra', eggs: 25, development: 0 };
    const two: Clutch = { id: 'c2', species: 'neon_tetra', eggs: 25, development: 0.1 };

    expect(rosterSummary(tank(fish, [one]))).toBe('1 fish · 1 species · 1 clutch');
    expect(rosterSummary(tank(fish, [one, two]))).toBe('1 fish · 1 species · 2 clutches');
  });
});

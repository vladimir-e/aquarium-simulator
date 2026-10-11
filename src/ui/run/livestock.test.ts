import { describe, it, expect } from 'vitest';
import type { Clutch, Fish, FishHour, SimulationState } from '../../simulation/index.js';
import { createSimulation, FISH_SPECIES_DATA, fishMass, MAX_STOCKED_SIZE, tick } from '../../simulation/index.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../../simulation/config/index.js';
import { livestockDefaults } from '../../simulation/config/livestock.js';
import {
  fishNumbers,
  fishTitle,
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
import { FED, atReserve, hungry, starving } from '../test/gut';
import { fishRecord, poisoned } from '../../simulation/tests/fish.js';

function makeFish(overrides: Partial<Fish> & { size?: number } = {}): Fish {
  return fishRecord({ gut: FED, ...overrides });
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

const bands = (state: SimulationState): string[] =>
  readFish(state, DEFAULT_CONFIG, readHourAhead(state, DEFAULT_CONFIG)).map((read) => read.gut.word);

describe('gutStatus', () => {
  it('maps bands onto the status vocabulary, starving at alert only once it makes the fish sick', () => {
    expect(gutStatus('fed', false)).toBe('ok');
    expect(gutStatus('hungry', true)).toBe('warn');
    expect(gutStatus('starving', false)).toBe('warn');
    expect(gutStatus('starving', true)).toBe('alert');
  });
});

describe('gutBand', () => {
  const hour = (shortfall: number, owed = 1): Pick<FishHour, 'fluxes'> => ({
    fluxes: { shortfall, owed } as FishHour['fluxes'],
  });
  const full = fishRecord();

  it('reads fed on a full reserve paying its upkeep', () => {
    expect(gutBand(full, hour(0))).toBe('fed');
    expect(gutBand(full, hour(0, 0))).toBe('fed');
  });

  it('reads hungry under half a reserve or with a visible share of its upkeep unpaid, starving with half of it unpaid', () => {
    expect(gutBand(atReserve(full, 0.4), hour(0))).toBe('hungry');
    expect(gutBand(full, hour(0.1))).toBe('hungry');
    expect(gutBand(full, hour(0.5))).toBe('starving');
  });

  it('reads the engine: an empty reserve starves, a thin one hungers, a full one is fed', () => {
    const state = tank([makeFish({ id: 'a' }), starving(makeFish({ id: 'b' })), hungry(makeFish({ id: 'c', gut: 0 }))]);
    expect(bands(state)).toEqual(['fed', 'starving', 'hungry']);
  });
});

describe('a fish’s name', () => {
  it('names an adult by its species, a juvenile and a fry by their stage too, numbered in the row each sits in', () => {
    const fish = [
      makeFish({ id: 'adult', species: 'angelfish', size: MAX_STOCKED_SIZE }),
      makeFish({ id: 'juvenile', species: 'angelfish' }),
      makeFish({ id: 'fry', species: 'angelfish', size: 20 }),
    ];
    const numbers = fishNumbers(fish);
    expect(fish.map((f) => fishTitle(f, numbers.get(f.id)!))).toEqual([
      'Angelfish #1',
      'Angelfish juvenile #2',
      'Angelfish fry #1',
    ]);
  });
});

describe('groupBySpecies', () => {
  it('folds juveniles in with the adults of their species', () => {
    const fish = [makeFish({ id: 'a', species: 'angelfish', size: MAX_STOCKED_SIZE }), makeFish({ id: 'j', species: 'angelfish' })];
    const [angel] = species(tank(fish));
    expect(angel.members.map((member) => member.id)).toEqual(['a', 'j']);
    expect(fry(tank(fish))).toBeNull();
  });

  it('folds adults into per-species rows and excludes fry', () => {
    const fish = [
      makeFish({ id: 'n1', species: 'neon_tetra', gut: 0.8 * FED }),
      hungry(makeFish({ id: 'n2', species: 'neon_tetra', gut: 0.1 * FED })),
      makeFish({ id: 'g1', species: 'guppy', gut: FED }),
      makeFish({ id: 'f1', species: 'neon_tetra', size: 20, age: 24 }),
    ];
    const groups = species(tank(fish));
    expect(groups.map((g) => g.species)).toEqual(['neon_tetra', 'guppy']);
    const neon = groups[0];
    expect(neon.count).toBe(2);
    expect(neon.gut.at).toBeCloseTo((neon.members[0].gut.at + neon.members[1].gut.at) / 2, 12);
    expect(neon.gut).toMatchObject({ word: '1 hungry', status: 'warn' });
    expect(neon.name).toBe(FISH_SPECIES_DATA.neon_tetra.name);
  });

  it('keeps a starving fish visible behind a calm average', () => {
    const fish = [makeFish({ id: 'a', gut: FED }), starving(makeFish({ id: 'b', gut: 0 }))];
    const [neon] = species(tank(fish));

    expect(neon.gut.at).toBeCloseTo(neon.members[0].gut.at / 2, 12);
    expect(neon.gut.word).toBe('1 starving');
  });

  it('sums the group’s mass but averages its age and condition', () => {
    const fish = [
      makeFish({ id: 'a', size: 50, age: 24 * 10, health: 90, gut: FED }),
      makeFish({ id: 'b', size: 70, age: 24 * 20, health: 60, gut: FED }),
      makeFish({ id: 'c', size: 90, age: 24 * 33, health: 30, gut: FED }),
    ];
    const [neon] = species(tank(fish));

    expect(neon.massG).toBeCloseTo(fish.reduce((sum, f) => sum + fishMass(f), 0), 10);
    expect(neon.ageDays).toBe(21);
    expect(neon.condition).toBeCloseTo(60, 10);
  });
});

describe('groupFry', () => {
  it('folds every fry in the tank into one batch, whatever they are', () => {
    const fish = [
      makeFish({ id: 'f1', species: 'guppy', age: 24, size: 20 }),
      makeFish({ id: 'f2', species: 'betta', age: 72, size: 20 }),
      makeFish({ id: 'a1', species: 'guppy' }),
    ];
    const batch = fry(tank(fish))!;

    expect(batch.count).toBe(2);
    expect(batch.species).toEqual(['guppy', 'betta']);
    expect(batch.massG).toBeCloseTo(fishMass(fish[0]) + fishMass(fish[1]), 10);
    expect(batch.ageDays).toBe(2);
  });

  it('gives the batch the same gut and condition figures a species row gets', () => {
    const fish = [
      makeFish({ id: 'f1', species: 'guppy', size: 20, health: 90 }),
      starving(makeFish({ id: 'f2', species: 'guppy', size: 20, health: 50 })),
    ];
    const batch = fry(tank(fish))!;
    const [one, other] = batch.members;

    expect(batch.gut.at).toBeCloseTo((one.gut.at + other.gut.at) / 2, 12);
    expect(batch.condition).toBe(70);
    expect(batch.gut.word).toBe('1 starving');
  });

  it('has nothing to sell where nothing is growing out', () => {
    expect(fry(tank([makeFish({ id: 'a' })]))).toBeNull();
  });
});

describe('the reading behind a fish', () => {
  it('reads a fish across every channel it keeps, not just its condition', () => {
    const state = tank([starving(makeFish({ id: 'a', health: 100, gut: 0 }))]);
    const [group] = species(state);

    expect(group.members[0].reading).toEqual({ status: 'alert', word: 'starving' });
  });

  it('reads a starving fish whose benefits still outrun its hunger at the tone the need asks in', () => {
    const lean = atReserve(makeFish({ id: 'a', health: 100, gut: 0 }), 0.32);
    const [member] = species(tank([lean]))[0].members;

    expect(member.sick).toBe(false);
    expect(member.reading).toEqual({ status: 'warn', word: 'starving' });
  });

  it('leaves a thriving fish alone', () => {
    const [group] = species(tank([makeFish({ id: 'a', health: 100 })]));

    expect(group.members[0].reading).toEqual({ status: 'ok', word: 'thriving' });
  });

  it('gives every member its own reading, so the group cannot hide one', () => {
    const state = poisoned(
      tank([
        makeFish({ id: 'fish_a_1', health: 100, gut: FED }),
        starving(makeFish({ id: 'fish_a_2', health: 100, gut: 0 })),
      ]),
      20
    );
    const [group] = species(state);

    expect(group.condition).toBe(100);
    expect(group.members.map((member) => member.reading.word)).toEqual(['sick', 'starving']);
  });

  it('calls a fish sick exactly while the next tick takes condition off it, as the trend shows', () => {
    for (const health of [100, 60]) {
      const state = poisoned(tank([makeFish({ id: 'a', health, gut: FED })]), 10);
      const [read] = readFish(state, DEFAULT_CONFIG, readHourAhead(state, DEFAULT_CONFIG));
      const next = tick(state, DEFAULT_CONFIG).fish[0];

      expect(read.sick).toBe(read.reading.word === 'sick');
      expect(read.sick).toBe(projectedTrend(next.health - health).startsWith('↘'));
    }
  });

  it('is not sick while the repair its reserve pays for outruns the harm', () => {
    const config = { ...DEFAULT_CONFIG, livestock: { ...livestockDefaults, healingRate: 1 } };
    const harmed = poisoned(tank([makeFish({ id: 'a', health: 95, gut: FED })]), 10);

    expect(species(harmed, config)[0].members[0].reading.word).not.toBe('sick');
    expect(species(harmed)[0].members[0].reading.word).toBe('sick');
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
    const fish = [makeFish({ id: 'a', species: 'guppy', size: 20, age: 24 })];
    expect(rosterSummary(tank(fish))).toBe('0 fish · 1 species · 1 fry');
  });

  it('counts fry apart from the adults rather than folding them in', () => {
    const fish = [
      makeFish({ id: 'a', species: 'neon_tetra' }),
      makeFish({ id: 'b', species: 'neon_tetra' }),
      makeFish({ id: 'c', species: 'guppy', size: 20, age: 24 }),
      makeFish({ id: 'd', species: 'guppy', size: 20, age: 24 }),
      makeFish({ id: 'e', species: 'guppy', size: 20, age: 24 }),
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

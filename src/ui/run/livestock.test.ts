import { describe, it, expect } from 'vitest';
import type { Clutch, Fish, SimulationState } from '../../simulation/index.js';
import { createSimulation, FISH_SPECIES_DATA } from '../../simulation/index.js';
import { livestockDefaults } from '../../simulation/config/livestock.js';
import {
  bandStatus,
  fishVitals,
  groupBySpecies,
  groupFryBatches,
  hungerOf,
  isHungryBand,
  rosterRows,
  rosterSummary,
  type ClutchRosterRow,
  type FishRosterRow,
  type FryRosterRow,
  type SpeciesRosterRow,
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

function expanded(...keys: string[]): Set<string> {
  return new Set(keys);
}

// Band floors (config defaults): overfed ≥99, wellFed ≥75, peckish ≥50, hungry ≥25, else starving.
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
      makeFish({ id: 'a', satiation: 90 }), // wellFed
      makeFish({ id: 'b', satiation: 60 }), // peckish
      makeFish({ id: 'c', satiation: 40 }), // hungry
      makeFish({ id: 'd', satiation: 10, stage: 'fry', age: 24 }), // starving
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
    // Mean 50 lands in the peckish band, which on its own reads neutral.
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
    // Three fish that differ on every axis, so a sum can't pass for a mean.
    const fish = [
      makeFish({ id: 'a', mass: 0.4, age: 24 * 10, health: 90, satiation: 80 }),
      makeFish({ id: 'b', mass: 0.9, age: 24 * 20, health: 60, satiation: 80 }),
      makeFish({ id: 'c', mass: 1.1, age: 24 * 33, health: 30, satiation: 80 }),
    ];
    const [neon] = groupBySpecies(tank(fish), livestockDefaults);

    expect(neon.massG).toBeCloseTo(2.4, 10);
    expect(neon.ageDays).toBe(21); // mean age is 21 d, not 10, 33 or 63
    expect(neon.condition).toBeCloseTo(60, 10);
  });
});

describe('groupFryBatches', () => {
  it('groups fry by species with derived maturation and combined mass', () => {
    const fish = [
      makeFish({ id: 'f1', species: 'guppy', stage: 'fry', age: 24, mass: 0.03 }),
      makeFish({ id: 'f2', species: 'guppy', stage: 'fry', age: 72, mass: 0.09 }),
      makeFish({ id: 'a1', species: 'guppy', stage: 'adult', mass: 1 }),
    ];
    const batches = groupFryBatches(tank(fish), livestockDefaults);
    expect(batches).toHaveLength(1);
    expect(batches[0].species).toBe('guppy');
    expect(batches[0].count).toBe(2);
    // The adult's 1 g must stay out of the batch mass.
    expect(batches[0].massG).toBeCloseTo(0.12, 10);
    // Mean age 48 ticks = day 2; guppy maturityAge 24 * 60 → graduates day 60.
    expect(batches[0].ageDays).toBe(2);
    expect(batches[0].graduationDay).toBe(60);
  });

  it('gives a batch the same satiation and condition figures a species row gets', () => {
    const fish = [
      makeFish({ id: 'f1', species: 'guppy', stage: 'fry', satiation: 80, health: 90 }),
      makeFish({ id: 'f2', species: 'guppy', stage: 'fry', satiation: 10, health: 50 }),
    ];
    const [batch] = groupFryBatches(tank(fish), livestockDefaults);

    expect(batch.satiation).toBe(45);
    expect(batch.condition).toBe(70);
    expect(batch.hunger).toEqual({ count: 1, band: 'starving' });
  });
});

describe('rosterRows', () => {
  const roster = [
    makeFish({ id: 'fish_a_1', species: 'neon_tetra', satiation: 80 }),
    makeFish({ id: 'fish_a_2', species: 'neon_tetra', satiation: 40, sex: 'female' }),
    makeFish({ id: 'fish_a_3', species: 'corydoras', mass: 4 }),
  ];

  it('lists one row per species while everything is collapsed', () => {
    const rows = rosterRows(tank(roster), livestockDefaults, expanded());
    expect(rows.map((r) => r.kind)).toEqual(['species', 'species']);
    expect((rows[0] as SpeciesRosterRow).expanded).toBe(false);
  });

  it('opens one species without opening the other, and puts its fish beneath it', () => {
    const rows = rosterRows(tank(roster), livestockDefaults, expanded('species-neon_tetra'));

    expect(rows.map((r) => r.kind)).toEqual(['species', 'fish', 'fish', 'species']);
    expect((rows[0] as SpeciesRosterRow).species).toBe('neon_tetra');
    expect((rows[3] as SpeciesRosterRow).species).toBe('corydoras');
    expect((rows[3] as SpeciesRosterRow).expanded).toBe(false);

    const second = rows[2] as FishRosterRow;
    expect(second.id).toBe('fish_a_2');
    expect(second.sex).toBe('female');
    expect(second.satiation).toBe(40);
  });

  it('strips the id’s kind prefix, keeping the part that tells two fish apart', () => {
    const rows = rosterRows(tank(roster), livestockDefaults, expanded('species-neon_tetra'));
    expect((rows[1] as FishRosterRow).shortId).toBe('a_1');
    expect((rows[2] as FishRosterRow).shortId).toBe('a_2');
  });

  it('counts down to hatch from the current tick, not from when the clutch was laid', () => {
    const clutch: Clutch = {
      id: 'clutch_x_7',
      species: 'angelfish', // hatchTime 60
      eggCount: 24,
      laidTick: 1602,
    };
    const [row] = rosterRows(tank([], [clutch], 1622), livestockDefaults, expanded());

    expect(row.kind).toBe('clutch');
    const clutchRow = row as ClutchRosterRow;
    expect(clutchRow.name).toBe('Angelfish clutch');
    expect(clutchRow.shortId).toBe('x_7');
    expect(clutchRow.hatchTick).toBe(1662);
    expect(clutchRow.hoursToHatch).toBe(40);
  });

  it('gives fry batches their own rows after the adults and the clutches', () => {
    const fish = [
      ...roster,
      makeFish({ id: 'fry1', species: 'guppy', stage: 'fry', age: 24 * 6, mass: 0.4 }),
      makeFish({ id: 'fry2', species: 'guppy', stage: 'fry', age: 24 * 12, mass: 0.6 }),
    ];
    const clutch: Clutch = { id: 'c_1', species: 'neon_tetra', eggCount: 25, laidTick: 0 };
    const rows = rosterRows(tank(fish, [clutch], 12), livestockDefaults, expanded());

    expect(rows.map((r) => r.kind)).toEqual(['species', 'species', 'clutch', 'fry']);
    const fry = rows[3] as FryRosterRow;
    expect(fry.count).toBe(2);
    expect(fry.massG).toBeCloseTo(1, 10);
    expect(fry.ageDays).toBe(9); // mean of 6 d and 12 d
    expect(fry.graduationDay).toBe(60);
    // Fry never appear as a species row of their own.
    expect(rows.filter((r) => r.kind === 'species').map((r) => r.key)).toEqual([
      'species-neon_tetra',
      'species-corydoras',
    ]);
  });

  it('has nothing to show for an empty tank', () => {
    expect(rosterRows(tank([]), livestockDefaults, expanded())).toEqual([]);
  });

  it('opens one fish inside an opened species without opening its shoalmate', () => {
    const rows = rosterRows(
      tank(roster),
      livestockDefaults,
      expanded('species-neon_tetra', 'fish_a_1')
    );

    expect((rows[1] as FishRosterRow).expanded).toBe(true);
    expect((rows[2] as FishRosterRow).expanded).toBe(false);
  });
});

describe('fishVitals', () => {
  /** The tank at a given total ammonia, in ppm of its 200 L. */
  function poisoned(fish: Fish[], ppm: number): SimulationState {
    const state = tank(fish);
    return { ...state, resources: { ...state.resources, ammonia: ppm * state.resources.water } };
  }

  it('carries the engine’s factors, keeping only the ones actually acting', () => {
    const state = poisoned([makeFish({ id: 'a' })], 20);
    const vitals = fishVitals(state.fish[0], state, livestockDefaults);

    expect(vitals.stressors.every((f) => f.amount > 0)).toBe(true);
    expect(vitals.benefits.every((f) => f.amount > 0)).toBe(true);
    expect(vitals.stressors.map((f) => f.key)).toContain('ammonia');

    const benefits = vitals.benefits.reduce((sum, f) => sum + f.amount, 0);
    const stressors = vitals.stressors.reduce((sum, f) => sum + f.amount, 0);
    expect(vitals.net).toBeCloseTo(benefits - stressors, 6);
  });

  it('reads a full fish spending down its bank as burning reserves', () => {
    // The whole point of the reading: health 100 and net < 0 at the same time.
    const fish = makeFish({ id: 'a', health: 100, surplus: 5 });
    const state = poisoned([fish], 20);
    const vitals = fishVitals(state.fish[0], state, livestockDefaults);

    expect(state.fish[0].health).toBe(100);
    expect(vitals.net).toBeLessThan(0);
    expect(vitals.burning).toBe(true);
    expect(vitals.reserve).toBe(5);
    expect(vitals.reserveCap).toBe(livestockDefaults.surplusCap);
  });

  it('stops calling it burning once there is nothing left to burn', () => {
    // Same water, same full health — but an empty bank, so the damage lands on
    // condition instead and the fish will visibly fall next tick.
    const state = poisoned([makeFish({ id: 'a', health: 100, surplus: 0 })], 20);
    const vitals = fishVitals(state.fish[0], state, livestockDefaults);

    expect(vitals.net).toBeLessThan(0);
    expect(vitals.burning).toBe(false);
  });

  it('leaves a thriving fish alone, bank or no bank', () => {
    const state = tank([makeFish({ id: 'a', health: 100, surplus: 5 })]);
    const vitals = fishVitals(state.fish[0], state, livestockDefaults);

    expect(vitals.net).toBeGreaterThan(0);
    expect(vitals.burning).toBe(false);
  });

  it('surfaces one burning fish through the group row that hides it', () => {
    const state = poisoned(
      [
        makeFish({ id: 'fish_a_1', health: 100, surplus: 0 }),
        makeFish({ id: 'fish_a_2', health: 100, surplus: 5 }),
      ],
      20
    );
    const rows = rosterRows(state, livestockDefaults, expanded('species-neon_tetra'));

    // Both read 100 %, so the group row would say nothing without the bank.
    expect((rows[0] as SpeciesRosterRow).condition).toBe(100);
    expect((rows[0] as SpeciesRosterRow).burning).toBe(true);
    expect((rows[1] as FishRosterRow).burning).toBe(false);
    expect((rows[2] as FishRosterRow).burning).toBe(true);
  });

  it('says nothing about a group with nothing to say', () => {
    const rows = rosterRows(
      tank([makeFish({ id: 'a', health: 100, surplus: 5 })]),
      livestockDefaults,
      expanded()
    );
    expect((rows[0] as SpeciesRosterRow).burning).toBe(false);
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
    // Five fish are present but only two are adults, and the fry's species counts.
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

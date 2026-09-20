import { describe, it, expect } from 'vitest';
import type { Clutch, Fish, SimulationState } from '../../simulation/index.js';
import { createSimulation } from '../../simulation/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { livestockDefaults } from '../../simulation/config/livestock.js';
import { groupBySpecies, groupFryBatches } from './livestock.js';
import { groupPlantsBySpecies, plantRows } from './flora.js';
import {
  rosterTables,
  type ClutchRosterRow,
  type FryRosterRow,
  type IndividualRosterRow,
  type RosterInput,
  type SpeciesRosterRow,
} from './roster.js';

function makeFish(overrides: Partial<Fish> & { id: string }): Fish {
  return {
    species: 'neon_tetra',
    mass: 0.5,
    health: 100,
    age: 24 * 120,
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

function input(state: SimulationState): RosterInput {
  return {
    fish: groupBySpecies(state, livestockDefaults),
    plants: groupPlantsBySpecies(plantRows(state, DEFAULT_CONFIG)),
    fry: groupFryBatches(state, livestockDefaults),
    clutches: state.clutches,
    tick: state.tick,
  };
}

function tables(
  state: SimulationState,
  ...open: string[]
): ReturnType<typeof rosterTables> {
  return rosterTables(input(state), livestockDefaults, new Set(open));
}

const roster = [
  makeFish({ id: 'fish_a_1', species: 'neon_tetra', satiation: 80 }),
  makeFish({ id: 'fish_a_2', species: 'neon_tetra', satiation: 40, sex: 'female' }),
  makeFish({ id: 'fish_a_3', species: 'corydoras', mass: 4 }),
];

describe('rosterTables', () => {
  it('lists one row per species while everything is collapsed', () => {
    const { fish } = tables(tank(roster));
    expect(fish.map((row) => row.kind)).toEqual(['species', 'species']);
    expect((fish[0] as SpeciesRosterRow).expanded).toBe(false);
  });

  it('opens one species without opening the other, and puts its fish beneath it', () => {
    const { fish } = tables(tank(roster), 'species-neon_tetra');

    expect(fish.map((row) => row.kind)).toEqual([
      'species',
      'individual',
      'individual',
      'species',
    ]);
    expect((fish[0] as SpeciesRosterRow).species).toBe('neon_tetra');
    expect((fish[3] as SpeciesRosterRow).species).toBe('corydoras');

    const second = fish[2] as IndividualRosterRow;
    expect(second.id).toBe('fish_a_2');
    expect(second.sex).toBe('female');
    expect(second.shortId).toBe('a_2');
    expect(second.figure).toBe('0.50 g');
    expect(second.age).toBe('120 d');
  });

  it('gives a species row its mass per fish and a dot per individual', () => {
    const [group] = tables(tank(roster)).fish as SpeciesRosterRow[];
    expect(group.count).toBe(2);
    expect(group.figure).toBe('0.50 g each');
    expect(group.dots).toHaveLength(2);
  });

  it('reads a fish by its worst channel, so a full-condition fish can still be hungry', () => {
    const starving = tables(tank([makeFish({ id: 'fish_a_1', satiation: 5 })]), 'species-neon_tetra');
    const individual = starving.fish[1] as IndividualRosterRow;

    expect(individual.at).toBe(1);
    expect(individual.status).toBe('alert');
    expect(individual.word).toBe('starving');
  });

  it('hands a group over at its worst member', () => {
    const state = tank([
      makeFish({ id: 'fish_a_1', health: 100 }),
      makeFish({ id: 'fish_a_2', health: 20 }),
    ]);
    expect((tables(state).fish[0] as SpeciesRosterRow).worstKey).toBe('fish_a_2');
  });

  it('counts down to hatch from the current tick, not from when the clutch was laid', () => {
    const clutch: Clutch = {
      id: 'clutch_x_7',
      species: 'angelfish', // hatchTime 60
      eggCount: 24,
      laidTick: 1602,
    };
    const [row] = tables(tank([], [clutch], 1622)).fish as ClutchRosterRow[];

    expect(row.kind).toBe('clutch');
    expect(row.name).toBe('Angelfish clutch');
    expect(row.figure).toBe('24 eggs');
    expect(row.age).toBe('hatches in 40 h');
  });

  it('gives fry batches their own rows after the adults and the clutches', () => {
    const fish = [
      ...roster,
      makeFish({ id: 'fry1', species: 'guppy', stage: 'fry', age: 24 * 6, mass: 0.4 }),
      makeFish({ id: 'fry2', species: 'guppy', stage: 'fry', age: 24 * 12, mass: 0.6 }),
    ];
    const clutch: Clutch = { id: 'c_1', species: 'neon_tetra', eggCount: 25, laidTick: 0 };
    const { fish: rows } = tables(tank(fish, [clutch], 12));

    expect(rows.map((row) => row.kind)).toEqual(['species', 'species', 'clutch', 'fry']);
    const fry = rows[3] as FryRosterRow;
    expect(fry.name).toBe('Guppy fry');
    expect(fry.count).toBe(2);
    expect(fry.age).toBe('day 9 of 60');
  });

  it('has nothing to show for a bare tank', () => {
    expect(tables(tank([]))).toEqual({ fish: [], plants: [] });
  });
});

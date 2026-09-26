import { describe, it, expect } from 'vitest';
import type { Clutch, Fish, SimulationState } from '../../simulation/index.js';
import { applyAction, createSimulation } from '../../simulation/index.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../../simulation/config/index.js';
import { livestockDefaults } from '../../simulation/config/livestock.js';
import { readHourAhead } from './ahead.js';
import { groupBySpecies, groupFry, readFish } from './livestock.js';
import { groupPlantsBySpecies, plantRows } from './flora.js';
import { readLedger } from './ledger.js';
import { groupReading, worstMember, type Member } from './status.js';
import {
  rosterTables,
  type ClutchRosterRow,
  type FryRosterRow,
  type IndividualRosterRow,
  type RosterInput,
  type RosterRow,
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

/** A bank that heals whatever the hour charges, so only an empty one lets condition fall. */
const HEALED: TunableConfig = {
  ...DEFAULT_CONFIG,
  livestock: { ...livestockDefaults, healingDrawRate: 1e6 },
};

function input(state: SimulationState, config: TunableConfig): RosterInput {
  const fish = readFish(state, config, readHourAhead(state, config));
  return {
    fish: groupBySpecies(fish, config.livestock),
    plants: groupPlantsBySpecies(plantRows(state, readHourAhead(state, config))),
    fry: groupFry(fish, config.livestock),
    clutches: state.clutches,
    tick: state.tick,
  };
}

function tables(
  state: SimulationState,
  open: string[] = [],
  config: TunableConfig = DEFAULT_CONFIG
): ReturnType<typeof rosterTables> {
  return rosterTables(input(state, config), config.livestock, new Set(open));
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
    const { fish } = tables(tank(roster), ['species-neon_tetra']);

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
    const starving = tables(tank([makeFish({ id: 'fish_a_1', satiation: 5 })]), ['species-neon_tetra']);
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
      species: 'angelfish',
      eggCount: 24,
      laidTick: 1602,
    };
    const [row] = tables(tank([], [clutch], 1622)).fish as ClutchRosterRow[];

    expect(row.kind).toBe('clutch');
    expect(row.name).toBe('Angelfish clutch');
    expect(row.figure).toBe('24 eggs');
    expect(row.age).toBe('hatches in 40 h');
  });

  it('puts every fry in one row after the adults and the clutches', () => {
    const fish = [
      ...roster,
      makeFish({ id: 'fry1', species: 'guppy', stage: 'fry', age: 24 * 6, mass: 0.4 }),
      makeFish({ id: 'fry2', species: 'guppy', stage: 'fry', age: 24 * 12, mass: 0.6 }),
      makeFish({ id: 'fry3', species: 'betta', stage: 'fry', age: 24 * 9, mass: 0.5 }),
    ];
    const clutch: Clutch = { id: 'c_1', species: 'neon_tetra', eggCount: 25, laidTick: 0 };
    const { fish: rows } = tables(tank(fish, [clutch], 12));

    expect(rows.map((row) => row.kind)).toEqual(['species', 'species', 'clutch', 'fry']);
    const fry = rows[3] as FryRosterRow;
    expect(fry.name).toBe('Fry');
    expect(fry.count).toBe(3);
    expect(fry.caption).toBe('2 species');
    expect(fry.age).toBe('9 d');
  });

  it('names the one species where that is all there is', () => {
    const fish = [makeFish({ id: 'fry1', species: 'guppy', stage: 'fry', mass: 0.4 })];
    const [fry] = tables(tank(fish)).fish as FryRosterRow[];

    expect(fry.caption).toBe('Guppy');
    expect(fry.count).toBe(1);
  });

  it('reads a group by its hungry members, even at full condition', () => {
    const banked = { surplus: livestockDefaults.surplusCap };
    const hungry = [
      makeFish({ id: 'fish_a_1', satiation: 90, ...banked }),
      makeFish({ id: 'fish_a_2', satiation: 40, ...banked }),
      makeFish({ id: 'fish_a_3', satiation: 30, ...banked }),
    ];
    const [group] = tables(tank(hungry), [], HEALED).fish as SpeciesRosterRow[];

    expect(group.status).toBe('warn');
    expect(group.word).toBe('2 hungry');
    expect(group.satiation!.word).toBe('2 hungry');
  });

  it('counts the members whose damage outruns their healing', () => {
    const base = tank([
      makeFish({ id: 'fish_a_1' }),
      makeFish({ id: 'fish_a_2' }),
      makeFish({ id: 'fish_a_3', surplus: livestockDefaults.surplusCap }),
    ]);
    const poisoned: SimulationState = {
      ...base,
      resources: { ...base.resources, ammonia: 20 * base.resources.water },
    };
    const [group] = tables(poisoned, [], HEALED).fish as SpeciesRosterRow[];

    expect(group.status).toBe('warn');
    expect(group.word).toBe('2 sick');
  });

  it('counts the overfed members the way it counts the hungry', () => {
    const banked = { satiation: 100, surplus: livestockDefaults.surplusCap };
    const fed = [
      makeFish({ id: 'fish_a_1', ...banked }),
      makeFish({ id: 'fish_a_2', ...banked }),
      makeFish({ id: 'fish_a_3', ...banked }),
    ];
    const [group] = tables(tank(fed), [], HEALED).fish as SpeciesRosterRow[];

    expect(group.dots).toEqual(['warn', 'warn', 'warn']);
    expect(group).toMatchObject({ status: 'warn', word: '3 overfed' });
  });

  it('reads both tables by the one group rule, and opens the member it names', () => {
    const base = tank([
      makeFish({ id: 'fish_a_1' }),
      makeFish({ id: 'fish_a_2' }),
      makeFish({ id: 'fish_a_3', health: 65, surplus: 5 }),
    ]);
    const state = applyAction(
      applyAction(base, { type: 'addPlant', species: 'java_fern' }).state,
      { type: 'addPlant', species: 'java_fern' }
    ).state;
    const planted: SimulationState = {
      ...state,
      plants: state.plants.map((plant, i) => ({ ...plant, condition: i === 1 ? 65 : 100 })),
    };
    const { fish, plants } = input(planted, DEFAULT_CONFIG);
    const rows = tables(planted);
    const reads = (members: (Member & { id: string })[], row: RosterRow): void => {
      const header = row as SpeciesRosterRow;
      expect(members.every((member) => member.reading.status === 'ok')).toBe(true);
      expect(header).toMatchObject(groupReading(members));
      expect(header.worstKey).toBe(worstMember(members).id);
      expect(header.worstKey).toBe(members.find((member) => member.condition === 65)!.id);
    };

    reads(fish[0].members, rows.fish[0]);
    reads(plants[0].members, rows.plants[0]);
  });

  it('reads a group of one the way it reads its member', () => {
    const base = tank([makeFish({ id: 'fish_a_1' })]);
    const poisoned: SimulationState = {
      ...base,
      resources: { ...base.resources, ammonia: 20 * base.resources.water },
    };
    const [group, member] = tables(poisoned, ['species-neon_tetra']).fish as [
      SpeciesRosterRow,
      IndividualRosterRow,
    ];

    expect(member.word).toBe('sick');
    expect(group).toMatchObject({ status: member.status, word: member.word });
  });

  it('gives a fish the word its ledger gives it, bank and all', () => {
    const fish = makeFish({ id: 'fish_a_1', health: 100, surplus: 5 });
    const base = tank([fish]);
    const state: SimulationState = {
      ...base,
      resources: { ...base.resources, ammonia: 20 * base.resources.water },
    };
    expect(readHourAhead(state, DEFAULT_CONFIG).fish[0].vitality.breakdown.healed).toBeGreaterThan(0);

    const row = tables(state, ['species-neon_tetra']).fish[1] as IndividualRosterRow;
    const ledger = readLedger(state, DEFAULT_CONFIG, readHourAhead(state, DEFAULT_CONFIG), { kind: 'fish', id: 'fish_a_1' })!;

    expect(row.word).toBe(ledger.word);
    expect(row.status).toBe(ledger.status);
  });

  it('has nothing to show for a bare tank', () => {
    expect(tables(tank([]))).toEqual({ fish: [], plants: [] });
  });
});

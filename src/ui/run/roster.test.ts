import { describe, it, expect } from 'vitest';
import type { Clutch, Fish, Plant, SimulationState } from '../../simulation/index.js';
import { applyAction, createSimulation, readPlantLight } from '../../simulation/index.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../../simulation/config/index.js';
import { livestockDefaults } from '../../simulation/config/livestock.js';
import { readHourAhead } from './ahead.js';
import { groupBySpecies, groupFry, readFish } from './livestock.js';
import { groupPlantsBySpecies, plantRows } from './flora.js';
import { readLedger } from './ledger.js';
import { FED, HUNGRY, STARVING } from '../test/gut';
import { groupReading, worstMember, type Member } from './status.js';
import {
  inspection,
  rosterTables,
  type ClutchRosterRow,
  type FamilyRosterRow,
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
    gut: FED,
    sex: 'male',
    hardinessOffset: 0,
    surplus: 0,
    ...overrides,
  };
}

function tank(fish: Fish[], clutches: Clutch[] = []): SimulationState {
  return { ...createSimulation({ tankCapacity: 200 }), fish, clutches };
}

/** A bank that heals whatever the hour charges, so only an empty one lets condition fall. */
const HEALED: TunableConfig = {
  ...DEFAULT_CONFIG,
  livestock: { ...livestockDefaults, healingDrawRate: 1e6 },
};

function input(state: SimulationState, config: TunableConfig): RosterInput {
  const fish = readFish(state, config, readHourAhead(state, config));
  return {
    fish: groupBySpecies(fish),
    plants: groupPlantsBySpecies(plantRows(state, config, readHourAhead(state, config))),
    fry: groupFry(fish),
    clutches: state.clutches,
  };
}

function tables(
  state: SimulationState,
  open: string[] = [],
  config: TunableConfig = DEFAULT_CONFIG
): ReturnType<typeof rosterTables> {
  return rosterTables(input(state, config), new Set(open));
}

const roster = [
  makeFish({ id: 'fish_a_1', species: 'neon_tetra' }),
  makeFish({ id: 'fish_a_2', species: 'neon_tetra', gut: HUNGRY, sex: 'female' }),
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
    expect(second.tag).toBe('#2');
    expect(second.title).toBe('Neon Tetra #2');
    expect(second.figure).toBe('0.50 g');
    expect(second.age).toBe('120 d');
  });

  it('numbers fish within their species in the order they were stocked, never by id', () => {
    const stocked = [
      makeFish({ id: 'fish_1', species: 'neon_tetra' }),
      makeFish({ id: 'fish_2', species: 'corydoras', mass: 4 }),
      makeFish({ id: 'fish_a', species: 'neon_tetra' }),
      makeFish({ id: 'fish_b', species: 'neon_tetra', mass: 0.01 }),
    ];
    const { fish } = tables(tank(stocked), ['species-neon_tetra', 'species-corydoras']);
    const titles = fish
      .filter((row): row is IndividualRosterRow => row.kind === 'individual')
      .map((row) => row.title);

    expect(titles).toEqual(['Neon Tetra #1', 'Neon Tetra #2', 'Corydoras #1']);
    const ledger = readLedger(tank(stocked), DEFAULT_CONFIG, readHourAhead(tank(stocked), DEFAULT_CONFIG), {
      kind: 'fish',
      id: 'fish_a',
    });
    expect(ledger?.title).toBe('Neon Tetra #2');
  });

  it('gives a species row its mass per fish and a dot per individual', () => {
    const [group] = tables(tank(roster)).fish as SpeciesRosterRow[];
    expect(group.count).toBe(2);
    expect(group.figure).toBe('0.50 g each');
    expect(group.dots).toHaveLength(2);
  });

  it('reads a fish by its worst channel, so a full-condition fish can still be hungry', () => {
    const starving = tables(tank([makeFish({ id: 'fish_a_1', gut: STARVING })]), ['species-neon_tetra']);
    const individual = starving.fish[1] as IndividualRosterRow;

    expect(individual.at).toBe(1);
    expect(individual.status).toBe('alert');
    expect(individual.word).toBe('starving');
  });

  it('hands a group over at its worst member, counted as the group stands', () => {
    const state = tank([
      makeFish({ id: 'fish_a_1', health: 100 }),
      makeFish({ id: 'fish_a_2', health: 20 }),
    ]);
    const [header] = tables(state).fish;

    expect(inspection(header.key, input(state, DEFAULT_CONFIG))).toEqual({
      target: { kind: 'fish', id: 'fish_a_2' },
      subtitle: 'the worst of 2 Neon Tetra',
    });
    expect(inspection('fish_a_1', input(state, DEFAULT_CONFIG))).toEqual({
      target: { kind: 'fish', id: 'fish_a_1' },
      subtitle: '',
    });
    expect(inspection('film', input(state, DEFAULT_CONFIG))!.target).toEqual({ kind: 'algae', bloom: 'film' });
    expect(inspection('greenWater', input(state, DEFAULT_CONFIG))!.target).toEqual({ kind: 'algae', bloom: 'greenWater' });
    expect(inspection('fish_gone', input(state, DEFAULT_CONFIG))).toBeNull();
  });

  it('reads a clutch as the whole eggs standing and how far it has developed', () => {
    const clutch: Clutch = { id: 'clutch_x_7', species: 'angelfish', eggs: 24.7, development: 0.337 };
    const [row] = tables(tank([], [clutch])).fish as ClutchRosterRow[];

    expect(row.kind).toBe('clutch');
    expect(row.name).toBe('Angelfish clutch');
    expect(row.figure).toBe('24 eggs');
    expect(row.age).toBe('33 % developed');
  });

  it('reads a livebearer clutch as the brood its mother carries', () => {
    const brood: Clutch = { id: 'clutch_x_8', species: 'guppy', eggs: 12, development: 0.5 };
    const [row] = tables(tank([], [brood])).fish as ClutchRosterRow[];

    expect(row.name).toBe('Guppy brood');
    expect(row.figure).toBe('12 fry');
  });

  it('puts every fry in one row after the adults and the clutches', () => {
    const fish = [
      ...roster,
      makeFish({ id: 'fry1', species: 'guppy', age: 24 * 6, mass: 0.4 }),
      makeFish({ id: 'fry2', species: 'guppy', age: 24 * 12, mass: 0.3 }),
      makeFish({ id: 'fry3', species: 'betta', age: 24 * 9, mass: 0.5 }),
    ];
    const clutch: Clutch = { id: 'c_1', species: 'neon_tetra', eggs: 25, development: 0 };
    const { fish: rows } = tables(tank(fish, [clutch]));

    expect(rows.map((row) => row.kind)).toEqual(['species', 'species', 'clutch', 'fry']);
    const fry = rows[3] as FryRosterRow;
    expect(fry.name).toBe('Fry');
    expect(fry.count).toBe(3);
    expect(fry.caption).toBe('2 species');
    expect(fry.age).toBe('9 d');
  });

  it('names the one species where that is all there is', () => {
    const fish = [makeFish({ id: 'fry1', species: 'guppy', mass: 0.4 })];
    const [fry] = tables(tank(fish)).fish as FryRosterRow[];

    expect(fry.caption).toBe('Guppy');
    expect(fry.count).toBe(1);
  });

  it('reads a group by its hungry members, even at full condition', () => {
    const banked = { surplus: livestockDefaults.surplusCap };
    const hungry = [
      makeFish({ id: 'fish_a_1', ...banked }),
      makeFish({ id: 'fish_a_2', gut: HUNGRY, ...banked }),
      makeFish({ id: 'fish_a_3', gut: HUNGRY, ...banked }),
    ];
    const [group] = tables(tank(hungry), [], HEALED).fish as SpeciesRosterRow[];

    expect(group.status).toBe('warn');
    expect(group.word).toBe('2 hungry');
    expect(group.gut!.word).toBe('2 hungry');
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
    const roster = input(planted, DEFAULT_CONFIG);
    const { fish, plants } = roster;
    const rows = tables(planted);
    const reads = (members: (Member & { id: string })[], row: RosterRow): void => {
      const header = row as SpeciesRosterRow;
      const opened = inspection(header.key, roster)!.target as { id: string };
      expect(members.every((member) => member.reading.status === 'ok')).toBe(true);
      expect(header).toMatchObject(groupReading(members));
      expect(opened.id).toBe(worstMember(members).id);
      expect(opened.id).toBe(members.find((member) => member.condition === 65)!.id);
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

  describe('for plants', () => {
    /** Three java fern families: `a` down two generations, `b` with one offshoot, `c` alone. */
    function families(tweak: (plant: Plant) => Partial<Plant> = () => ({})): SimulationState {
      const base = ['java_fern', 'java_fern', 'java_fern'].reduce(
        (state) => applyAction(state, { type: 'addPlant', species: 'java_fern' }).state,
        { ...createSimulation({ tankCapacity: 200 }), tick: 12 }
      );
      const [a, b] = base.plants;
      const bud = (parent: Plant, id: string): Plant => ({
        ...parent,
        id,
        parentId: parent.id,
        size: 20,
        age: 24,
      });
      const a1 = bud(a, 'plant_a1');
      const plants = [...base.plants, a1, bud(b, 'plant_b1'), bud(a1, 'plant_a2')];
      return { ...base, plants: plants.map((plant) => ({ ...plant, ...tweak(plant) })) };
    }

    const dark = (state: SimulationState): SimulationState => ({
      ...state,
      equipment: { ...state.equipment, light: { ...state.equipment.light, enabled: false } },
      resources: { ...state.resources, lightByHour: state.resources.lightByHour.map(() => 0) },
    });

    it('collapses a species onto its families, and a family onto its units, until opened', () => {
      const state = families();
      const [a, b, c] = state.plants;

      expect(tables(state).plants.map((row) => row.kind)).toEqual(['species']);
      expect(tables(state, ['species-java_fern']).plants.map((row) => row.key)).toEqual([
        'species-java_fern',
        `family-${a.id}`,
        `family-${b.id}`,
        `family-${c.id}`,
      ]);
      expect(
        tables(state, ['species-java_fern', `family-${a.id}`]).plants.map((row) => row.key)
      ).toEqual([
        'species-java_fern',
        `family-${a.id}`,
        a.id,
        'plant_a1',
        'plant_a2',
        `family-${b.id}`,
        `family-${c.id}`,
      ]);
    });

    it('counts its units at the species and in a family, the dots standing for families above', () => {
      const state = families();
      const [species, a, b, c] = tables(state, ['species-java_fern']).plants as [
        SpeciesRosterRow,
        FamilyRosterRow,
        FamilyRosterRow,
        FamilyRosterRow,
      ];

      expect(species).toMatchObject({ count: 6, caption: '3 families', dot: 'family' });
      expect(species.dots).toHaveLength(3);
      expect([a, b, c].map((family) => [family.count, family.dots.length])).toEqual([
        [3, 3],
        [2, 2],
        [1, 1],
      ]);
      expect([a, b, c].map((family) => family.label)).toEqual(['family 1', 'family 2', 'family 3']);
      expect(a.title).toBe('Java Fern family 1');
      expect(a.figure).toBe(`Σ ${Math.floor(state.plants[0].size + 40)} %`);
    });

    it('agrees its dots with its word at every level, however the tank reads', () => {
      const groups = (state: SimulationState): (SpeciesRosterRow | FamilyRosterRow)[] =>
        tables(state, ['species-java_fern', ...state.plants.map((p) => `family-${p.familyId}`)])
          .plants.filter((row) => row.kind === 'species' || row.kind === 'family');
      const struggling = (plant: Plant): Partial<Plant> =>
        plant.id === 'plant_a2' ? { condition: 20 } : {};

      const countedAt = new Set<string>();
      for (const state of [families(), dark(families()), dark(families(struggling))]) {
        for (const row of groups(state)) {
          const counted = /^(\d+) /.exec(row.word);
          if (counted) {
            expect(row.dots.filter((dot) => dot === row.status)).toHaveLength(Number(counted[1]));
            countedAt.add(row.kind);
          } else if (row.dots.length > 1) {
            expect(row.dots.every((dot) => dot === 'ok')).toBe(true);
          }
        }
      }
      expect(countedAt).toEqual(new Set(['species', 'family']));
    });

    it('opens a group on its worst unit, wherever that stands in the family tree', () => {
      const state = dark(families((plant) => (plant.id === 'plant_a2' ? { condition: 20 } : {})));
      const [species, a] = tables(state, ['species-java_fern']).plants as [
        SpeciesRosterRow,
        FamilyRosterRow,
      ];
      const roster = input(state, DEFAULT_CONFIG);
      expect(inspection(species.key, roster)!.target).toEqual({ kind: 'plant', id: 'plant_a2' });
      expect(inspection(a.key, roster)).toEqual({
        target: { kind: 'plant', id: 'plant_a2' },
        subtitle: 'the worst of 3 in Java Fern family 1',
      });
    });

    it('names a unit by the one it budded from, beside its light and its bank toward the next offshoot', () => {
      const cap = DEFAULT_CONFIG.plants.surplusCap;
      const state = families((plant) => (plant.id === 'plant_a2' ? { surplus: cap * 0.625 } : {}));
      const [a] = state.plants;
      const rows = tables(state, ['species-java_fern', `family-${a.id}`]).plants;
      const unit = rows.find((row) => row.key === 'plant_a2') as IndividualRosterRow;
      const founder = rows.find((row) => row.key === a.id) as IndividualRosterRow;
      const share = readPlantLight(state, DEFAULT_CONFIG)[5].needShare;

      expect(unit).toMatchObject({
        tag: '#3',
        title: 'Java Fern family 1 · #3',
        parent: '#2',
        figure: '20 %',
        age: '1 d',
        bank: '62 %',
      });
      expect(unit.light!.text).toBe(`${Math.floor(share * 100)} %`);
      expect(founder.parent).toBeNull();
    });

    it('gives a unit the light and the bank its ledger gives it', () => {
      const cap = DEFAULT_CONFIG.plants.surplusCap;
      const state = families((plant) => ({ surplus: plant.parentId ? cap / 3 : cap }));
      const ahead = readHourAhead(state, DEFAULT_CONFIG);
      const open = ['species-java_fern', ...state.plants.map((p) => `family-${p.familyId}`)];
      const units = tables(state, open).plants.filter(
        (row): row is IndividualRosterRow => row.kind === 'individual'
      );

      expect(units).toHaveLength(6);
      for (const row of units) {
        const ledger = readLedger(state, DEFAULT_CONFIG, ahead, { kind: 'plant', id: row.id })!;
        expect(`${ledger.light!.text} %`).toBe(row.light!.text);
        expect(ledger.light!.status).toBe(row.light!.status);
        expect(`${ledger.bank!.text} %`).toBe(row.bank);
        expect(ledger.bank!.unit).toBe('% to offshoot');
      }
    });
  });

  it('has nothing to show for a bare tank', () => {
    expect(tables(tank([]))).toEqual({ fish: [], plants: [] });
  });
});

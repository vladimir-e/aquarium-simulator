/**
 * The roster as two tables read the same way: a species header row that
 * expands to the individuals under it, in one row shape whether the column
 * holds a fish's mass or a plant's size. Everything here is formatting over
 * figures the run layer has already resolved — no vitality pass happens twice.
 */

import {
  SATIATION_BAND_LABEL,
  type Clutch,
  type FishSex,
  type FishSpecies,
  type PlantSpecies,
  FISH_SPECIES_DATA,
} from '../../simulation/index.js';
import type { LivestockConfig } from '../../simulation/config/livestock.js';
import {
  bandOf,
  bandStatus,
  type FryBatch,
  type Hunger,
  type SpeciesGroup,
} from './livestock.js';
import type { PlantSpeciesGroup } from './flora.js';
import {
  conditionStatus,
  conditionWord,
  STATUS_SEVERITY,
  worstReading,
  type Reading,
  type Status,
} from './status.js';
import type { ReadingBand } from './water.js';

/** The engine calls 60 and up healthy, on the 0–100 axis every organism is scored on. */
export const CONDITION_BAND: ReadingBand = { from: 0.6, to: 1 };

export type SpeciesId = FishSpecies | PlantSpecies;

/** Satiation, where the row belongs to something that eats. */
export interface Satiation {
  at: number;
  band: ReadingBand;
  status: Status;
  word: string;
}

interface Vital {
  /** Condition on the 0–100 axis, as a track fraction. */
  at: number;
  status: Status;
  word: string;
}

export interface SpeciesRosterRow extends Vital {
  /** Present where the group eats: the mean, and how many are hungry. */
  satiation: Satiation | null;
  kind: 'species';
  key: string;
  species: SpeciesId;
  name: string;
  count: number;
  /** Mass each for fish, mean size for plants. */
  figure: string;
  age: string;
  /** One per individual, in roster order. */
  dots: Status[];
  /** The individual a tap on the group inspects: its worst. */
  worstKey: string;
  expanded: boolean;
}

export interface IndividualRosterRow extends Vital {
  kind: 'individual';
  key: string;
  /** The engine id, for the actions that take one. */
  id: string;
  species: SpeciesId;
  name: string;
  shortId: string;
  sex: FishSex | null;
  figure: string;
  age: string;
  satiation: Satiation | null;
}

/**
 * Every fry in the tank in one row: stock it carries, not yet fish that breed,
 * and — because the sell action takes no batch — one row to sell them from.
 */
export interface FryRosterRow extends Vital {
  kind: 'fry';
  key: 'fry';
  name: string;
  count: number;
  /** The species mix behind the count. */
  caption: string;
  figure: string;
  age: string;
  satiation: Satiation | null;
}

/**
 * The algae: a population, not a roster of individuals — coverage in place of
 * a count, and no dots, because there is nobody in there to count.
 */
export interface PopulationRosterRow extends Vital {
  kind: 'population';
  key: 'algae';
  name: string;
  /** Coverage, as the reading book states it. */
  figure: string;
  /** What the figure counts, where there is room to say it. */
  caption: string;
  /** How fast it is moving, over the last day. */
  trend: string;
  band: ReadingBand | null;
}

export interface ClutchRosterRow {
  kind: 'clutch';
  key: string;
  species: FishSpecies;
  name: string;
  /** Eggs, and when they hatch. */
  figure: string;
  age: string;
}

export type RosterRow =
  | SpeciesRosterRow
  | IndividualRosterRow
  | PopulationRosterRow
  | FryRosterRow
  | ClutchRosterRow;

function shortId(id: string): string {
  return id.slice(id.indexOf('_') + 1);
}

function satiationBand(config: LivestockConfig): ReadingBand {
  return {
    from: config.satiationHungryCeiling / 100,
    to: config.satiationOverfedFloor / 100,
  };
}

interface Grouped {
  condition: number;
  satiation: number;
  hunger: Hunger | null;
}

/**
 * A group is as urgent as its worst channel, the same way one fish is: a shoal
 * every member of which is hungry does not read `thriving` off its condition.
 */
function groupVital(group: Grouped): Reading {
  const health: Reading = {
    status: conditionStatus(group.condition),
    word: conditionWord(group.condition),
  };
  if (!group.hunger) return health;

  return worstReading(health, {
    status: bandStatus(group.hunger.band),
    word: `${group.hunger.count} hungry`,
  });
}

/** The group's mean, spoken for by its hungry members where it has any. */
function groupSatiation(group: Grouped, config: LivestockConfig): Satiation {
  const mean = fishSatiation(group.satiation, config);
  return group.hunger
    ? { ...mean, status: bandStatus(group.hunger.band), word: `${group.hunger.count} hungry` }
    : mean;
}

function fishSatiation(satiation: number, config: LivestockConfig): Satiation {
  const band = bandOf(satiation, config);
  return {
    at: satiation / 100,
    band: satiationBand(config),
    status: bandStatus(band),
    word: SATIATION_BAND_LABEL[band].toLowerCase(),
  };
}

function days(hours: number): string {
  return `${Math.floor(hours / 24)} d`;
}

function worstOf<T>(items: T[], status: (item: T) => Status, key: (item: T) => string): string {
  const worst = items.reduce((a, b) =>
    STATUS_SEVERITY[status(b)] > STATUS_SEVERITY[status(a)] ? b : a
  );
  return key(worst);
}

function fishRows(
  groups: SpeciesGroup[],
  config: LivestockConfig,
  expanded: ReadonlySet<string>
): RosterRow[] {
  const rows: RosterRow[] = [];

  for (const group of groups) {
    const key = `species-${group.species}`;
    const open = expanded.has(key);

    rows.push({
      kind: 'species',
      key,
      species: group.species,
      name: group.name,
      count: group.count,
      figure: `${(group.massG / group.count).toFixed(2)} g each`,
      age: `${group.ageDays} d`,
      dots: group.members.map((member) => member.reading.status),
      satiation: groupSatiation(group, config),
      at: group.condition / 100,
      ...groupVital(group),
      worstKey: worstOf(
        group.members,
        (member) => member.reading.status,
        (member) => member.fish.id
      ),
      expanded: open,
    });

    if (!open) continue;

    for (const { fish, reading } of group.members) {
      rows.push({
        kind: 'individual',
        key: fish.id,
        id: fish.id,
        species: group.species,
        name: group.name,
        shortId: shortId(fish.id),
        sex: fish.sex,
        figure: `${fish.mass.toFixed(2)} g`,
        age: days(fish.age),
        satiation: fishSatiation(fish.satiation, config),
        at: fish.health / 100,
        ...reading,
      });
    }
  }

  return rows;
}

function plantRowsOf(
  groups: PlantSpeciesGroup[],
  expanded: ReadonlySet<string>
): RosterRow[] {
  const rows: RosterRow[] = [];

  for (const group of groups) {
    const key = `species-${group.species}`;
    const open = expanded.has(key);

    rows.push({
      kind: 'species',
      key,
      species: group.species,
      name: group.name,
      count: group.count,
      figure: `${Math.round(group.size)} % each`,
      age: '',
      dots: group.statuses,
      satiation: null,
      at: group.condition / 100,
      status: group.status,
      word: group.word,
      worstKey: worstOf(group.plants, (plant) => plant.status, (plant) => plant.id),
      expanded: open,
    });

    if (!open) continue;

    for (const plant of group.plants) {
      rows.push({
        kind: 'individual',
        key: plant.id,
        id: plant.id,
        species: plant.species,
        name: plant.name,
        shortId: shortId(plant.id),
        sex: null,
        figure: `${Math.round(plant.size)} %`,
        age: '',
        satiation: null,
        at: plant.condition / 100,
        status: plant.status,
        word: plant.word,
      });
    }
  }

  return rows;
}

function fryRow(batch: FryBatch, config: LivestockConfig): FryRosterRow {
  return {
    kind: 'fry',
    key: 'fry',
    name: 'Fry',
    count: batch.count,
    caption:
      batch.species.length === 1
        ? FISH_SPECIES_DATA[batch.species[0]].name
        : `${batch.species.length} species`,
    figure: `${(batch.massG / batch.count).toFixed(2)} g each`,
    age: `${batch.ageDays} d`,
    satiation: groupSatiation(batch, config),
    at: batch.condition / 100,
    ...groupVital(batch),
  };
}

function clutchRow(clutch: Clutch, tick: number): ClutchRosterRow {
  const data = FISH_SPECIES_DATA[clutch.species];
  const hatchTick = clutch.laidTick + data.breeding.hatchTime;
  return {
    kind: 'clutch',
    key: clutch.id,
    species: clutch.species,
    name: `${data.name} clutch`,
    figure: `${clutch.eggCount} eggs`,
    age: `hatches in ${Math.max(0, hatchTick - tick)} h`,
  };
}

export interface RosterInput {
  fish: SpeciesGroup[];
  plants: PlantSpeciesGroup[];
  /** Every fry in the tank, as the one row the sell action matches. */
  fry: FryBatch | null;
  clutches: Clutch[];
  tick: number;
}

/**
 * The two tables, in render order: species rows with their individuals
 * directly beneath them when open, then — under the fish — the clutches
 * waiting to hatch and the batches growing out.
 */
export function rosterTables(
  input: RosterInput,
  config: LivestockConfig,
  expanded: ReadonlySet<string>
): { fish: RosterRow[]; plants: RosterRow[] } {
  return {
    fish: [
      ...fishRows(input.fish, config, expanded),
      ...input.clutches.map((clutch) => clutchRow(clutch, input.tick)),
      ...(input.fry ? [fryRow(input.fry, config)] : []),
    ],
    plants: plantRowsOf(input.plants, expanded),
  };
}

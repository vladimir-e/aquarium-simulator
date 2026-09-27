/**
 * The roster as two tables read the same way: a species header row that
 * expands to what is under it — a fish species to its fish, a plant species to
 * its families and a family to its units — in one row shape whether the column
 * holds a fish's mass or a plant's size. Everything here is formatting over
 * figures the run layer has already resolved — no vitality pass happens twice.
 */

import {
  isAlgaeKind,
  type AlgaeKind,
  type Clutch,
  type FishSex,
  type FishSpecies,
  type PlantSpecies,
  FISH_SPECIES_DATA,
} from '../../simulation/index.js';
import { fishTitle, type FryBatch, type Gut, type SpeciesGroup } from './livestock.js';
import {
  familyTitle,
  sharePercent,
  unitTitle,
  type PlantFamily,
  type PlantRow,
  type PlantSpeciesGroup,
} from './flora.js';
import { worstMember, type Status } from './status.js';
import type { LedgerTarget } from './ledger.js';
import type { ReadingBand } from './water.js';

/** The engine calls 60 and up healthy, on the 0–100 axis every organism is scored on. */
export const CONDITION_BAND: ReadingBand = { from: 0.6, to: 1 };

export type SpeciesId = FishSpecies | PlantSpecies;

/** A plant's day of light at its own height, as a share of what its species starves under. */
export interface LightFigure {
  text: string;
  status: Status;
}

interface Vital {
  /** Condition on the 0–100 axis, as a track fraction. */
  at: number;
  status: Status;
  word: string;
}

export interface SpeciesRosterRow extends Vital {
  /** Present where the group eats: the mean, and how many are hungry. */
  gut: Gut | null;
  /** Present for plants: the worst-lit unit's. */
  light: LightFigure | null;
  kind: 'species';
  key: string;
  species: SpeciesId;
  name: string;
  /** Individuals under it, however the dots group them. */
  count: number;
  /** How a plant species' units fall into families; nothing for fish. */
  caption: string | null;
  /** Mass each for fish, the sizes summed for plants. */
  figure: string;
  /** Mean age for fish, the oldest unit for plants. */
  age: string;
  /** One per fish, or per plant family, in roster order. */
  dots: Status[];
  /** What one dot stands for. */
  dot: 'individual' | 'family';
  expanded: boolean;
}

/** A plant family under its species: the founder and every unit budded down its line. */
export interface FamilyRosterRow extends Vital {
  kind: 'family';
  key: string;
  familyId: string;
  species: PlantSpecies;
  name: string;
  /** Its number among the species' families. */
  label: string;
  /** Species and family, for what reads it out of the table. */
  title: string;
  /** Its units — what the dots count. */
  count: number;
  /** Its units' sizes, summed. */
  figure: string;
  /** The oldest unit's. */
  age: string;
  /** The worst-lit unit's. */
  light: LightFigure;
  /** One per unit, in birth order. */
  dots: Status[];
  expanded: boolean;
}

export interface IndividualRosterRow extends Vital {
  kind: 'individual';
  key: string;
  /** The engine id, for the actions that take one. */
  id: string;
  species: SpeciesId;
  name: string;
  /** How the row names it under its group. */
  tag: string;
  /** How anything reading it out of the table names it. */
  title: string;
  sex: FishSex | null;
  /** The unit a plant budded from, while it stands; null for a fish and for anything planted. */
  parent: string | null;
  figure: string;
  age: string;
  gut: Gut | null;
  light: LightFigure | null;
  /** How far a plant's bank is toward its next offshoot. */
  bank: string | null;
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
  gut: Gut | null;
}

/**
 * A bloom: a population, not a roster of individuals — coverage in place of a
 * count, and no dots, because there is nobody in there to count.
 */
export interface PopulationRosterRow extends Vital {
  kind: 'population';
  key: AlgaeKind;
  name: string;
  /** Coverage, as the reading book states it. */
  figure: string;
  /** What the figure counts, where there is room to say it. */
  caption: string;
  /** What the next tick does to it, per day. */
  trend: string;
  band: ReadingBand | null;
}

export interface ClutchRosterRow {
  kind: 'clutch';
  key: string;
  species: FishSpecies;
  name: string;
  /** Eggs standing, and how far developed. */
  figure: string;
  age: string;
}

export type RosterRow =
  | SpeciesRosterRow
  | FamilyRosterRow
  | IndividualRosterRow
  | PopulationRosterRow
  | FryRosterRow
  | ClutchRosterRow;

function speciesKey(species: SpeciesId): string {
  return `species-${species}`;
}

function familyKey(familyId: string): string {
  return `family-${familyId}`;
}

function days(hours: number): string {
  return `${Math.floor(hours / 24)} d`;
}

function fishRows(groups: SpeciesGroup[], expanded: ReadonlySet<string>): RosterRow[] {
  return groups.flatMap((group) => {
    const key = speciesKey(group.species);
    const open = expanded.has(key);
    const header: SpeciesRosterRow = {
      kind: 'species',
      key,
      species: group.species,
      name: group.name,
      count: group.count,
      caption: null,
      figure: `${(group.massG / group.count).toFixed(2)} g each`,
      age: `${group.ageDays} d`,
      gut: group.gut,
      light: null,
      dots: group.members.map((member) => member.reading.status),
      dot: 'individual',
      at: group.condition / 100,
      ...group.reading,
      expanded: open,
    };
    const fish = group.members.map(
      ({ id, number, condition, fish, gut, reading }): IndividualRosterRow => ({
        kind: 'individual',
        key: id,
        id,
        species: group.species,
        name: group.name,
        tag: `#${number}`,
        title: fishTitle(fish, number),
        sex: fish.sex,
        parent: null,
        figure: `${fish.mass.toFixed(2)} g`,
        age: days(fish.age),
        gut,
        light: null,
        bank: null,
        at: condition / 100,
        ...reading,
      })
    );
    return open ? [header, ...fish] : [header];
  });
}

function lightFigure(share: number, status: Status): LightFigure {
  return { text: `${sharePercent(share)} %`, status };
}

/** The sizes summed, rounded down like every plant figure: a group never reads growth it has not made. */
function summedSize(size: number): string {
  return `Σ ${Math.floor(size)} %`;
}

function families(count: number): string {
  return `${count} ${count === 1 ? 'family' : 'families'}`;
}

function plantUnit(plant: PlantRow): IndividualRosterRow {
  return {
    kind: 'individual',
    key: plant.id,
    id: plant.id,
    species: plant.species,
    name: plant.name,
    tag: `#${plant.label.unit}`,
    title: unitTitle(plant.name, plant.label),
    sex: null,
    parent: plant.label.parent === null ? null : `#${plant.label.parent}`,
    figure: `${Math.floor(plant.size)} %`,
    age: days(plant.age),
    gut: null,
    light: lightFigure(plant.light, plant.lightStatus),
    bank: `${sharePercent(plant.bank)} %`,
    at: plant.condition / 100,
    ...plant.reading,
  };
}

function familyRows(
  group: PlantSpeciesGroup,
  family: PlantFamily,
  expanded: ReadonlySet<string>
): RosterRow[] {
  const key = familyKey(family.familyId);
  const open = expanded.has(key);
  const header: FamilyRosterRow = {
    kind: 'family',
    key,
    familyId: family.familyId,
    species: group.species,
    name: group.name,
    label: `family ${family.number}`,
    title: familyTitle(group.name, family.members[0].label),
    count: family.members.length,
    figure: summedSize(family.size),
    age: days(family.oldest),
    light: lightFigure(family.light, family.lightStatus),
    dots: family.members.map((member) => member.reading.status),
    at: family.condition / 100,
    ...family.reading,
    expanded: open,
  };
  return open ? [header, ...family.members.map(plantUnit)] : [header];
}

function plantTable(groups: PlantSpeciesGroup[], expanded: ReadonlySet<string>): RosterRow[] {
  return groups.flatMap((group) => {
    const key = speciesKey(group.species);
    const open = expanded.has(key);
    const header: SpeciesRosterRow = {
      kind: 'species',
      key,
      species: group.species,
      name: group.name,
      count: group.members.length,
      caption: families(group.families.length),
      figure: summedSize(group.size),
      age: days(group.oldest),
      gut: null,
      light: lightFigure(group.light, group.lightStatus),
      dots: group.families.map((family) => family.reading.status),
      dot: 'family',
      at: group.condition / 100,
      ...group.reading,
      expanded: open,
    };
    return open
      ? [header, ...group.families.flatMap((family) => familyRows(group, family, expanded))]
      : [header];
  });
}

function fryRow(batch: FryBatch): FryRosterRow {
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
    gut: batch.gut,
    at: batch.condition / 100,
    ...batch.reading,
  };
}

function clutchRow(clutch: Clutch): ClutchRosterRow {
  const data = FISH_SPECIES_DATA[clutch.species];
  const carried = data.breeding.mode === 'livebearer';
  return {
    kind: 'clutch',
    key: clutch.id,
    species: clutch.species,
    name: `${data.name} ${carried ? 'brood' : 'clutch'}`,
    figure: `${Math.floor(clutch.eggs)} ${carried ? 'fry' : 'eggs'}`,
    age: `${Math.floor(clutch.development * 100)} % developed`,
  };
}

export interface RosterInput {
  fish: SpeciesGroup[];
  plants: PlantSpeciesGroup[];
  /** Every fry in the tank, as the one row the sell action matches. */
  fry: FryBatch | null;
  clutches: Clutch[];
}

/**
 * The two tables, in render order: species rows with what is under them
 * directly beneath when open, then — under the fish — the clutches
 * developing and the batches growing out.
 */
export function rosterTables(
  input: RosterInput,
  expanded: ReadonlySet<string>
): { fish: RosterRow[]; plants: RosterRow[] } {
  return {
    fish: [
      ...fishRows(input.fish, expanded),
      ...input.clutches.map(clutchRow),
      ...(input.fry ? [fryRow(input.fry)] : []),
    ],
    plants: plantTable(input.plants, expanded),
  };
}

/** What a roster row's key opens the ledger on, and the line saying why that one. */
export interface Inspection {
  target: LedgerTarget;
  subtitle: string;
}

/**
 * The ledger a row key opens, resolved afresh on every read: an individual by
 * its id, a bloom by its kind, or a group as its worst member at this hour — so a group's
 * ledger follows its worst and counts the group as it stands.
 */
export function inspection(
  key: string,
  roster: Pick<RosterInput, 'fish' | 'plants'>
): Inspection | null {
  if (isAlgaeKind(key)) return { target: { kind: 'algae', bloom: key }, subtitle: '' };
  for (const group of roster.fish) {
    if (speciesKey(group.species) === key) {
      return {
        target: { kind: 'fish', id: worstMember(group.members).id },
        subtitle: `the worst of ${group.count} ${group.name}`,
      };
    }
    if (group.members.some((member) => member.id === key)) {
      return { target: { kind: 'fish', id: key }, subtitle: '' };
    }
  }
  for (const group of roster.plants) {
    if (speciesKey(group.species) === key) {
      return {
        target: { kind: 'plant', id: worstMember(group.members).id },
        subtitle: `the worst of ${group.members.length} ${group.name}`,
      };
    }
    for (const family of group.families) {
      if (familyKey(family.familyId) === key) {
        return {
          target: { kind: 'plant', id: worstMember(family.members).id },
          subtitle: `the worst of ${family.members.length} in ${familyTitle(group.name, family.members[0].label)}`,
        };
      }
    }
    if (group.members.some((member) => member.id === key)) {
      return { target: { kind: 'plant', id: key }, subtitle: '' };
    }
  }
  return null;
}

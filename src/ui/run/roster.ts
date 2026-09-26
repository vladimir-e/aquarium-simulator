/**
 * The roster as two tables read the same way: a species header row that
 * expands to what is under it — a fish species to its fish, a plant species to
 * its families and a family to its units — in one row shape whether the column
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
import { sharePercent, type PlantFamily, type PlantRow, type PlantSpeciesGroup } from './flora.js';
import { lightStatus } from './light.js';
import { worstMember, type Status } from './status.js';
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
  satiation: Satiation | null;
  /** Present for plants: the worst-lit unit's. */
  light: LightFigure | null;
  kind: 'species';
  key: string;
  species: SpeciesId;
  name: string;
  /** What the dots count: fish, or a plant species' families. */
  count: number;
  /** Individuals under it, however the dots group them. */
  members: number;
  /** Mass each for fish, full units' worth for plants. */
  figure: string;
  /** Mean age for fish, the oldest unit for plants. */
  age: string;
  /** One per fish, or per plant family, in roster order. */
  dots: Status[];
  /** What one dot stands for. */
  dot: 'individual' | 'family';
  /** The individual a tap on the group inspects: its worst. */
  worstKey: string;
  expanded: boolean;
}

/** A plant family under its species: the founder and every unit budded down its line. */
export interface FamilyRosterRow extends Vital {
  kind: 'family';
  key: string;
  familyId: string;
  species: PlantSpecies;
  name: string;
  /** Named for its founder, which it outlives. */
  label: string;
  /** Its units — what the dots count. */
  count: number;
  /** Full units' worth. */
  figure: string;
  /** The oldest unit's. */
  age: string;
  /** The worst-lit unit's. */
  light: LightFigure;
  /** One per unit, in planting order. */
  dots: Status[];
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
  /** The unit a plant budded from; null for a fish and for anything planted. */
  parent: string | null;
  figure: string;
  age: string;
  satiation: Satiation | null;
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
  | FamilyRosterRow
  | IndividualRosterRow
  | PopulationRosterRow
  | FryRosterRow
  | ClutchRosterRow;

/** An engine id without its kind, the way the roster names an individual. */
export function shortId(id: string): string {
  return id.slice(id.indexOf('_') + 1);
}

function satiationBand(config: LivestockConfig): ReadingBand {
  return {
    from: config.satiationHungryCeiling / 100,
    to: config.satiationOverfedFloor / 100,
  };
}

interface Grouped {
  satiation: number;
  hunger: Hunger | null;
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

function fishRows(
  groups: SpeciesGroup[],
  config: LivestockConfig,
  expanded: ReadonlySet<string>
): RosterRow[] {
  return groups.flatMap((group) => {
    const key = `species-${group.species}`;
    const open = expanded.has(key);
    const header: SpeciesRosterRow = {
      kind: 'species',
      key,
      species: group.species,
      name: group.name,
      count: group.count,
      members: group.count,
      figure: `${(group.massG / group.count).toFixed(2)} g each`,
      age: `${group.ageDays} d`,
      satiation: groupSatiation(group, config),
      light: null,
      dots: group.members.map((member) => member.reading.status),
      dot: 'individual',
      at: group.condition / 100,
      ...group.reading,
      worstKey: worstMember(group.members).id,
      expanded: open,
    };
    const fish = group.members.map(
      ({ id, condition, fish, reading }): IndividualRosterRow => ({
        kind: 'individual',
        key: id,
        id,
        species: group.species,
        name: group.name,
        shortId: shortId(id),
        sex: fish.sex,
        parent: null,
        figure: `${fish.mass.toFixed(2)} g`,
        age: days(fish.age),
        satiation: fishSatiation(fish.satiation, config),
        light: null,
        bank: null,
        at: condition / 100,
        ...reading,
      })
    );
    return open ? [header, ...fish] : [header];
  });
}

function lightFigure(share: number): LightFigure {
  return { text: `${sharePercent(share)} %`, status: lightStatus(share) };
}

function units(amount: number): string {
  return `${amount.toFixed(1)} units`;
}

function plantUnit(plant: PlantRow): IndividualRosterRow {
  return {
    kind: 'individual',
    key: plant.id,
    id: plant.id,
    species: plant.species,
    name: plant.name,
    shortId: shortId(plant.id),
    sex: null,
    parent: plant.parentId === null ? null : shortId(plant.parentId),
    figure: `${Math.round(plant.size)} %`,
    age: days(plant.age),
    satiation: null,
    light: lightFigure(plant.light),
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
  const key = `family-${family.familyId}`;
  const open = expanded.has(key);
  const header: FamilyRosterRow = {
    kind: 'family',
    key,
    familyId: family.familyId,
    species: group.species,
    name: group.name,
    label: `family ${shortId(family.familyId)}`,
    count: family.members.length,
    figure: units(family.units),
    age: days(family.oldest),
    light: lightFigure(family.light),
    dots: family.members.map((member) => member.reading.status),
    at: family.condition / 100,
    ...family.reading,
    worstKey: worstMember(family.members).id,
    expanded: open,
  };
  return open ? [header, ...family.members.map(plantUnit)] : [header];
}

function plantRows(groups: PlantSpeciesGroup[], expanded: ReadonlySet<string>): RosterRow[] {
  return groups.flatMap((group) => {
    const key = `species-${group.species}`;
    const open = expanded.has(key);
    const header: SpeciesRosterRow = {
      kind: 'species',
      key,
      species: group.species,
      name: group.name,
      count: group.families.length,
      members: group.members.length,
      figure: units(group.units),
      age: days(group.oldest),
      satiation: null,
      light: lightFigure(group.light),
      dots: group.families.map((family) => family.reading.status),
      dot: 'family',
      at: group.condition / 100,
      ...group.reading,
      worstKey: worstMember(group.members).id,
      expanded: open,
    };
    return open
      ? [header, ...group.families.flatMap((family) => familyRows(group, family, expanded))]
      : [header];
  });
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
    ...batch.reading,
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
 * The two tables, in render order: species rows with what is under them
 * directly beneath when open, then — under the fish — the clutches waiting to
 * hatch and the batches growing out.
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
    plants: plantRows(input.plants, expanded),
  };
}

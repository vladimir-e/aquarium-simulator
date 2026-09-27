/**
 * Livestock grouping: fold the flat fish array into species rows and fry
 * batches, resolve what each fish's vitality is doing to it — its hunger
 * included, read off the hunger stressor — and lay the roster out as the flat
 * row list the table renders.
 */

import {
  FISH_SPECIES_DATA,
  gutCapacity,
  hungerLine,
  type Fish,
  type FishSpecies,
  type SimulationState,
  type VitalityBreakdown,
} from '../../simulation/index.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import type { LivestockConfig } from '../../simulation/config/livestock.js';
import type { HourAhead } from './ahead.js';
import { groupReading, vitalReading, worstReading, worstStatus, type Reading, type Status } from './status.js';
import { groupBy, mean, numbered } from './fold.js';
import type { ReadingBand } from './water.js';

/**
 * Off the hunger stressor: fed while it charges nothing, hungry once it does,
 * starving once hunger alone outruns everything the fish earns.
 */
export type GutBand = 'fed' | 'hungry' | 'starving';

export function gutBand({ stressors, benefitRate }: VitalityBreakdown): GutBand {
  const hunger = stressors.find((stressor) => stressor.key === 'hunger')?.amount ?? 0;
  if (hunger <= 0) return 'fed';
  return hunger < benefitRate ? 'hungry' : 'starving';
}

/** A starving fish its bank still heals whole reads no worse than a hungry one. */
export function gutStatus(band: GutBand, sick: boolean): Status {
  switch (band) {
    case 'fed':
      return 'ok';
    case 'hungry':
      return 'warn';
    case 'starving':
      return sick ? 'alert' : 'warn';
  }
}

export function countFry(fish: Fish[]): number {
  return fish.reduce((n, f) => n + (f.stage === 'fry' ? 1 : 0), 0);
}

/** How full a gut is, where the row belongs to something that eats. */
export interface Gut extends Reading {
  at: number;
  band: ReadingBand;
}

export interface FishGut extends Gut {
  word: GutBand;
}

/**
 * A fish's gut on its track, fed from the hunger line up — where it digests
 * its maintenance at the pace the water sets — in the band its vitality puts it.
 */
export function fishGut(
  fish: Fish,
  breakdown: VitalityBreakdown,
  sick: boolean,
  metabolicFactor: number,
  config: LivestockConfig
): FishGut {
  const word = gutBand(breakdown);
  const capacity = gutCapacity(fish, config);
  return {
    at: capacity > 0 ? fish.gut / capacity : 0,
    band: { from: hungerLine(metabolicFactor, config), to: 1 },
    status: gutStatus(word, sick),
    word,
  };
}

/**
 * How one fish reads, across every channel it keeps: its vital reading, and
 * its gut. One definition, so the roster row and the ledger header carry one
 * word.
 */
export function fishReading(vital: Reading, gut: Gut): Reading {
  return worstReading(vital, { status: gut.status, word: gut.word });
}

type Kin = Pick<Fish, 'id' | 'species' | 'stage'>;

/**
 * Every fish's number among its species at its stage, in the order it was
 * stocked or born — the way plants count. The ids stay the engine's; these are
 * the reader's.
 */
export function fishNumbers(fish: readonly Kin[]): Map<string, number> {
  return new Map(
    groupBy(fish, (f) => `${f.species}:${f.stage}`).flatMap((kind) => [
      ...numbered(kind.map((f) => f.id)),
    ])
  );
}

/** A fish as the console names it. */
export function fishTitle(fish: Kin, number: number): string {
  const name = FISH_SPECIES_DATA[fish.species].name;
  return `${name}${fish.stage === 'fry' ? ' fry' : ''} #${number}`;
}

/** One fish, with the vitality pass behind its row already spent. */
export interface FishRead {
  id: string;
  /** Its number among its species at its stage. */
  number: number;
  condition: number;
  sick: boolean;
  gut: FishGut;
  reading: Reading;
  fish: Fish;
}

/** Every fish in the tank, read on the hour the next tick settles, in `state.fish` order. */
export function readFish(state: SimulationState, config: TunableConfig, ahead: HourAhead): FishRead[] {
  const numbers = fishNumbers(state.fish);
  return state.fish.map((fish, i) => {
    const { vitality } = ahead.fish[i];
    const { sick, reading } = vitalReading(fish.health, vitality.newCondition);
    const gut = fishGut(fish, vitality.breakdown, sick, ahead.metabolicFactor, config.livestock);
    return {
      id: fish.id,
      number: numbers.get(fish.id)!,
      condition: fish.health,
      sick,
      gut,
      reading: fishReading(reading, gut),
      fish,
    };
  });
}

/**
 * The columns the table prints for one fish or one group. A group carries its
 * *total* mass against *average* age, gut and condition — mass is the
 * only figure that sums, because it is the only one bioload is made of.
 */
export interface RosterFigures {
  /** Body mass (g), summed over a group. */
  massG: number;
  /** Whole days lived, from the engine's tick-hours. */
  ageDays: number;
  /** How full the guts are on average, spoken for by the hungry where there are any. */
  gut: Gut;
  /** `Fish.health` on the 0–100 vitality axis. */
  condition: number;
}

interface RosterGroup extends RosterFigures {
  count: number;
  reading: Reading;
  /** The fish behind the row, each already read. */
  members: FishRead[];
}

export interface SpeciesGroup extends RosterGroup {
  species: FishSpecies;
  name: string;
}

/** Every fry in the tank as one batch — the unit {@link sellFry} takes. */
export interface FryBatch extends RosterGroup {
  /** The species mix behind the count. */
  species: FishSpecies[];
}

function groupGut(members: FishRead[]): Gut {
  const count = (band: GutBand): number => members.filter((member) => member.gut.word === band).length;
  const starving = count('starving');
  const hungry = count('hungry');
  return {
    at: mean(members.map((member) => member.gut.at)),
    band: members[0].gut.band,
    status: members.map((member) => member.gut.status).reduce(worstStatus),
    word: starving > 0 ? `${starving} starving` : hungry > 0 ? `${hungry} hungry` : 'fed',
  };
}

function groupFigures(members: FishRead[]): RosterGroup {
  const group = members.map((member) => member.fish);
  return {
    count: group.length,
    massG: group.reduce((sum, f) => sum + f.mass, 0),
    ageDays: Math.floor(mean(group.map((f) => f.age)) / 24),
    gut: groupGut(members),
    condition: mean(group.map((f) => f.health)),
    reading: groupReading(members),
    members,
  };
}

/** Adult fish folded into per-species rows, in first-seen order. */
export function groupBySpecies(fish: FishRead[]): SpeciesGroup[] {
  const adults = fish.filter((read) => read.fish.stage === 'adult');
  return groupBy(adults, (read) => read.fish.species).map((members) => ({
    species: members[0].fish.species,
    name: FISH_SPECIES_DATA[members[0].fish.species].name,
    ...groupFigures(members),
  }));
}

/** The tank's fry as one batch, or nothing if none are growing out. */
export function groupFry(fish: FishRead[]): FryBatch | null {
  const fry = fish.filter((read) => read.fish.stage === 'fry');
  if (fry.length === 0) return null;

  return {
    species: [...new Set(fry.map((read) => read.fish.species))],
    ...groupFigures(fry),
  };
}

/**
 * What the tank holds, in one line. Fry are counted apart from adults: they are
 * stock the tank is carrying, but not yet fish that breed.
 */
export function rosterSummary(state: SimulationState): string {
  const { fish, clutches } = state;
  const fry = countFry(fish);
  const adults = fish.length - fry;
  const species = new Set(fish.map((f) => f.species)).size;

  const clauses = [`${adults} fish`];
  if (species > 0) clauses.push(`${species} species`);
  if (clutches.length > 0) {
    clauses.push(`${clutches.length} clutch${clutches.length > 1 ? 'es' : ''}`);
  }
  if (fry > 0) clauses.push(`${fry} fry`);
  return clauses.join(' · ');
}

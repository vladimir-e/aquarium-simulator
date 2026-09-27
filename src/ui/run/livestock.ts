/**
 * Livestock grouping: fold the flat fish array into species rows and fry
 * batches, map how full each gut is onto the shared status vocabulary, resolve
 * what each fish's vitality is doing to it, and lay the roster out as the flat
 * row list the table renders.
 */

import {
  FISH_SPECIES_DATA,
  gutCapacity,
  hungerLine,
  type Fish,
  type FishSpecies,
  type SimulationState,
} from '../../simulation/index.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import type { LivestockConfig } from '../../simulation/config/livestock.js';
import type { HourAhead } from './ahead.js';
import { groupReading, vitalReading, worstReading, type Reading, type Status } from './status.js';
import { groupBy, mean, numbered } from './fold.js';
import type { ReadingBand } from './water.js';

/** Fed over the hunger line; hungry under it; starving under a quarter of it, where hunger charges most of its peak. */
export type GutBand = 'fed' | 'hungry' | 'starving';

const GUT_BAND_LABEL: Record<GutBand, string> = { fed: 'fed', hungry: 'hungry', starving: 'starving' };

/** Share of a full gut a fish holds. */
export function gutFullness(fish: Fish, config: LivestockConfig): number {
  const capacity = gutCapacity(fish, config);
  return capacity > 0 ? fish.gut / capacity : 0;
}

export function bandOf(fullness: number, config: LivestockConfig): GutBand {
  const line = hungerLine(config);
  if (fullness >= line) return 'fed';
  return fullness >= line / 4 ? 'hungry' : 'starving';
}

export function bandStatus(band: GutBand): Status {
  switch (band) {
    case 'fed':
      return 'ok';
    case 'hungry':
      return 'warn';
    case 'starving':
      return 'alert';
  }
}

export interface Hunger {
  count: number;
  /** The worst band among those counted — a group is as urgent as its worst fish. */
  band: GutBand;
}

/** Hunger across any set of fish — a species group, a fry batch, the whole tank. */
export function hungerOf(fish: Fish[], config: LivestockConfig): Hunger | null {
  let count = 0;
  let starving = false;
  for (const f of fish) {
    const band = bandOf(gutFullness(f, config), config);
    if (band === 'fed') continue;
    count++;
    if (band === 'starving') starving = true;
  }
  return count === 0 ? null : { count, band: starving ? 'starving' : 'hungry' };
}

export function countFry(fish: Fish[]): number {
  return fish.reduce((n, f) => n + (f.stage === 'fry' ? 1 : 0), 0);
}

/** How full a gut is, where the row belongs to something that eats. */
export interface Gut extends Reading {
  at: number;
  band: ReadingBand;
}

/** A gut on its track, fed from the hunger line up. */
export function fishGut(fullness: number, config: LivestockConfig): Gut {
  const band = bandOf(fullness, config);
  return {
    at: fullness,
    band: { from: hungerLine(config), to: 1 },
    status: bandStatus(band),
    word: GUT_BAND_LABEL[band],
  };
}

/**
 * How one fish reads, across every channel it keeps: its vital reading, and
 * how full its gut is. One definition, so the roster row and the ledger header
 * carry one word.
 */
export function fishReading(fish: Fish, vital: Reading, config: LivestockConfig): Reading {
  const { status, word } = fishGut(gutFullness(fish, config), config);
  return worstReading(vital, { status, word });
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
  reading: Reading;
  fish: Fish;
}

/** Every fish in the tank, read on the hour the next tick settles, in `state.fish` order. */
export function readFish(state: SimulationState, config: TunableConfig, ahead: HourAhead): FishRead[] {
  const numbers = fishNumbers(state.fish);
  return state.fish.map((fish, i) => {
    const { sick, reading } = vitalReading(fish.health, ahead.fish[i].vitality.newCondition);
    return {
      id: fish.id,
      number: numbers.get(fish.id)!,
      condition: fish.health,
      sick,
      reading: fishReading(fish, reading, config.livestock),
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
  /** Share of a full gut, averaged over a group. */
  fullness: number;
  band: GutBand;
  /** `Fish.health` on the 0–100 vitality axis. */
  condition: number;
}

interface RosterGroup extends RosterFigures {
  count: number;
  hunger: Hunger | null;
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

function groupFigures(members: FishRead[], config: LivestockConfig): RosterGroup {
  const group = members.map((member) => member.fish);
  const fullness = mean(group.map((f) => gutFullness(f, config)));
  return {
    count: group.length,
    massG: group.reduce((sum, f) => sum + f.mass, 0),
    ageDays: Math.floor(mean(group.map((f) => f.age)) / 24),
    fullness,
    band: bandOf(fullness, config),
    condition: mean(group.map((f) => f.health)),
    hunger: hungerOf(group, config),
    reading: groupReading(members),
    members,
  };
}

/** Adult fish folded into per-species rows, in first-seen order. */
export function groupBySpecies(fish: FishRead[], config: LivestockConfig): SpeciesGroup[] {
  const adults = fish.filter((read) => read.fish.stage === 'adult');
  return groupBy(adults, (read) => read.fish.species).map((members) => ({
    species: members[0].fish.species,
    name: FISH_SPECIES_DATA[members[0].fish.species].name,
    ...groupFigures(members, config),
  }));
}

/** The tank's fry as one batch, or nothing if none are growing out. */
export function groupFry(fish: FishRead[], config: LivestockConfig): FryBatch | null {
  const fry = fish.filter((read) => read.fish.stage === 'fry');
  if (fry.length === 0) return null;

  return {
    species: [...new Set(fry.map((read) => read.fish.species))],
    ...groupFigures(fry, config),
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

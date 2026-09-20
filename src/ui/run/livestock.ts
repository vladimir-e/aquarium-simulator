/**
 * Livestock grouping: fold the flat fish array into species rows and fry
 * batches, map satiation bands onto the shared status vocabulary, resolve what
 * each fish's vitality is doing to it, and lay the roster out as the flat row
 * list the table renders.
 */

import {
  FISH_SPECIES_DATA,
  SATIATION_BAND_LABEL,
  classifySatiationBandPosition,
  computeFishVitality,
  type Fish,
  type FishSpecies,
  type SatiationBand,
  type SimulationState,
  type VitalityBreakdown,
} from '../../simulation/index.js';
import type { LivestockConfig } from '../../simulation/config/livestock.js';
import { vitalReading, worstReading, type Reading, type Status } from './status.js';

/** Hungry and starving are the two bands that count toward "N hungry". */
export function isHungryBand(band: SatiationBand): boolean {
  return band === 'hungry' || band === 'starving';
}

export function bandOf(satiation: number, config: LivestockConfig): SatiationBand {
  return classifySatiationBandPosition(satiation, config).band;
}

/** Satiation band → bar/status colour. Overfed and hungry both warn; only
 *  starving is an alert, and peckish is the calm middle. */
export function bandStatus(band: SatiationBand): Status {
  switch (band) {
    case 'wellFed':
      return 'ok';
    case 'peckish':
      return 'neutral';
    case 'overfed':
    case 'hungry':
      return 'warn';
    case 'starving':
      return 'alert';
  }
}

export interface Hunger {
  count: number;
  /** The worst band among those counted — a group is as urgent as its worst fish. */
  band: SatiationBand;
}

/** Hunger across any set of fish — a species group, a fry batch, the whole tank. */
export function hungerOf(fish: Fish[], config: LivestockConfig): Hunger | null {
  let count = 0;
  let starving = false;
  for (const f of fish) {
    const band = bandOf(f.satiation, config);
    if (!isHungryBand(band)) continue;
    count++;
    if (band === 'starving') starving = true;
  }
  return count === 0 ? null : { count, band: starving ? 'starving' : 'hungry' };
}

export function countFry(fish: Fish[]): number {
  return fish.reduce((n, f) => n + (f.stage === 'fry' ? 1 : 0), 0);
}

/**
 * How one fish reads, across every channel it keeps: condition, the energy
 * ledger that can be emptying while condition holds, and how recently it ate.
 * One definition, so the roster row and the ledger header carry one word.
 */
export function fishReading(
  fish: Fish,
  breakdown: VitalityBreakdown,
  config: LivestockConfig
): Reading {
  const band = bandOf(fish.satiation, config);
  return worstReading(vitalReading(fish.health, fish.surplus, breakdown), {
    status: bandStatus(band),
    word: SATIATION_BAND_LABEL[band].toLowerCase(),
  });
}

/** One fish, with the vitality pass behind its row already spent. */
export interface FishRead {
  fish: Fish;
  reading: Reading;
}

function readFish(fish: Fish, state: SimulationState, config: LivestockConfig): FishRead {
  const { breakdown } = computeFishVitality(
    fish,
    state.resources,
    state.plants,
    state.resources.water,
    state.tank.capacity,
    config
  );

  return { fish, reading: fishReading(fish, breakdown, config) };
}

function groupBySpeciesKey(fish: Fish[]): Map<FishSpecies, Fish[]> {
  const groups = new Map<FishSpecies, Fish[]>();
  for (const f of fish) {
    const existing = groups.get(f.species);
    if (existing) existing.push(f);
    else groups.set(f.species, [f]);
  }
  return groups;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
}

/**
 * The columns the table prints for one fish or one group. A group carries its
 * *total* mass against *average* age, satiation and condition — mass is the
 * only figure that sums, because it is the only one bioload is made of.
 */
export interface RosterFigures {
  /** Body mass (g), summed over a group. */
  massG: number;
  /** Whole days lived, from the engine's tick-hours. */
  ageDays: number;
  satiation: number;
  band: SatiationBand;
  /** `Fish.health` on the 0–100 vitality axis. */
  condition: number;
}

interface RosterGroup extends RosterFigures {
  count: number;
  hunger: Hunger | null;
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

function groupFigures(
  group: Fish[],
  state: SimulationState,
  config: LivestockConfig
): RosterGroup {
  const satiation = mean(group.map((f) => f.satiation));
  return {
    count: group.length,
    massG: group.reduce((sum, f) => sum + f.mass, 0),
    ageDays: Math.floor(mean(group.map((f) => f.age)) / 24),
    satiation,
    band: bandOf(satiation, config),
    condition: mean(group.map((f) => f.health)),
    hunger: hungerOf(group, config),
    members: group.map((fish) => readFish(fish, state, config)),
  };
}

/** Adult fish folded into per-species rows, in first-seen order. */
export function groupBySpecies(state: SimulationState, config: LivestockConfig): SpeciesGroup[] {
  const adults = state.fish.filter((f) => f.stage === 'adult');
  return [...groupBySpeciesKey(adults)].map(([species, group]) => ({
    species,
    name: FISH_SPECIES_DATA[species].name,
    ...groupFigures(group, state, config),
  }));
}

/** The tank's fry as one batch, or nothing if none are growing out. */
export function groupFry(state: SimulationState, config: LivestockConfig): FryBatch | null {
  const fry = state.fish.filter((f) => f.stage === 'fry');
  if (fry.length === 0) return null;

  return {
    species: [...new Set(fry.map((f) => f.species))],
    ...groupFigures(fry, state, config),
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

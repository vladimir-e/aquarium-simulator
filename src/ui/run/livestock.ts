/**
 * Livestock grouping: fold the flat fish array into species rows and fry
 * batches, map satiation bands onto the shared status vocabulary, and lay the
 * roster out as the flat row list the table renders. Pure — the roster renders
 * whatever these return, so a 5-fish and a 500-fish tank produce the same
 * shapes.
 */

import {
  FISH_SPECIES_DATA,
  classifySatiationBandPosition,
  type Clutch,
  type Fish,
  type FishSex,
  type FishSpecies,
  type SatiationBand,
  type SimulationState,
} from '../../simulation/index.js';
import type { LivestockConfig } from '../../simulation/config/livestock.js';
import type { Status } from './status.js';

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

export function countHungry(fish: Fish[], config: LivestockConfig): number {
  return fish.reduce((n, f) => n + (isHungryBand(bandOf(f.satiation, config)) ? 1 : 0), 0);
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
 * The columns the table prints for one fish or one species. A species row
 * carries the group's *total* mass against *average* age, satiation and
 * condition — mass is the only figure that sums, because it is the only one
 * bioload is made of.
 */
export interface RosterFigures {
  /** Body mass (g), summed over a species group. */
  massG: number;
  /** Whole days lived, from the engine's tick-hours. */
  ageDays: number;
  satiation: number;
  band: SatiationBand;
  /** `Fish.health` on the 0–100 vitality axis. */
  condition: number;
}

export interface SpeciesGroup extends RosterFigures {
  species: FishSpecies;
  name: string;
  count: number;
  hungryCount: number;
  fish: Fish[];
}

function fishFigures(f: Fish, config: LivestockConfig): RosterFigures {
  return {
    massG: f.mass,
    ageDays: Math.floor(f.age / 24),
    satiation: f.satiation,
    band: bandOf(f.satiation, config),
    condition: f.health,
  };
}

/** Adult fish folded into per-species rows, in first-seen order. */
export function groupBySpecies(fish: Fish[], config: LivestockConfig): SpeciesGroup[] {
  const adults = fish.filter((f) => f.stage === 'adult');
  return [...groupBySpeciesKey(adults)].map(([species, group]) => {
    const satiation = mean(group.map((f) => f.satiation));
    return {
      species,
      name: FISH_SPECIES_DATA[species].name,
      count: group.length,
      massG: group.reduce((sum, f) => sum + f.mass, 0),
      ageDays: Math.floor(mean(group.map((f) => f.age)) / 24),
      satiation,
      band: bandOf(satiation, config),
      condition: mean(group.map((f) => f.health)),
      hungryCount: group.filter((f) => isHungryBand(bandOf(f.satiation, config))).length,
      fish: group,
    };
  });
}

export interface FryBatch {
  species: FishSpecies;
  name: string;
  count: number;
  /** Combined body mass of the batch (g). */
  massG: number;
  /** Whole days the batch has aged (from average age). */
  dayNow: number;
  /** Day number at which this species reaches adulthood. */
  graduationDay: number;
  /** Maturation, age/maturityAge as a percentage (0–100). */
  growthPct: number;
}

export function groupFryBatches(fish: Fish[]): FryBatch[] {
  const fry = fish.filter((f) => f.stage === 'fry');
  return [...groupBySpeciesKey(fry)].map(([species, group]) => ({
    species,
    name: FISH_SPECIES_DATA[species].name,
    count: group.length,
    massG: group.reduce((sum, f) => sum + f.mass, 0),
    ...deriveFryGraduation(
      group.map((f) => f.age),
      FISH_SPECIES_DATA[species].breeding.maturityAge
    ),
  }));
}

/**
 * Batch maturation, derived from the fry's average age against the species
 * maturity age (ticks are hours; a day is 24). `graduationDay` is where the
 * batch flips to adult; `growthPct` is how far along it is now.
 */
export function deriveFryGraduation(
  ages: number[],
  maturityAge: number
): { dayNow: number; graduationDay: number; growthPct: number } {
  const avgAge = mean(ages);
  return {
    dayNow: Math.floor(avgAge / 24),
    graduationDay: Math.max(1, Math.round(maturityAge / 24)),
    growthPct: maturityAge > 0 ? Math.max(0, Math.min(100, (avgAge / maturityAge) * 100)) : 100,
  };
}

/** The engine's ids are `<kind>_<time>_<seq>`; the kind is the table's column. */
function shortId(id: string): string {
  return id.slice(id.indexOf('_') + 1);
}

interface RosterRowBase {
  /** Stable React key — the engine id where there is one, the species where not. */
  key: string;
}

export interface SpeciesRosterRow extends RosterRowBase, RosterFigures {
  kind: 'species';
  species: FishSpecies;
  name: string;
  count: number;
  hungryCount: number;
  expanded: boolean;
}

export interface FishRosterRow extends RosterRowBase, RosterFigures {
  kind: 'fish';
  id: string;
  shortId: string;
  name: string;
  sex: FishSex;
}

export interface ClutchRosterRow extends RosterRowBase {
  kind: 'clutch';
  shortId: string;
  name: string;
  eggCount: number;
  laidTick: number;
  hatchTick: number;
  /** Ticks (hours) until hatch, floored at 0 once the clutch is due. */
  hoursToHatch: number;
}

export interface FryRosterRow extends RosterRowBase, Omit<FryBatch, 'species'> {
  kind: 'fry';
  species: FishSpecies;
}

export type RosterRow = SpeciesRosterRow | FishRosterRow | ClutchRosterRow | FryRosterRow;

/**
 * The roster in render order: each species row, its individuals directly
 * beneath it when expanded, then the clutches waiting to hatch and the fry
 * batches growing out.
 */
export function rosterRows(
  state: SimulationState,
  config: LivestockConfig,
  expanded: ReadonlySet<FishSpecies>
): RosterRow[] {
  const rows: RosterRow[] = [];

  for (const group of groupBySpecies(state.fish, config)) {
    const open = expanded.has(group.species);
    const { fish, ...figures } = group;
    rows.push({ kind: 'species', key: `species-${group.species}`, expanded: open, ...figures });
    if (!open) continue;
    for (const f of fish) {
      rows.push({
        kind: 'fish',
        key: f.id,
        id: f.id,
        shortId: shortId(f.id),
        name: group.name,
        sex: f.sex,
        ...fishFigures(f, config),
      });
    }
  }

  for (const clutch of state.clutches) {
    rows.push(clutchRow(clutch, state.tick));
  }

  for (const batch of groupFryBatches(state.fish)) {
    rows.push({ kind: 'fry', key: `fry-${batch.species}`, ...batch });
  }

  return rows;
}

function clutchRow(clutch: Clutch, tick: number): ClutchRosterRow {
  const hatchTick = clutch.laidTick + FISH_SPECIES_DATA[clutch.species].breeding.hatchTime;
  return {
    kind: 'clutch',
    key: clutch.id,
    shortId: shortId(clutch.id),
    name: `${FISH_SPECIES_DATA[clutch.species].name} clutch`,
    eggCount: clutch.eggCount,
    laidTick: clutch.laidTick,
    hatchTick,
    hoursToHatch: Math.max(0, hatchTick - tick),
  };
}

/**
 * What the tank holds, in one line — the index rail's livestock figure and the
 * stage's own meta are the same sentence, so the rail can never claim a roster
 * the section does not show. Fry are counted apart from adults: they are stock
 * the tank is carrying, but they are not yet fish that breed or hold territory.
 */
export function rosterSummary(state: SimulationState): string {
  const { fish, clutches } = state;
  const adults = fish.reduce((n, f) => n + (f.stage === 'adult' ? 1 : 0), 0);
  const fry = fish.length - adults;
  const species = new Set(fish.map((f) => f.species)).size;

  const clauses = [`${adults} fish`];
  if (species > 0) clauses.push(`${species} species`);
  if (clutches.length > 0) {
    clauses.push(`${clutches.length} clutch${clutches.length > 1 ? 'es' : ''}`);
  }
  if (fry > 0) clauses.push(`${fry} fry`);
  return clauses.join(' · ');
}

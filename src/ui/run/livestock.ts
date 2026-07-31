/**
 * Livestock grouping: fold the flat fish array into species rows and fry
 * batches, map satiation bands onto the shared status vocabulary, resolve what
 * each fish's vitality is doing to it, and lay the roster out as the flat row
 * list the table renders.
 */

import {
  FISH_SPECIES_DATA,
  classifySatiationBandPosition,
  computeFishVitality,
  type Clutch,
  type Fish,
  type FishSex,
  type FishSpecies,
  type SatiationBand,
  type SimulationState,
  type VitalityFactor,
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
 * What vitality is doing to one fish this hour: the factors behind its net rate,
 * and the reserve bank standing between that rate and its condition.
 */
export interface FishVitals {
  /** Condition change per hour — what the breakdown sums to. */
  net: number;
  stressors: VitalityFactor[];
  benefits: VitalityFactor[];
  /** Banked reserve: condition points the bank absorbs before condition falls. */
  reserve: number;
  reserveCap: number;
  /**
   * Condition reads full while the bank drains to hold it there. Without this
   * a fish thriving at 100 and a fish spending down its buffer at 100 are the
   * same reading.
   */
  burning: boolean;
}

function acting(factors: VitalityFactor[]): VitalityFactor[] {
  return factors.filter((f) => f.amount > 0);
}

export function fishVitals(
  fish: Fish,
  state: SimulationState,
  config: LivestockConfig
): FishVitals {
  const { breakdown } = computeFishVitality(
    fish,
    state.resources,
    state.plants,
    state.resources.water,
    state.tank.capacity,
    config
  );

  return {
    net: breakdown.net,
    stressors: acting(breakdown.stressors),
    benefits: acting(breakdown.benefits),
    reserve: fish.surplus,
    reserveCap: config.surplusCap,
    burning: fish.health >= 100 && breakdown.net < 0 && breakdown.drained > 0,
  };
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
  species: FishSpecies;
  name: string;
  count: number;
  hunger: Hunger | null;
  /** Any member holding condition by draining its reserve. */
  burning: boolean;
}

export interface SpeciesGroup extends RosterGroup {
  fish: Fish[];
}

export interface FryBatch extends RosterGroup {
  /** Day number at which the batch reaches adulthood. */
  graduationDay: number;
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

function groupFigures(
  species: FishSpecies,
  group: Fish[],
  state: SimulationState,
  config: LivestockConfig
): RosterGroup {
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
    hunger: hungerOf(group, config),
    burning: group.some((f) => fishVitals(f, state, config).burning),
  };
}

/** Adult fish folded into per-species rows, in first-seen order. */
export function groupBySpecies(state: SimulationState, config: LivestockConfig): SpeciesGroup[] {
  const adults = state.fish.filter((f) => f.stage === 'adult');
  return [...groupBySpeciesKey(adults)].map(([species, group]) => ({
    ...groupFigures(species, group, state, config),
    fish: group,
  }));
}

export function groupFryBatches(state: SimulationState, config: LivestockConfig): FryBatch[] {
  const fry = state.fish.filter((f) => f.stage === 'fry');
  return [...groupBySpeciesKey(fry)].map(([species, group]) => ({
    ...groupFigures(species, group, state, config),
    graduationDay: Math.max(1, Math.floor(FISH_SPECIES_DATA[species].breeding.maturityAge / 24)),
  }));
}

function shortId(id: string): string {
  return id.slice(id.indexOf('_') + 1);
}

interface RosterRowBase {
  /** Stable React key — the engine id where there is one, the species where not. */
  key: string;
}

export interface SpeciesRosterRow extends RosterRowBase, Omit<SpeciesGroup, 'fish'> {
  kind: 'species';
  expanded: boolean;
}

export interface FishRosterRow extends RosterRowBase, RosterFigures, FishVitals {
  kind: 'fish';
  id: string;
  shortId: string;
  name: string;
  sex: FishSex;
  /** Open on its own conditions breakdown. */
  expanded: boolean;
}

export interface ClutchRosterRow extends RosterRowBase {
  kind: 'clutch';
  shortId: string;
  name: string;
  eggCount: number;
  hatchTick: number;
  /** Ticks (hours) until hatch. */
  hoursToHatch: number;
}

export interface FryRosterRow extends RosterRowBase, FryBatch {
  kind: 'fry';
}

export type RosterRow = SpeciesRosterRow | FishRosterRow | ClutchRosterRow | FryRosterRow;

/**
 * The roster in render order: each species row, its individuals directly
 * beneath it when expanded, then the clutches waiting to hatch and the fry
 * batches growing out. Rows disclose by their own key, so one set opens both a
 * species and any individual inside it.
 */
export function rosterRows(
  state: SimulationState,
  config: LivestockConfig,
  expanded: ReadonlySet<string>
): RosterRow[] {
  const rows: RosterRow[] = [];

  for (const group of groupBySpecies(state, config)) {
    const key = `species-${group.species}`;
    const open = expanded.has(key);
    const { fish, ...figures } = group;
    rows.push({ kind: 'species', key, expanded: open, ...figures });
    if (!open) continue;
    for (const f of fish) {
      rows.push({
        kind: 'fish',
        key: f.id,
        id: f.id,
        shortId: shortId(f.id),
        name: group.name,
        sex: f.sex,
        expanded: expanded.has(f.id),
        ...fishFigures(f, config),
        ...fishVitals(f, state, config),
      });
    }
  }

  for (const clutch of state.clutches) {
    rows.push(clutchRow(clutch, state.tick));
  }

  for (const batch of groupFryBatches(state, config)) {
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
    hatchTick,
    hoursToHatch: hatchTick - tick,
  };
}

/**
 * What the tank holds, in one line — the index rail's livestock figure and the
 * stage's own meta are the same sentence, so the rail can never claim a roster
 * the section does not show. Fry are counted apart from adults: they are stock
 * the tank is carrying, but not yet fish that breed.
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

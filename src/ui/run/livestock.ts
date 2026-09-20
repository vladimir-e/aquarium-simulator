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
  type Fish,
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

/**
 * Why one organism is where it is: the engine's own factor lists, split into
 * what helps and what hurts, with the bank standing between the two and the
 * condition they add up to. Nothing is named here that the vitality pass did
 * not already charge — a factor the reader sees is a factor the tick applied.
 */

import {
  computeAlgaePopulation,
  computeFishVitality,
  FISH_SPECIES_DATA,
  PLANT_SPECIES_DATA,
  SATIATION_BAND_LABEL,
  type SimulationState,
  type VitalityFactor,
} from '../../simulation/index.js';
import { readPlantVitality } from '../../simulation/plants/index.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import { algaeStatus, algaeWord } from './flora.js';
import { bandOf, bandStatus, fishReading } from './livestock.js';
import { CONDITION_BAND, type Satiation, type SpeciesId } from './roster.js';
import { conditionStatus, vitalReading, type Status } from './status.js';
import type { ReadingBand } from './water.js';

/** What the ledger is open on. Algae is a population, so it carries no id. */
export type LedgerTarget =
  | { kind: 'fish'; id: string }
  | { kind: 'plant'; id: string }
  | { kind: 'algae' };

/** One line of the ledger: a factor, at the rate the reader's day is measured in. */
export interface LedgerFactor {
  key: string;
  label: string;
  /** Magnitude in condition points per day; the column carries the sign. */
  perDay: number;
}

/** A stock the organism keeps against the bill, where it keeps one. */
export interface LedgerBank {
  value: number;
  cap: number;
  at: number;
  /** What the bank is doing: holding condition up, or filling. */
  note: string;
}

export interface Ledger {
  target: LedgerTarget;
  species: SpeciesId | 'algae';
  title: string;
  /** Which individual this is, when the group chose it. */
  subtitle: string;
  /** The worst channel: what the header word says. */
  status: Status;
  word: string;
  /** The hero figure: condition for an organism, coverage for the algae. */
  value: string;
  /** How the hero figure itself reads — a fed-up fish at full condition is ink. */
  valueStatus: Status;
  unit: string;
  at: number;
  band: ReadingBand | null;
  /** Net change per day, as a trend. */
  trend: string;
  satiation: Satiation | null;
  helping: LedgerFactor[];
  hurting: LedgerFactor[];
  helps: number;
  hurts: number;
  net: number;
  bank: LedgerBank | null;
  /** What the species asks of the two devices set for it; plants only. */
  demand: string | null;
  /** The verb that moves this organism, or none where the reader has no lever. */
  verb: 'Feed' | 'Trim' | 'Scrub';
}

const PER_DAY = 24;

function factors(list: VitalityFactor[]): LedgerFactor[] {
  return list
    .filter((factor) => factor.amount > 0)
    .map((factor) => ({
      key: factor.key,
      label: factor.label,
      perDay: factor.amount * PER_DAY,
    }))
    .sort((a, b) => b.perDay - a.perDay);
}

function sum(list: LedgerFactor[]): number {
  return list.reduce((total, factor) => total + factor.perDay, 0);
}

function trendOf(netPerHour: number): string {
  const perDay = netPerHour * PER_DAY;
  if (Math.abs(perDay) < 0.05) return 'steady';
  return `${perDay > 0 ? '↗' : '↘'} ${Math.abs(perDay).toFixed(1)}/d`;
}

function bankOf(value: number, cap: number, drained: boolean): LedgerBank {
  return {
    value,
    cap,
    at: cap > 0 ? Math.min(1, value / cap) : 0,
    note: drained ? 'paying out to hold condition' : 'banked against a bad day',
  };
}

function fishLedger(
  state: SimulationState,
  config: TunableConfig,
  id: string,
  subtitle: string
): Ledger | null {
  const fish = state.fish.find((f) => f.id === id);
  if (!fish) return null;

  const livestock = config.livestock;
  const { breakdown } = computeFishVitality(
    fish,
    state.resources,
    state.plants,
    state.resources.water,
    state.tank.capacity,
    livestock
  );

  const helping = factors(breakdown.benefits);
  const hurting = factors([...breakdown.upkeep, ...breakdown.stressors]);
  const band = bandOf(fish.satiation, livestock);
  const reading = fishReading(fish, breakdown, livestock);

  return {
    target: { kind: 'fish', id },
    species: fish.species,
    title: `${FISH_SPECIES_DATA[fish.species].name} ${id.slice(id.indexOf('_') + 1)}`,
    subtitle,
    status: reading.status,
    word: reading.word,
    value: Math.round(fish.health).toString(),
    valueStatus: conditionStatus(fish.health),
    unit: '% condition',
    at: fish.health / 100,
    band: CONDITION_BAND,
    trend: trendOf(breakdown.net),
    satiation: {
      at: fish.satiation / 100,
      band: {
        from: livestock.satiationHungryCeiling / 100,
        to: livestock.satiationOverfedFloor / 100,
      },
      status: bandStatus(band),
      word: SATIATION_BAND_LABEL[band].toLowerCase(),
    },
    helping,
    hurting,
    helps: sum(helping),
    hurts: sum(hurting),
    net: breakdown.net * PER_DAY,
    bank: bankOf(fish.surplus, livestock.surplusCap, breakdown.drained > 0),
    demand: null,
    verb: 'Feed',
  };
}

function plantLedger(
  state: SimulationState,
  config: TunableConfig,
  id: string,
  subtitle: string
): Ledger | null {
  const index = state.plants.findIndex((plant) => plant.id === id);
  if (index < 0) return null;

  const plant = state.plants[index];
  const { breakdown } = readPlantVitality(state, config)[index];
  const data = PLANT_SPECIES_DATA[plant.species];
  const helping = factors(breakdown.benefits);
  const hurting = factors([...breakdown.upkeep, ...breakdown.stressors]);
  const reading = vitalReading(plant.condition, plant.surplus, breakdown);
  const [lightLow, lightHigh] = data.tolerableLight;
  const [co2Low, co2High] = data.tolerableCO2;

  return {
    target: { kind: 'plant', id },
    species: plant.species,
    title: `${data.name} ${id.slice(id.indexOf('_') + 1)}`,
    subtitle,
    status: reading.status,
    word: reading.word,
    value: Math.round(plant.condition).toString(),
    valueStatus: conditionStatus(plant.condition),
    unit: '% condition',
    at: plant.condition / 100,
    band: CONDITION_BAND,
    trend: trendOf(breakdown.net),
    satiation: null,
    helping,
    hurting,
    helps: sum(helping),
    hurts: sum(hurting),
    net: breakdown.net * PER_DAY,
    bank: bankOf(plant.surplus, config.plants.surplusCap, breakdown.drained > 0),
    demand:
      `${data.nutrientDemand} demand · light ${lightLow}–${lightHigh} PAR · ` +
      `CO₂ ${co2Low}–${co2High} mg/L`,
    verb: 'Trim',
  };
}

function algaeLedger(state: SimulationState, config: TunableConfig): Ledger {
  const population = computeAlgaePopulation({
    plants: state.plants,
    resources: state.resources,
    algaeConfig: config.algae,
    nutrientsConfig: config.nutrients,
  });
  const mass = state.algae.mass;
  const helping = factors(population.breakdown.benefits);
  const hurting = factors(population.breakdown.stressors);

  return {
    target: { kind: 'algae' },
    species: 'algae',
    title: 'Algae',
    subtitle: 'the tank’s one uninvited population',
    status: algaeStatus(mass),
    word: algaeWord(mass),
    value: Math.round(mass).toString(),
    valueStatus: algaeStatus(mass),
    unit: '% coverage',
    at: mass / 100,
    band: { from: 0, to: 0.3 },
    trend: trendOf(population.net),
    satiation: null,
    helping,
    hurting,
    helps: sum(helping),
    hurts: sum(hurting),
    net: population.net * PER_DAY,
    bank: null,
    demand: null,
    verb: 'Scrub',
  };
}

/**
 * The ledger for whatever the reader tapped. `subtitle` is the caller's line
 * about *why* this individual — a group hands its worst member over, and says
 * so rather than opening on an unexplained fish.
 */
export function readLedger(
  state: SimulationState,
  config: TunableConfig,
  target: LedgerTarget,
  subtitle = ''
): Ledger | null {
  switch (target.kind) {
    case 'fish':
      return fishLedger(state, config, target.id, subtitle);
    case 'plant':
      return plantLedger(state, config, target.id, subtitle);
    case 'algae':
      return algaeLedger(state, config);
  }
}

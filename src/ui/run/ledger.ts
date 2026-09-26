/**
 * Why one organism is where it is: the engine's own factor lists, split into
 * what helps and what hurts, with the bank standing between the two and the
 * condition they add up to. Nothing is named here that the vitality pass did
 * not already charge — a factor the reader sees is a factor the tick applied.
 */

import {
  FISH_SPECIES_DATA,
  PLANT_SPECIES_DATA,
  SATIATION_BAND_LABEL,
  spendSurplus,
  type SimulationState,
  type VitalityFactor,
} from '../../simulation/index.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import type { VerbId } from '../actions/verbs.js';
import { readHourAhead, type HourAhead } from './ahead.js';
import { algaeStatus, algaeWord } from './flora.js';
import { bandOf, bandStatus, fishReading } from './livestock.js';
import { CONDITION_BAND, type Satiation, type SpeciesId } from './roster.js';
import { conditionStatus, PER_DAY, trendOf, vitalReading, type Status } from './status.js';
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

/** Banked income that heals condition, where the organism keeps one. */
export interface LedgerBank {
  text: string;
  cap: number;
  at: number;
  /** What the bank is doing this hour. */
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
  /** Condition change per day — net plus what the bank healed — as a trend. */
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
  /** The verb that moves this organism — an id the stage opens the sheet on. */
  verb: Extract<VerbId, 'feed' | 'trimPlants' | 'scrubAlgae'>;
}

const BANK_DECIMALS = 1;

/** Whether a bank figure, or a day of a flow through it, shows at the bank's precision. */
function shows(amount: number): boolean {
  return amount >= 0.5 / 10 ** BANK_DECIMALS;
}

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

interface BankHour {
  now: number;
  next: number;
  cap: number;
  healed: number;
  grown?: number;
}

/** What the bank does over the hour, named by which way it moves: in, out and on what, or neither. */
function bankNote({ now, next, cap, healed, grown = 0 }: BankHour): string {
  const change = (next - now) * PER_DAY;
  if (shows(change)) return 'banking';
  if (shows(-change)) return healed >= grown ? 'healing from reserve' : 'buying growth';
  return now >= cap ? 'full' : shows(now) ? 'held against a bad day' : 'empty';
}

function bankOf(hour: BankHour): LedgerBank {
  const { now, cap } = hour;
  return {
    text: now.toFixed(BANK_DECIMALS),
    cap,
    at: cap > 0 ? Math.min(1, now / cap) : 0,
    note: bankNote(hour),
  };
}

function fishLedger(
  state: SimulationState,
  config: TunableConfig,
  ahead: HourAhead,
  id: string,
  subtitle: string
): Ledger | null {
  const index = state.fish.findIndex((f) => f.id === id);
  if (index < 0) return null;

  const fish = state.fish[index];
  const livestock = config.livestock;
  const vitality = ahead.fish[index];
  const { breakdown } = vitality;

  const helping = factors(breakdown.benefits);
  const hurting = factors(breakdown.stressors);
  const band = bandOf(fish.satiation, livestock);
  const vital = vitalReading(fish.health, vitality);
  const reading = fishReading(fish, vital.reading, livestock);

  return {
    target: { kind: 'fish', id },
    species: fish.species,
    title: `${FISH_SPECIES_DATA[fish.species].name} ${id.slice(id.indexOf('_') + 1)}`,
    subtitle,
    status: reading.status,
    word: reading.word,
    value: vital.value,
    valueStatus: conditionStatus(fish.health),
    unit: '% condition',
    at: fish.health / 100,
    band: CONDITION_BAND,
    trend: vital.trend,
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
    bank: bankOf({
      now: fish.surplus,
      next: vitality.surplus,
      cap: livestock.surplusCap,
      healed: breakdown.healed,
    }),
    demand: null,
    verb: 'feed',
  };
}

function plantLedger(
  state: SimulationState,
  config: TunableConfig,
  ahead: HourAhead,
  id: string,
  subtitle: string
): Ledger | null {
  const index = state.plants.findIndex((plant) => plant.id === id);
  if (index < 0) return null;

  const plant = state.plants[index];
  const vitality = ahead.plants[index];
  const { breakdown } = vitality;
  const grown = spendSurplus(
    { ...plant, condition: vitality.newCondition, surplus: vitality.surplus },
    config.plants
  );
  const data = PLANT_SPECIES_DATA[plant.species];
  const helping = factors(breakdown.benefits);
  const hurting = factors(breakdown.stressors);
  const { reading, value, trend } = vitalReading(plant.condition, vitality);
  const [lightLow, lightHigh] = data.tolerableLight;

  return {
    target: { kind: 'plant', id },
    species: plant.species,
    title: `${data.name} ${id.slice(id.indexOf('_') + 1)}`,
    subtitle,
    status: reading.status,
    word: reading.word,
    value,
    valueStatus: conditionStatus(plant.condition),
    unit: '% condition',
    at: plant.condition / 100,
    band: CONDITION_BAND,
    trend,
    satiation: null,
    helping,
    hurting,
    helps: sum(helping),
    hurts: sum(hurting),
    net: breakdown.net * PER_DAY,
    bank: bankOf({
      now: plant.surplus,
      next: grown.surplus,
      cap: config.plants.surplusCap,
      healed: breakdown.healed,
      grown: vitality.surplus - grown.surplus,
    }),
    demand:
      `${data.nutrientDemand} demand · light ${lightLow}–${lightHigh} PAR · ${data.co2Requirement} CO₂`,
    verb: 'trimPlants',
  };
}

function algaeLedger(state: SimulationState, ahead: HourAhead): Ledger {
  const population = ahead.algae;
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
    verb: 'scrubAlgae',
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
  const ahead = readHourAhead(state, config);
  switch (target.kind) {
    case 'fish':
      return fishLedger(state, config, ahead, target.id, subtitle);
    case 'plant':
      return plantLedger(state, config, ahead, target.id, subtitle);
    case 'algae':
      return algaeLedger(state, ahead);
  }
}

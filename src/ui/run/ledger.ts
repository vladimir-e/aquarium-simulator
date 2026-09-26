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
  type SimulationState,
  type VitalityFactor,
} from '../../simulation/index.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import type { VerbId } from '../actions/verbs.js';
import { TICKS_PER_DAY } from '../utils/clock.js';
import type { HourAhead } from './ahead.js';
import { algaeReading, algaeStatus } from './flora.js';
import { bandOf, bandStatus, fishReading } from './livestock.js';
import { CONDITION_BAND, type Satiation, type SpeciesId } from './roster.js';
import { conditionStatus, projectedTrend, vitalReading, type Status } from './status.js';
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
  /** What the next tick does to the hero figure, per day. */
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

/** The precision a factor, a sum and the net print at, per day. */
export const LEDGER_DECIMALS = 1;

const BANK_DECIMALS = 1;

/** Whether an amount shows at a precision rather than rounding to nothing. */
function shows(amount: number, decimals: number): boolean {
  return amount >= 0.5 / 10 ** decimals;
}

/** The factors that print, worst first: one rounding to nothing is not a line. */
function factors(list: VitalityFactor[]): LedgerFactor[] {
  return list
    .map((factor) => ({
      key: factor.key,
      label: factor.label,
      perDay: factor.amount * TICKS_PER_DAY,
    }))
    .filter((factor) => shows(factor.perDay, LEDGER_DECIMALS))
    .sort((a, b) => b.perDay - a.perDay);
}

/** Every factor charged, per day — the lines that print and those too small to. */
function total(list: VitalityFactor[]): number {
  return list.reduce((sum, factor) => sum + factor.amount, 0) * TICKS_PER_DAY;
}

interface BankHour {
  now: number;
  next: number;
  cap: number;
  healed: number;
  /** What the bank bought beside healing — a plant's growth, a fish's brood. */
  spent: number;
  /** The note for a bank drawn on to buy it. */
  buying: string;
}

/**
 * What the bank does over the hour, named by which way it moves: in, out and on
 * what, or neither. A bank held to a lowered cap drops with nothing drawn, and
 * reads as the full bank it is.
 */
function bankNote({ now, next, cap, healed, spent, buying }: BankHour): string {
  const change = (next - now) * TICKS_PER_DAY;
  if (shows(change, BANK_DECIMALS)) return 'banking';
  if (!shows(now, BANK_DECIMALS)) return 'empty';
  if (shows(-change, BANK_DECIMALS) && healed + spent > 0) {
    return healed >= spent ? 'healing from reserve' : buying;
  }
  return now >= cap ? 'full' : 'held against a bad day';
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
  const { vitality, bank } = ahead.fish[index];
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
    helps: total(breakdown.benefits),
    hurts: total(breakdown.stressors),
    net: breakdown.net * TICKS_PER_DAY,
    bank: bankOf({
      now: fish.surplus,
      next: bank,
      cap: livestock.surplusCap,
      healed: breakdown.healed,
      spent: vitality.surplus - bank,
      buying: 'buying a brood',
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
  const { vitality, bank } = ahead.plants[index];
  const { breakdown } = vitality;
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
    helps: total(breakdown.benefits),
    hurts: total(breakdown.stressors),
    net: breakdown.net * TICKS_PER_DAY,
    bank: bankOf({
      now: plant.surplus,
      next: bank,
      cap: config.plants.surplusCap,
      healed: breakdown.healed,
      spent: vitality.surplus - bank,
      buying: 'buying growth',
    }),
    demand:
      `${data.nutrientDemand} demand · light ${lightLow}–${lightHigh} PAR · ${data.co2Requirement} CO₂`,
    verb: 'trimPlants',
  };
}

function algaeLedger(state: SimulationState, ahead: HourAhead): Ledger {
  const { breakdown, net } = ahead.algae;
  const mass = state.algae.mass;

  return {
    target: { kind: 'algae' },
    species: 'algae',
    title: 'Algae',
    subtitle: 'the tank’s one uninvited population',
    ...algaeReading(mass),
    value: Math.round(mass).toString(),
    valueStatus: algaeStatus(mass),
    unit: '% coverage',
    at: mass / 100,
    band: { from: 0, to: 0.3 },
    trend: projectedTrend(ahead.algaeMass - mass),
    satiation: null,
    helping: factors(breakdown.benefits),
    hurting: factors(breakdown.stressors),
    helps: total(breakdown.benefits),
    hurts: total(breakdown.stressors),
    net: net * TICKS_PER_DAY,
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
  ahead: HourAhead,
  target: LedgerTarget,
  subtitle = ''
): Ledger | null {
  switch (target.kind) {
    case 'fish':
      return fishLedger(state, config, ahead, target.id, subtitle);
    case 'plant':
      return plantLedger(state, config, ahead, target.id, subtitle);
    case 'algae':
      return algaeLedger(state, ahead);
  }
}

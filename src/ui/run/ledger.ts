/**
 * Why one organism is where it is: the engine's own factor lists, split into
 * what helps and what hurts, with the bank standing between the two and the
 * condition they add up to. Nothing is named here that the vitality pass did
 * not already charge — a factor the reader sees is a factor the tick applied.
 */

import {
  ALGAE,
  ALGAE_KINDS,
  PLANT_SPECIES_DATA,
  plantLightTaken,
  REMOVED_BY,
  type AlgaeHabitat,
  type AlgaeKind,
  type BloomRemoval,
  type Light,
  type LightPath,
  type SimulationState,
  type VitalityFactor,
} from '../../simulation/index.js';
import { habitatPlaces, namePlaces } from '../../simulation/algae/index.js';
import { BLOOM_COVERAGE_LINE, PLANT_LIGHT_LINE } from '../../simulation/alerts/index.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import type { VerbId, VerbScope } from '../actions/verbs.js';
import { TICKS_PER_DAY } from '../utils/clock.js';
import { COVERAGE_DECIMALS } from '../utils/units.js';
import type { HourAhead } from './ahead.js';
import { algaeReading, lightTakenStatus, plantLabels, sharePercent, unitTitle } from './flora.js';
import { crownBurns, lightStatus, plantLightStatus } from './light.js';
import { fishGut, fishNumbers, fishReading, fishTitle, type Gut } from './livestock.js';
import { CONDITION_BAND, type SpeciesId } from './roster.js';
import {
  bankShare,
  conditionStatus,
  printsAsZero,
  projectedTrend,
  vitalReading,
  type Status,
} from './status.js';
import type { ReadingBand } from './water.js';

/** What the ledger is open on. A bloom is a population, so it carries its kind rather than an id. */
export type LedgerTarget =
  | { kind: 'fish'; id: string }
  | { kind: 'plant'; id: string }
  | { kind: 'algae'; bloom: AlgaeKind };

/** One line of the ledger: a factor, at the rate the reader's day is measured in. */
export interface LedgerFactor {
  key: string;
  label: string;
  /** Magnitude in condition points per day; the column carries the sign. */
  perDay: number;
}

/** Banked income, standing between what helps and what hurts. */
export interface LedgerBank {
  text: string;
  unit: string;
  /** Its share of the cap. */
  at: number;
  /** What the bank is doing this hour. */
  note: string;
}

/** One taker on the light's way from the lamp to a leaf: what it did to what reached it, %. */
export interface LightStep {
  key: string;
  label: string;
  /** Signed: a taker takes, and a crown sparser than a full unit's gives. */
  change: number;
}

/** What the lamp lands on a plant's leaf, and what took the rest on the way. */
export interface LightPathView {
  heading: string;
  steps: LightStep[];
}

/** A reading beside the hero figure: an organism's day of light, or a bloom's coverage. */
export interface LedgerRow {
  text: string;
  at: number;
  band: ReadingBand;
  status: Status;
  /** Where it is read, or which way it is going. */
  note: string;
}

const LIGHT_SCALE = 2;

export interface Ledger {
  target: LedgerTarget;
  species: SpeciesId | AlgaeKind;
  title: string;
  /** Which individual this is, when the group chose it. */
  subtitle: string;
  /** The worst channel: what the header word says. */
  status: Status;
  word: string;
  /** The hero figure: condition. */
  value: string;
  /** How the hero figure itself reads — a fed-up fish at full condition is ink. */
  valueStatus: Status;
  unit: string;
  at: number;
  band: ReadingBand | null;
  /** What the next tick does to the hero figure, per day. */
  trend: string;
  gut: Gut | null;
  /** The day's light against what the organism starves under, % of that need. */
  light: LedgerRow | null;
  /** A plant's light from the lamp to its leaf. */
  lightPath: LightPathView | null;
  /** How much of its habitat a bloom fills, %. */
  coverage: LedgerRow | null;
  /** The share of the plants' light a bloom takes, % — while anything is planted. */
  lightTaken: LedgerRow | null;
  helping: LedgerFactor[];
  hurting: LedgerFactor[];
  helps: number;
  hurts: number;
  net: number;
  bank: LedgerBank | null;
  /** What the species asks of the tank; plants and blooms. */
  demand: string | null;
  /** The verb that moves this organism — an id the stage opens the sheet on. */
  verb: Extract<VerbId, 'feed' | 'trimPlants' | 'scrubAlgae' | 'waterChange'>;
  /** What the verb is held to: a plant's own family. */
  scope: VerbScope | null;
}

/** The precision a factor, a sum and the net print at, per day. */
export const LEDGER_DECIMALS = 1;

const BANK_DECIMALS = 1;

/** Whether a positive amount shows at a precision rather than rounding to nothing. */
function shows(amount: number, decimals: number): boolean {
  return amount > 0 && !printsAsZero(amount, decimals);
}

/** The factors that print, largest first: one rounding to nothing is not a line. */
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
  /** Condition healed from it. */
  covered: number;
  /** What the bank buys — nothing the hour a death takes it. */
  spent: number;
}

/**
 * What the bank does over the hour, named by which way it moves: in, out and on
 * what, or neither. A bank held to a lowered cap drops with nothing drawn, and
 * reads as the full bank it is.
 */
function bankNote({ now, next, cap, covered, spent }: BankHour, buying: string): string {
  const change = (next - now) * TICKS_PER_DAY;
  if (shows(change, BANK_DECIMALS)) return 'banking';
  if (!shows(now, BANK_DECIMALS)) return 'empty';
  if (shows(-change, BANK_DECIMALS) && covered + spent > 0) {
    return covered >= spent ? 'healing from reserve' : buying;
  }
  return now >= cap ? 'full' : 'held against a bad day';
}

function bankOf(hour: BankHour, buying: string): Pick<LedgerBank, 'at' | 'note'> {
  return { at: bankShare(hour.now, hour.cap), note: bankNote(hour, buying) };
}

/**
 * The lamp's rating carried down the path to the leaf, and the takers that
 * moved it by a whole percent. The product of the path is the leaf's share of
 * the lamp, so the heading is what the leaf reads while the lamp is on.
 */
function lightPathView(path: LightPath, lamp: Light): LightPathView {
  const passes: [string, string, number][] = [
    ['water', 'Water', path.water],
    ['canopy', 'Canopy', path.canopy],
    ...ALGAE_KINDS.map((kind): [string, string, number] => [kind, ALGAE[kind].name, path.blooms[kind]]),
  ];
  const rating = lamp.enabled ? lamp.par : 0;
  const leaf = passes.reduce((par, [, , pass]) => par * pass, rating);
  return {
    heading: rating > 0 ? `${Math.round(leaf)} of the lamp's ${rating} PAR reach its leaf` : 'No lamp lights it',
    steps: passes
      .map(([key, label, pass]) => ({ key, label, change: (pass - 1) * 100 }))
      .filter((step) => !printsAsZero(step.change, 0)),
  };
}

/** The track runs to twice the need, so the need sits mid-track. */
function lightRow(needShare: number, status: Status, note: string): LedgerRow {
  return {
    text: String(sharePercent(needShare)),
    at: Math.min(1, needShare / LIGHT_SCALE),
    band: { from: 1 / LIGHT_SCALE, to: 1 },
    status,
    note,
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
  const { vitality, spent } = ahead.fish[index];
  const { breakdown } = vitality;

  const helping = factors(breakdown.benefits);
  const hurting = factors(breakdown.stressors);
  const vital = vitalReading(fish.health, vitality.newCondition);
  const gut = fishGut(fish, breakdown, ahead.metabolicFactor, livestock);
  const reading = fishReading(vital.reading, gut);

  return {
    target: { kind: 'fish', id },
    species: fish.species,
    title: fishTitle(fish, fishNumbers(state.fish).get(id)!),
    subtitle,
    status: reading.status,
    word: reading.word,
    value: vital.value,
    valueStatus: conditionStatus(fish.health),
    unit: '% condition',
    at: fish.health / 100,
    band: CONDITION_BAND,
    trend: vital.trend,
    gut,
    light: null,
    lightPath: null,
    coverage: null,
    lightTaken: null,
    helping,
    hurting,
    helps: total(breakdown.benefits),
    hurts: total(breakdown.stressors),
    net: breakdown.net * TICKS_PER_DAY,
    bank: {
      text: fish.surplus.toFixed(BANK_DECIMALS),
      unit: `of ${livestock.surplusCap}`,
      ...bankOf(
        {
          now: fish.surplus,
          next: vitality.surplus - spent,
          cap: livestock.surplusCap,
          covered: breakdown.healed,
          spent,
        },
        'buying a brood'
      ),
    },
    demand: null,
    verb: 'feed',
    scope: null,
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
  const { vitality, spent, buds, light } = ahead.plants[index];
  const { breakdown } = vitality;
  const label = plantLabels(state.plants).get(id)!;
  const cap = config.plants.surplusCap;
  const data = PLANT_SPECIES_DATA[plant.species];
  const helping = factors(breakdown.benefits);
  const hurting = factors(breakdown.stressors);
  const { reading, value, trend } = vitalReading(plant.condition, vitality.newCondition);
  const [lightLow, lightHigh] = data.tolerableLight;

  return {
    target: { kind: 'plant', id },
    species: plant.species,
    title: unitTitle(data.name, label),
    subtitle,
    status: reading.status,
    word: reading.word,
    value,
    valueStatus: conditionStatus(plant.condition),
    unit: '% condition',
    at: plant.condition / 100,
    band: CONDITION_BAND,
    trend,
    gut: null,
    light: lightRow(
      light.needShare,
      plantLightStatus(light, plant.species),
      crownBurns(light, plant.species)
        ? `${Math.round(light.heightCm)} cm tall · crown past ${lightHigh} PAR`
        : `${Math.round(light.heightCm)} cm tall`
    ),
    lightPath: lightPathView(light.path, state.equipment.light),
    coverage: null,
    lightTaken: null,
    helping,
    hurting,
    helps: total(breakdown.benefits),
    hurts: total(breakdown.stressors),
    net: breakdown.net * TICKS_PER_DAY,
    bank: {
      text: String(sharePercent(bankShare(plant.surplus, cap))),
      unit: '% to offshoot',
      ...bankOf(
        { now: plant.surplus, next: vitality.surplus - spent, cap, covered: breakdown.healed, spent },
        buds ? 'buying an offshoot' : 'buying growth'
      ),
    },
    demand:
      `${data.nutrientDemand} demand · light ${lightLow}–${lightHigh} PAR · ${data.co2Requirement} CO₂`,
    verb: 'trimPlants',
    scope: { familyId: plant.familyId },
  };
}

/**
 * Each habitat in the ledger's words — how a bloom lies in its places, where
 * its light is read, and how it takes the plants' light.
 */
const HABITAT: Record<AlgaeHabitat, { lies: string; lit: string; takes: string }> = {
  column: { lies: 'suspended in', lit: 'through the water column', takes: 'the deeper a leaf, the more' },
  surfaces: { lies: 'on', lit: 'on the glass and under the canopy', takes: 'coating every leaf alike' },
};

/** The verb that takes a kind out of the tank, by where it lives. */
export function bloomVerb(kind: AlgaeKind): BloomRemoval {
  return REMOVED_BY[ALGAE[kind].habitat];
}

/**
 * A bloom as the organism it is — condition, what feeds it and what harms it,
 * the bank buying it mass — headed by its kind's word for how much of it there
 * is.
 */
function algaeLedger(state: SimulationState, config: TunableConfig, ahead: HourAhead, kind: AlgaeKind): Ledger {
  const { mass, condition, surplus } = state.algae[kind];
  const next = ahead.algae[kind];
  const { breakdown } = next.vitality;
  const traits = ALGAE[kind];
  const place = HABITAT[traits.habitat];
  const cap = config.plants.surplusCap;
  const taken = plantLightTaken(state, config.optics)[kind] * 100;
  const coverage = algaeReading(kind, mass, taken);
  const { value, trend } = vitalReading(condition, next.condition);

  return {
    target: { kind: 'algae', bloom: kind },
    species: kind,
    title: traits.name,
    subtitle: `${place.lies} ${namePlaces(habitatPlaces(traits.habitat, state))}`,
    ...coverage,
    value,
    valueStatus: conditionStatus(condition),
    unit: '% condition',
    at: condition / 100,
    band: CONDITION_BAND,
    trend,
    gut: null,
    light: lightRow(next.light.needShare, lightStatus(next.light.needShare), place.lit),
    lightPath: null,
    coverage: {
      text: mass.toFixed(COVERAGE_DECIMALS),
      at: mass / 100,
      band: { from: 0, to: BLOOM_COVERAGE_LINE / 100 },
      status: coverage.status,
      note: projectedTrend(next.mass - mass),
    },
    lightTaken:
      state.plants.length > 0
        ? {
            text: String(Math.round(taken)),
            at: taken / 100,
            band: { from: 0, to: PLANT_LIGHT_LINE / 100 },
            status: lightTakenStatus(taken),
            note: place.takes,
          }
        : null,
    helping: factors(breakdown.benefits),
    hurting: factors(breakdown.stressors),
    helps: total(breakdown.benefits),
    hurts: total(breakdown.stressors),
    net: breakdown.net * TICKS_PER_DAY,
    bank: {
      text: surplus.toFixed(BANK_DECIMALS),
      unit: `of ${cap}`,
      ...bankOf({ now: surplus, next: next.surplus, cap, covered: breakdown.healed, spent: next.spent }, 'buying growth'),
    },
    demand: `half-fed at ${traits.ammoniaHalfSaturation} ppm NH₃, ${traits.nitrateHalfSaturation} NO₃, ${traits.phosphateHalfSaturation} PO₄ · light from ${traits.lowLight} PAR`,
    verb: bloomVerb(kind),
    scope: null,
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
      return algaeLedger(state, config, ahead, target.bloom);
  }
}

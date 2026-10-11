/**
 * Why one organism is where it is: the engine's own factor lists, split into
 * what helps and what hurts, the condition they add up to, and beneath them
 * the budget that pays for it — its reserve, and a plant's or a bloom's
 * nutrient stores. Nothing is named here that the tick did not already charge
 * or move — a line the reader sees is a line the tick applied.
 */

import {
  ALGAE,
  ALGAE_KINDS,
  bloomMass,
  bloomParams,
  debParams,
  fillAtDroop,
  fullDroopFactor,
  offshootShare,
  offshootStructure,
  PLANT_SPECIES_DATA,
  plantLightTaken,
  plantParams,
  REMOVED_BY,
  starvation,
  storeFill,
  wellFed,
  type Fish,
  type FishHour,
  type FloraFluxes,
  type FloraParams,
  type FloraState,
  type AlgaeHabitat,
  type AlgaeKind,
  type BloomRemoval,
  type Light,
  type LightPath,
  type SimulationState,
  type VitalityBreakdown,
  type VitalityFactor,
} from '../../simulation/index.js';
import { NUTRIENTS } from '../../simulation/config/index.js';
import { habitatPlaces, namePlaces } from '../../simulation/algae/index.js';
import { BLOOM_COVERAGE_LINE, PLANT_LIGHT_LINE } from '../../simulation/alerts/index.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import type { VerbId, VerbScope } from '../actions/verbs.js';
import { TICKS_PER_DAY } from '../utils/clock.js';
import { COVERAGE_DECIMALS } from '../utils/units.js';
import type { HourAhead } from './ahead.js';
import {
  algaeReading,
  lightTakenStatus,
  NUTRIENT_LABEL,
  plantLabels,
  sharePercent,
  storesFigure,
  unitTitle,
} from './flora.js';
import { crownBurns, lightStatus, plantLightStatus } from './light.js';
import { fishGut, fishNumbers, fishReading, fishTitle, type Gut } from './livestock.js';
import { CONDITION_BAND, type SpeciesId } from './roster.js';
import {
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

/** One line of the budget beneath the condition it pays for. */
export interface BudgetRow {
  key: string;
  label: string;
  text: string;
  unit: string;
  /** Its place on a 0–1 track; null where the line has no track. */
  at: number | null;
  band: ReadingBand | null;
  status: Status;
  /** What it is doing this hour, or what it does to the organism. */
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
  /** The day's light against the day the organism is rated to live on, % of that need. */
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
  /** Its reserve, and what the hour draws on it or builds with it. */
  budget: BudgetRow[];
  /** A plant's or a bloom's nutrient stores, one row each. */
  stores: BudgetRow[];
  /** What the species asks of the tank; plants and blooms. */
  demand: string | null;
  /** The verb that moves this organism — an id the stage opens the sheet on. */
  verb: Extract<VerbId, 'feed' | 'trimPlants' | 'scrubAlgae' | 'waterChange'>;
  /** What the verb is held to: a plant's own family. */
  scope: VerbScope | null;
}

/** The precision a factor, a sum and the net print at, per day. */
export const LEDGER_DECIMALS = 1;

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

const FULL_TRACK: ReadingBand = { from: 0, to: 1 };

function reserveRow(share: number, note: string): BudgetRow {
  return {
    key: 'reserve',
    label: 'Reserve',
    text: String(sharePercent(share)),
    unit: '% full',
    at: share,
    band: FULL_TRACK,
    status: 'neutral',
    note,
  };
}

/** Whether the hour's fluxes leave a flora's reserve where it stood or above. */
function reserveFills({ assimilated, mobilised, burned }: FloraFluxes): boolean {
  return assimilated - mobilised - burned.healing >= 0;
}

const GROWTH_UNHELD = 0.99;

/**
 * The growth limit the hour ran at, against its value on full stores and full
 * room — a Droop limit never reaches 1 — while something holds it back.
 */
function growthRow(fluxes: FloraFluxes, p: FloraParams): BudgetRow[] {
  const growth = fluxes.growthLimit / fullDroopFactor(p);
  if (growth >= GROWTH_UNHELD) return [];
  return [
    {
      key: 'growth',
      label: 'Growth',
      text: String(sharePercent(growth)),
      unit: '% of full pace',
      at: null,
      band: null,
      status: 'neutral',
      note: '',
    },
  ];
}

/**
 * A plant's or a bloom's reserve and the growth it ran at, then what draws on
 * the reserve past the hour's upkeep: the share of upkeep it could not pay,
 * and the repair it buys.
 */
function floraBudget(budget: FloraState, p: FloraParams, fluxes: FloraFluxes, breakdown: VitalityBreakdown, sick: boolean): BudgetRow[] {
  const unpaid = starvation({ fluxes });
  const healing = breakdown.healed * TICKS_PER_DAY;
  return [
    reserveRow(wellFed(budget, p), reserveFills(fluxes) ? 'filling' : 'drawing down'),
    ...growthRow(fluxes, p),
    ...(unpaid > 0
      ? [
          {
            key: 'starving',
            label: 'Starving',
            text: String(Math.ceil(unpaid * 100)),
            unit: '% of upkeep unpaid',
            at: null,
            band: null,
            status: sick ? 'alert' : 'warn',
            note: fluxes.fromStructure > 0 ? 'burning tissue' : '',
          } satisfies BudgetRow,
        ]
      : []),
    ...(shows(healing, LEDGER_DECIMALS)
      ? [
          {
            key: 'healing',
            label: 'Healing',
            text: `+${healing.toFixed(LEDGER_DECIMALS)}`,
            unit: 'per day',
            at: null,
            band: null,
            status: 'neutral',
            note: 'paid from reserve',
          } satisfies BudgetRow,
        ]
      : []),
  ];
}

/** Each store's fill, full at 100, banded from the fill its Droop edge sits at and coral under it. */
function storeRows(budget: FloraState, p: FloraParams, droopEdge: number): BudgetRow[] {
  const fill = storeFill(budget, p);
  const edge = fillAtDroop(p, droopEdge);
  return NUTRIENTS.map((n) => {
    const store = storesFigure(fill[n], edge[n]);
    return {
      key: n,
      label: NUTRIENT_LABEL[n],
      text: String(sharePercent(store.fill)),
      unit: '% full',
      at: store.fill,
      band: { from: store.edge, to: 1 },
      status: store.status,
      note: '',
    };
  });
}

/** Days at the hour's pace, as a reader counts them: whole, and never "in 0". */
function inDays(hours: number): string {
  return hours < TICKS_PER_DAY ? 'within a day' : `in ${Math.round(hours / TICKS_PER_DAY)} d`;
}

const PLANTLET_HORIZON = 365 * TICKS_PER_DAY;

/**
 * What the offshoot buffer does over the hour, read off the budget the tick
 * leaves: cuts a plantlet loose, pays upkeep out of what it holds, builds
 * toward the next at the hour's pace, or waits on stores that let it fill no
 * further, too slowly to name a day, or cannot pay a plantlet's Q_min.
 */
function plantletNote(budget: FloraState, next: FloraState | null, unit: number, buds: boolean, starving: boolean): string {
  if (buds) return 'cuts loose this hour';
  const before = budget.offshootBuffer;
  const after = next?.offshootBuffer ?? before;
  if (before > 0 && (after < before || (after === before && starving))) return 'paying upkeep';
  const hours = after > before && after < unit ? (unit - after) / (after - before) : Infinity;
  return hours <= PLANTLET_HORIZON ? `cuts loose ${inDays(hours)}` : 'waiting on stores';
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
  const { vitality, hour, broods } = ahead.fish[index];
  const { breakdown } = vitality;

  const helping = factors(breakdown.benefits);
  const hurting = factors(breakdown.stressors);
  const vital = vitalReading(fish.health, vitality.newCondition);
  const gut = fishGut(fish, hour, vital.sick, config.livestock);
  const reading = fishReading(vital.reading, gut);
  const reserve = wellFed(fish.deb, debParams(fish.species));

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
    budget: [reserveRow(reserve, reserveNote(fish, hour, breakdown.healed, broods))],
    stores: [],
    demand: null,
    verb: 'feed',
    scope: null,
  };
}

/** What the reserve does over the hour, named by what draws on it or that it fills. */
function reserveNote(fish: Fish, hour: FishHour, healed: number, broods: boolean): string {
  if (starvation(hour) > 0) return 'short of upkeep';
  if (healed > 0) return 'healing from reserve';
  if (broods) return 'spawning';
  return hour.fish.deb.reserve >= fish.deb.reserve ? 'filling' : 'drawing down';
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
  const { vitality, fluxes, buds, light, next } = ahead.plants[index];
  const { breakdown } = vitality;
  const label = plantLabels(state.plants).get(id)!;
  const p = plantParams(plant.species, config.plants);
  const plantlet = offshootShare(plant);
  const data = PLANT_SPECIES_DATA[plant.species];
  const helping = factors(breakdown.benefits);
  const hurting = factors(breakdown.stressors);
  const { reading, value, trend, sick } = vitalReading(plant.condition, vitality.newCondition);
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
    budget: [
      ...floraBudget(plant.budget, p, fluxes, breakdown, sick),
      {
        key: 'plantlet',
        label: 'Plantlet',
        text: String(sharePercent(plantlet)),
        unit: '% built',
        at: plantlet,
        band: FULL_TRACK,
        status: 'neutral',
        note: plantletNote(plant.budget, next, offshootStructure(plant.species), buds, starvation({ fluxes }) > 0),
      },
    ],
    stores: storeRows(plant.budget, p, config.plants.droopEdge),
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

/** What the planting's exudates left of a bloom's photosynthesis this hour, while they hold it back. */
function exudatesRow(exudates: number): BudgetRow[] {
  if (exudates >= 1) return [];
  return [
    {
      key: 'exudates',
      label: 'Exudates',
      text: String(sharePercent(exudates)),
      unit: '% of its photosynthesis',
      at: null,
      band: null,
      status: 'neutral',
      note: '',
    },
  ];
}

/**
 * A bloom as the organism it is — condition, what feeds it and what harms it,
 * its reserve and stores growing it, the planting's exudates holding it —
 * headed by its kind's word for how much of it there is.
 */
function algaeLedger(state: SimulationState, config: TunableConfig, ahead: HourAhead, kind: AlgaeKind): Ledger {
  const { condition, budget } = state.algae[kind];
  const mass = bloomMass(state, kind);
  const next = ahead.algae[kind];
  const { breakdown } = next.vitality;
  const traits = ALGAE[kind];
  const p = bloomParams(kind, config.plants);
  const place = HABITAT[traits.habitat];
  const taken = plantLightTaken(state, config.optics)[kind] * 100;
  const coverage = algaeReading(kind, mass, taken);
  const { value, trend, sick } = vitalReading(condition, next.condition);

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
    budget: [...floraBudget(budget, p, next.fluxes, breakdown, sick), ...exudatesRow(next.exudates)],
    stores: storeRows(budget, p, config.plants.droopEdge),
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

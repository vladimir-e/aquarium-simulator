/**
 * What an action will do to the tank, taken from the engine rather than
 * predicted. Every row is one reading read off the state before and the state
 * `applyAction` returns, so a preview and its commit cannot disagree. The whole
 * list is checked each time and only the readings that moved are shown, so a
 * verb can never quietly under-report a consequence it happens not to expect.
 *
 * Each row carries the strip the reading is read on everywhere else — same
 * scale, same band — with the standing value as a ghost marker and the value
 * the commit would leave as the live one.
 */

import type { FishSpeciesData, SimulationState } from '../../simulation/index.js';
import {
  HIGH_ALGAE_THRESHOLD,
  ammoniaAlertLine,
  HIGH_CO2_THRESHOLD,
  HIGH_NITRITE_THRESHOLD,
  HIGH_NITRATE_THRESHOLD,
  LOW_OXYGEN_THRESHOLD,
  WATER_LEVEL_CRITICAL_THRESHOLD,
} from '../../simulation/alerts/index.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import {
  Co2Resource,
  FoodResource,
  IronResource,
  NitrateResource,
  OxygenResource,
  PhosphateResource,
  PotassiumResource,
} from '../../simulation/resources/index.js';
import type { StripBand } from '../components/ui/strip.js';
import { DISPLAY_CEILING, onScale } from '../readings';
import {
  algaeStatus,
  classifyVital,
  NITRATE_LOW_PPM,
  nutrientReadings,
  readingAt,
  stockedBand,
  trackAt,
  toleranceStatus,
  waterReadings,
  type NutrientKey,
  type NutrientReading,
  type Status,
  type WaterKey,
  type WaterReading,
} from '../run';
import {
  formatTemperature,
  getTemperatureUnit,
  toDisplayTemperature,
  type UnitSystem,
} from '../utils/units.js';

export interface PreviewRow {
  key: string;
  label: string;
  before: string;
  /** A range when the engine randomises the outcome, a figure otherwise. */
  after: string;
  unit: string;
  status: Status;
  /** Where the standing value sits on the track, 0–1. */
  from: number;
  /** Where the commit would leave it; the worst end where the engine rolls. */
  to: number;
  band: StripBand | null;
  /** The engine fact that qualifies the new value, when there is one. */
  note: string | null;
}

/**
 * One state, read the way every other surface reads it. The water sheet and the
 * nutrient sheet are taken once per state because a row needs its neighbours'
 * arithmetic — a nutrient's band is what the plants are asking for.
 */
interface Sheet {
  state: SimulationState;
  units: UnitSystem;
  water: Record<WaterKey, WaterReading>;
  nutrients: Record<NutrientKey, NutrientReading>;
}

function sheetOf(state: SimulationState, config: TunableConfig, units: UnitSystem): Sheet {
  const water = {} as Record<WaterKey, WaterReading>;
  for (const reading of waterReadings(state, units)) water[reading.key] = reading;

  const nutrients = {} as Record<NutrientKey, NutrientReading>;
  for (const reading of nutrientReadings(state, config)) nutrients[reading.key] = reading;

  return { state, units, water, nutrients };
}

function temperatureNote(value: number, _before: number, { state, units }: Sheet): string | null {
  const band = stockedBand(state, (data) => data.temperatureRange);
  if (band === null) return null;
  const { heater } = state.equipment;
  if (value < band.min) {
    const edge = `below ${formatTemperature(band.min, units, 0)}`;
    if (!heater.enabled) return `${edge} — no heater`;
    return heater.targetTemperature >= band.min
      ? `${edge} — heater recovers`
      : `${edge} — heater holds ${formatTemperature(heater.targetTemperature, units, 0)}`;
  }
  if (value > band.max) return `above ${formatTemperature(band.max, units, 0)} — no chiller`;
  return null;
}

type SpeciesRange = (data: FishSpeciesData) => [number, number];

function speciesEdgeNote(value: number, { state }: Sheet, range: SpeciesRange): string | null {
  const band = stockedBand(state, range);
  if (band === null) return null;
  if (value < band.min) return `below ${band.min.toFixed(1)} — ${band.minSpecies}`;
  if (value > band.max) return `above ${band.max.toFixed(1)} — ${band.maxSpecies}`;
  return null;
}

/** "still above" once the reading was already over the line the tank stood on before the action. */
function overLine(value: number, before: number, limit: number, limitBefore = limit): string | null {
  if (value <= limit) return null;
  return `${before > limitBefore ? 'still ' : ''}above ${limit.toFixed(2)}`;
}

interface Reading {
  key: string;
  label: string;
  /** Canonical value, in the engine's own units. */
  read: (sheet: Sheet) => number;
  unit: (units: UnitSystem) => string;
  display: (value: number, units: UnitSystem) => number;
  decimals: number;
  status: (value: number, sheet: Sheet) => Status;
  /** Position on the same display scale the reading book puts it on. */
  at: (value: number, sheet: Sheet) => number;
  band: (sheet: Sheet) => StripBand | null;
  note: (value: number, before: number, sheet: Sheet, standing: Sheet) => string | null;
}

const PPM = (): string => 'ppm';
const PERCENT = (): string => '%';
const same = (value: number): number => value;
const quiet = (): Status => 'neutral';
/** No band to be outside of, or nothing to qualify the new value with. */
const none = (): null => null;

/** A reading the water sheet already read, band and all. */
function fromWater(
  key: WaterKey,
  rest: Pick<Reading, 'label' | 'unit' | 'display' | 'decimals' | 'note'> &
    Partial<Pick<Reading, 'key' | 'status' | 'band'>>
): Reading {
  return {
    key,
    read: (sheet): number => sheet.water[key].value,
    status: (_value, sheet): Status => sheet.water[key].status,
    at: (value, sheet): number => trackAt(sheet.water[key].scale, value),
    band: (sheet): StripBand | null => sheet.water[key].band,
    ...rest,
  };
}

/** A tolerance reading: the band is the span every stocked species accepts. */
function tolerated(
  key: Extract<WaterKey, 'temperature' | 'ph' | 'gh'>,
  range: SpeciesRange
): Pick<Reading, 'status' | 'band'> {
  return {
    status: (value, { state }): Status => toleranceStatus(value, stockedBand(state, range)),
    band: ({ state }): StripBand | null => {
      const band = stockedBand(state, range);
      return band && { from: readingAt(key, band.min), to: readingAt(key, band.max) };
    },
  };
}

function nutrient(key: NutrientKey, label: string, decimals: number): Reading {
  const at = (value: number): number => onScale(DISPLAY_CEILING[key], value);
  return {
    key,
    label,
    read: (sheet): number => sheet.nutrients[key].ppm,
    unit: PPM,
    display: same,
    decimals,
    status: (_value, sheet): Status => sheet.nutrients[key].status,
    at,
    band: (sheet): StripBand | null => {
      const { needed } = sheet.nutrients[key];
      return needed > 0 ? { from: at(needed), to: 1 } : null;
    },
    note: none,
  };
}

/**
 * Canonical order: the nitrogen cycle, then the physical readings, then the
 * dissolved gases, then plant food, then the two organic stocks. A verb's rows
 * come out in this order however many of them move.
 */
const READINGS: Reading[] = [
  fromWater('ammonia', {
    label: 'NH₃',
    unit: PPM,
    display: same,
    decimals: 3,
    note: (value, before, { state }, standing) =>
      overLine(
        value,
        before,
        ammoniaAlertLine(state.resources),
        ammoniaAlertLine(standing.state.resources)
      ),
  }),
  fromWater('nitrite', {
    label: 'NO₂',
    unit: PPM,
    display: same,
    decimals: 3,
    note: (value, before) => overLine(value, before, HIGH_NITRITE_THRESHOLD),
  }),
  fromWater('nitrate', {
    label: 'NO₃',
    unit: PPM,
    display: same,
    decimals: NitrateResource.precision,
    note: (value, _before, { state }): string | null => {
      if (value > HIGH_NITRATE_THRESHOLD) return `above ${HIGH_NITRATE_THRESHOLD}`;
      if (value >= NITRATE_LOW_PPM) return null;
      return state.plants.length > 0
        ? `below ${NITRATE_LOW_PPM} — plants short`
        : `below ${NITRATE_LOW_PPM}`;
    },
  }),
  fromWater('temperature', {
    label: 'Temp',
    unit: getTemperatureUnit,
    display: toDisplayTemperature,
    decimals: 1,
    ...tolerated('temperature', (data) => data.temperatureRange),
    note: temperatureNote,
  }),
  fromWater('ph', {
    label: 'pH',
    unit: () => '',
    display: same,
    decimals: 2,
    ...tolerated('ph', (data) => data.phRange),
    note: (value, _before, sheet) => speciesEdgeNote(value, sheet, (data) => data.phRange),
  }),
  fromWater('kh', {
    label: 'KH',
    unit: () => 'dKH',
    display: same,
    decimals: 1,
    note: none,
  }),
  fromWater('gh', {
    label: 'GH',
    unit: () => 'dGH',
    display: same,
    decimals: 1,
    ...tolerated('gh', (data) => data.ghRange),
    note: (value, _before, sheet) => speciesEdgeNote(value, sheet, (data) => data.ghRange),
  }),
  fromWater('water', {
    key: 'level',
    label: 'Level',
    unit: PERCENT,
    display: same,
    decimals: 0,
    note: (value) =>
      value < WATER_LEVEL_CRITICAL_THRESHOLD * 100
        ? `below ${WATER_LEVEL_CRITICAL_THRESHOLD * 100} %`
        : null,
  }),
  {
    key: 'oxygen',
    label: 'O₂',
    read: ({ state }) => state.resources.oxygen,
    unit: () => OxygenResource.unit,
    display: same,
    decimals: OxygenResource.precision,
    status: (value) => classifyVital('oxygen', value),
    at: (value) => onScale(DISPLAY_CEILING.oxygen, value),
    band: () => ({ from: onScale(DISPLAY_CEILING.oxygen, LOW_OXYGEN_THRESHOLD), to: 1 }),
    note: (value) =>
      value < LOW_OXYGEN_THRESHOLD ? `below ${LOW_OXYGEN_THRESHOLD.toFixed(1)}` : null,
  },
  {
    key: 'co2',
    label: 'CO₂',
    read: ({ state }) => state.resources.co2,
    unit: () => Co2Resource.unit,
    display: same,
    decimals: Co2Resource.precision,
    status: (value) => classifyVital('co2', value),
    at: (value) => onScale(DISPLAY_CEILING.co2, value),
    band: () => ({ from: 0, to: onScale(DISPLAY_CEILING.co2, HIGH_CO2_THRESHOLD) }),
    note: (value, before) => overLine(value, before, HIGH_CO2_THRESHOLD),
  },
  nutrient('phosphate', 'PO₄', PhosphateResource.precision),
  nutrient('potassium', 'K', PotassiumResource.precision),
  nutrient('iron', 'Fe', IronResource.precision),
  {
    key: 'food',
    label: 'Food',
    read: ({ state }) => state.resources.food,
    unit: () => 'g',
    display: same,
    decimals: FoodResource.precision,
    status: quiet,
    at: (value) => onScale(DISPLAY_CEILING.food, value),
    band: none,
    note: none,
  },
  {
    key: 'algae',
    label: 'Algae',
    read: ({ state }) => state.algae.mass,
    unit: PERCENT,
    display: same,
    decimals: 0,
    status: (value) => algaeStatus(value),
    at: (value) => onScale(DISPLAY_CEILING.algae, value),
    band: () => ({ from: 0, to: onScale(DISPLAY_CEILING.algae, HIGH_ALGAE_THRESHOLD) }),
    note: none,
  },
  {
    key: 'tallest',
    label: 'Tallest',
    read: ({ state }) => state.plants.reduce((tallest, plant) => Math.max(tallest, plant.size), 0),
    unit: PERCENT,
    display: same,
    decimals: 0,
    status: quiet,
    at: (value) => onScale(DISPLAY_CEILING.plantSize, value),
    band: none,
    note: none,
  },
];

const RANK: Record<Status, number> = { neutral: 0, ok: 1, warn: 2, alert: 3 };

/** Two values that would print identically have not moved as far as a reader is concerned. */
function prints(a: number, b: number, decimals: number): boolean {
  return Math.abs(a - b) < 0.5 / 10 ** decimals;
}

export interface PreviewInput {
  before: SimulationState;
  /** One state per outcome the engine could land in; more than one is a roll. */
  outcomes: SimulationState[];
  config: TunableConfig;
  units: UnitSystem;
}

/**
 * The rows for every reading the outcomes move. More than one outcome renders
 * as a range: the scrub is the one verb the engine randomises, and naming its
 * bounds is truer than picking a figure out of them.
 */
export function previewRows({ before, outcomes, config, units }: PreviewInput): PreviewRow[] {
  const standing = sheetOf(before, config, units);
  const sheets = outcomes.map((state) => sheetOf(state, config, units));
  const rows: PreviewRow[] = [];

  for (const reading of READINGS) {
    const from = reading.read(standing);
    const values = sheets.map(reading.read);
    if (values.every((value) => prints(value, from, reading.decimals))) continue;

    const format = (value: number): string =>
      reading.display(value, units).toFixed(reading.decimals);
    const low = Math.min(...values);
    const high = Math.max(...values);

    let worst = 0;
    sheets.forEach((sheet, i) => {
      if (RANK[reading.status(values[i], sheet)] > RANK[reading.status(values[worst], sheets[worst])]) {
        worst = i;
      }
    });

    rows.push({
      key: reading.key,
      label: reading.label,
      before: format(from),
      after: prints(low, high, reading.decimals) ? format(values[0]) : `${format(low)}–${format(high)}`,
      unit: reading.unit(units),
      status: reading.status(values[worst], sheets[worst]),
      from: reading.at(from, sheets[worst]),
      to: reading.at(values[worst], sheets[worst]),
      band: reading.band(sheets[worst]),
      note: reading.note(values[worst], from, sheets[worst], standing),
    });
  }

  return rows;
}

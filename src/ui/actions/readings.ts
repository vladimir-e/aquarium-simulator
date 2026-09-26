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

import { floorShade, type FishSpeciesData, type SimulationState } from '../../simulation/index.js';
import {
  algaeAlertLine,
  ammoniaAlertLine,
  HIGH_CO2_THRESHOLD,
  waterLevelAlertLine,
} from '../../simulation/alerts/index.js';
import { NITRITE_EDGE, OXYGEN_EDGE } from '../../simulation/livestock/tolerance.js';
import type { Nutrient, TunableConfig } from '../../simulation/config/index.js';
import {
  Co2Resource,
  FoodResource,
  IronResource,
  OxygenResource,
  PhosphateResource,
  PotassiumResource,
} from '../../simulation/resources/index.js';
import type { StripBand } from '../components/ui/strip.js';
import { bedAt, DISPLAY_CEILING, onScale } from '../readings';
import {
  algaeStatus,
  bedReading,
  classifyVital,
  nutrientReadings,
  readingAt,
  stockedBand,
  trackAt,
  toleranceStatus,
  waterReadings,
  TAB_DECIMALS,
  WATER_DECIMALS,
  type BedReading,
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
  config: TunableConfig;
  units: UnitSystem;
  water: Record<WaterKey, WaterReading>;
  nutrients: Record<Nutrient, NutrientReading>;
  bed: BedReading | null;
}

function sheetOf(state: SimulationState, config: TunableConfig, units: UnitSystem): Sheet {
  const nutrients = {} as Record<Nutrient, NutrientReading>;
  for (const reading of nutrientReadings(state, config)) nutrients[reading.key] = reading;

  const water = {} as Record<WaterKey, WaterReading>;
  for (const reading of waterReadings(state, config, units, nutrients.nitrate)) {
    water[reading.key] = reading;
  }

  return { state, config, units, water, nutrients, bed: bedReading(state, config) };
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
function overLine(
  value: number,
  before: number,
  decimals: number,
  limit: number,
  limitBefore = limit
): string | null {
  if (value <= limit) return null;
  return `${before > limitBefore ? 'still ' : ''}above ${limit.toFixed(decimals)}`;
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

/** A reading the water sheet already read, band, precision and all. */
function fromWater(
  key: WaterKey,
  rest: Pick<Reading, 'label' | 'unit' | 'display' | 'note'> &
    Partial<Pick<Reading, 'key' | 'status' | 'band'>>
): Reading {
  return {
    key,
    decimals: WATER_DECIMALS[key],
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

function nutrient(key: Nutrient, label: string, decimals: number): Reading {
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
 * dissolved gases, then plant food and the bed, then the two organic stocks, then the
 * planting's shade and its largest unit. A verb's rows come out in this order
 * however many of them move.
 */
const READINGS: Reading[] = [
  fromWater('ammonia', {
    label: 'NH₃',
    unit: PPM,
    display: same,
    note: (value, before, { state }, standing) =>
      overLine(
        value,
        before,
        WATER_DECIMALS.ammonia,
        ammoniaAlertLine(state.resources),
        ammoniaAlertLine(standing.state.resources)
      ),
  }),
  fromWater('nitrite', {
    label: 'NO₂',
    unit: PPM,
    display: same,
    note: (value, before) => overLine(value, before, WATER_DECIMALS.nitrite, NITRITE_EDGE),
  }),
  fromWater('nitrate', {
    label: 'NO₃',
    unit: PPM,
    display: same,
    note: (value, before, { nutrients }, standing): string | null => {
      const { needed, ceiling } = nutrients.nitrate;
      const over = overLine(
        value,
        before,
        WATER_DECIMALS.nitrate,
        ceiling!,
        standing.nutrients.nitrate.ceiling!
      );
      if (over) return over;
      return value < needed ? `below ${needed.toFixed(WATER_DECIMALS.nitrate)} — plants short` : null;
    },
  }),
  fromWater('temperature', {
    label: 'Temp',
    unit: getTemperatureUnit,
    display: toDisplayTemperature,
    ...tolerated('temperature', (data) => data.temperatureRange),
    note: temperatureNote,
  }),
  fromWater('ph', {
    label: 'pH',
    unit: () => '',
    display: same,
    ...tolerated('ph', (data) => data.phRange),
    note: (value, _before, sheet) => speciesEdgeNote(value, sheet, (data) => data.phRange),
  }),
  fromWater('kh', {
    label: 'KH',
    unit: () => 'dKH',
    display: same,
    note: none,
  }),
  fromWater('gh', {
    label: 'GH',
    unit: () => 'dGH',
    display: same,
    ...tolerated('gh', (data) => data.ghRange),
    note: (value, _before, sheet) => speciesEdgeNote(value, sheet, (data) => data.ghRange),
  }),
  fromWater('water', {
    key: 'level',
    label: 'Level',
    unit: PERCENT,
    display: same,
    note: (value, _before, { config }) => {
      const line = waterLevelAlertLine(config);
      return value < line ? `below ${line} %` : null;
    },
  }),
  {
    key: 'oxygen',
    label: 'O₂',
    read: ({ state }) => state.resources.oxygen,
    unit: () => OxygenResource.unit,
    display: same,
    decimals: WATER_DECIMALS.oxygen,
    status: (value) => classifyVital('oxygen', value),
    at: (value) => onScale(DISPLAY_CEILING.oxygen, value),
    band: () => ({ from: onScale(DISPLAY_CEILING.oxygen, OXYGEN_EDGE), to: 1 }),
    note: (value) =>
      value < OXYGEN_EDGE ? `below ${OXYGEN_EDGE.toFixed(WATER_DECIMALS.oxygen)}` : null,
  },
  {
    key: 'co2',
    label: 'CO₂',
    read: ({ state }) => state.resources.co2,
    unit: () => Co2Resource.unit,
    display: same,
    decimals: WATER_DECIMALS.co2,
    status: (value) => classifyVital('co2', value),
    at: (value) => onScale(DISPLAY_CEILING.co2, value),
    band: () => ({ from: 0, to: onScale(DISPLAY_CEILING.co2, HIGH_CO2_THRESHOLD) }),
    note: (value, before) => overLine(value, before, WATER_DECIMALS.co2, HIGH_CO2_THRESHOLD),
  },
  nutrient('phosphate', 'PO₄', PhosphateResource.precision),
  nutrient('potassium', 'K', PotassiumResource.precision),
  nutrient('iron', 'Fe', IronResource.precision),
  {
    key: 'bed',
    label: 'Bed',
    read: ({ bed }) => bed?.tabs ?? 0,
    unit: () => 'tabs',
    display: same,
    decimals: TAB_DECIMALS,
    status: (_value, { bed }) => bed?.status ?? 'neutral',
    at: (value, { bed }) => (bed ? bedAt(bed, value) : 0),
    band: ({ bed }) => (bed && bed.needed > 0 ? { from: bedAt(bed, bed.needed), to: 1 } : null),
    note: none,
  },
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
    status: (value, { config }) => algaeStatus(value, algaeAlertLine(config)),
    at: (value) => onScale(DISPLAY_CEILING.algae, value),
    band: ({ config }) => ({ from: 0, to: onScale(DISPLAY_CEILING.algae, algaeAlertLine(config)) }),
    note: none,
  },
  {
    key: 'shade',
    label: 'Floor shade',
    read: ({ state, config }) =>
      floorShade(state.plants, state.tank.capacity, config.optics) * 100,
    unit: PERCENT,
    display: same,
    decimals: 1,
    status: quiet,
    at: (value) => value / 100,
    band: none,
    note: none,
  },
  {
    key: 'largest',
    label: 'Largest',
    read: ({ state }) => state.plants.reduce((largest, plant) => Math.max(largest, plant.size), 0),
    unit: PERCENT,
    display: Math.floor,
    decimals: 0,
    status: quiet,
    at: (value) => onScale(DISPLAY_CEILING.plantSize, value),
    band: none,
    note: none,
  },
];

const RANK: Record<Status, number> = { neutral: 0, ok: 1, warn: 2, alert: 3 };

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
    const format = (value: number): string =>
      reading.display(value, units).toFixed(reading.decimals);
    const from = reading.read(standing);
    const values = sheets.map(reading.read);
    if (values.every((value) => format(value) === format(from))) continue;

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
      after: format(low) === format(high) ? format(values[0]) : `${format(low)}–${format(high)}`,
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

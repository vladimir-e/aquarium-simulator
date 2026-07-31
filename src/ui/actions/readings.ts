/**
 * What an action will do to the tank, taken from the engine rather than
 * predicted. Every row is one reading read off the state before and the state
 * `applyAction` returns, so a preview and its commit cannot disagree. The whole
 * list is checked each time and only the readings that moved are shown, so a
 * verb can never quietly under-report a consequence it happens not to expect.
 */

import {
  FISH_SPECIES_DATA,
  type FishSpeciesData,
  type SimulationState,
} from '../../simulation/index.js';
import {
  HIGH_AMMONIA_THRESHOLD,
  HIGH_CO2_THRESHOLD,
  HIGH_NITRITE_THRESHOLD,
  HIGH_NITRATE_THRESHOLD,
  LOW_OXYGEN_THRESHOLD,
  WATER_LEVEL_CRITICAL_THRESHOLD,
} from '../../simulation/alerts/index.js';
import {
  Co2Resource,
  FoodResource,
  getPpm,
  IronResource,
  NitrateResource,
  OxygenResource,
  PhosphateResource,
  PotassiumResource,
} from '../../simulation/resources/index.js';
import { algaeStatus, classifyVital, NITRATE_LOW_PPM, type Status } from '../run';
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
  /** The engine fact that qualifies the new value, when there is one. */
  note: string | null;
}

interface StockedBand {
  min: number;
  max: number;
  minSpecies: string;
  maxSpecies: string;
}

/**
 * The span every stocked species tolerates. Outside it `fish-health` charges a
 * temperature or pH stressor against the species named here, so this is the
 * tank's own band and not a comfort range invented for the panel.
 */
function stockedBand(
  state: SimulationState,
  range: (data: FishSpeciesData) => [number, number]
): StockedBand | null {
  let band: StockedBand | null = null;
  for (const fish of state.fish) {
    const data = FISH_SPECIES_DATA[fish.species];
    const [min, max] = range(data);
    if (band === null) {
      band = { min, max, minSpecies: data.name, maxSpecies: data.name };
      continue;
    }
    if (min > band.min) band = { ...band, min, minSpecies: data.name };
    if (max < band.max) band = { ...band, max, maxSpecies: data.name };
  }
  return band;
}

function bandStatus(value: number, band: StockedBand | null): Status {
  if (band === null) return 'neutral';
  return value < band.min || value > band.max ? 'warn' : 'neutral';
}

function temperatureNote(
  value: number,
  state: SimulationState,
  units: UnitSystem
): string | null {
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

function phNote(value: number, state: SimulationState): string | null {
  const band = stockedBand(state, (data) => data.phRange);
  if (band === null) return null;
  if (value < band.min) return `below ${band.min.toFixed(1)} — ${band.minSpecies}`;
  if (value > band.max) return `above ${band.max.toFixed(1)} — ${band.maxSpecies}`;
  return null;
}

/** "still above" once the reading was already over the line before the action. */
function overLine(value: number, before: number, limit: number): string | null {
  if (value <= limit) return null;
  return `${before > limit ? 'still ' : ''}above ${limit.toFixed(2)}`;
}

interface Reading {
  key: string;
  label: string;
  /** Canonical value, in the engine's own units. */
  read: (state: SimulationState) => number;
  unit: (units: UnitSystem) => string;
  display: (value: number, units: UnitSystem) => number;
  decimals: number;
  status: (value: number, state: SimulationState) => Status;
  note: (
    value: number,
    before: number,
    state: SimulationState,
    units: UnitSystem
  ) => string | null;
}

const PPM = (): string => 'ppm';
const PERCENT = (): string => '%';
const same = (value: number): number => value;
const quiet = (): Status => 'neutral';
const unqualified = (): null => null;

function ppmOf(key: 'ammonia' | 'nitrite' | 'nitrate' | 'phosphate' | 'potassium' | 'iron') {
  return (state: SimulationState): number => getPpm(state.resources[key], state.resources.water);
}

function nutrient(
  key: 'phosphate' | 'potassium' | 'iron',
  label: string,
  decimals: number
): Reading {
  return {
    key,
    label,
    read: ppmOf(key),
    unit: PPM,
    display: same,
    decimals,
    status: quiet,
    note: unqualified,
  };
}

/**
 * Canonical order: the nitrogen cycle, then the physical readings, then the
 * dissolved gases, then plant food, then the two organic stocks. A verb's rows
 * come out in this order however many of them move.
 */
const READINGS: Reading[] = [
  {
    key: 'ammonia',
    label: 'NH₃',
    read: ppmOf('ammonia'),
    unit: PPM,
    display: same,
    decimals: 3,
    status: (value) => classifyVital('ammonia', value).status,
    note: (value, before) => overLine(value, before, HIGH_AMMONIA_THRESHOLD),
  },
  {
    key: 'nitrite',
    label: 'NO₂',
    read: ppmOf('nitrite'),
    unit: PPM,
    display: same,
    decimals: 3,
    status: (value) => classifyVital('nitrite', value).status,
    note: (value, before) => overLine(value, before, HIGH_NITRITE_THRESHOLD),
  },
  {
    key: 'nitrate',
    label: 'NO₃',
    read: ppmOf('nitrate'),
    unit: PPM,
    display: same,
    decimals: NitrateResource.precision,
    status: (value) => classifyVital('nitrate', value).status,
    note: (value, _before, state): string | null => {
      if (value > HIGH_NITRATE_THRESHOLD) return `above ${HIGH_NITRATE_THRESHOLD}`;
      if (value >= NITRATE_LOW_PPM) return null;
      return state.plants.length > 0
        ? `below ${NITRATE_LOW_PPM} — plants short`
        : `below ${NITRATE_LOW_PPM}`;
    },
  },
  {
    key: 'temperature',
    label: 'Temp',
    read: (state) => state.resources.temperature,
    unit: getTemperatureUnit,
    display: toDisplayTemperature,
    decimals: 1,
    status: (value, state) => bandStatus(value, stockedBand(state, (d) => d.temperatureRange)),
    note: (value, _before, state, units) => temperatureNote(value, state, units),
  },
  {
    key: 'ph',
    label: 'pH',
    read: (state) => state.resources.ph,
    unit: () => '',
    display: same,
    decimals: 2,
    status: (value, state) => bandStatus(value, stockedBand(state, (d) => d.phRange)),
    note: (value, _before, state) => phNote(value, state),
  },
  {
    key: 'level',
    label: 'Level',
    read: (state) =>
      state.tank.capacity > 0 ? (state.resources.water / state.tank.capacity) * 100 : 0,
    unit: PERCENT,
    display: same,
    decimals: 0,
    status: (value) => classifyVital('water', value).status,
    note: (value) =>
      value < WATER_LEVEL_CRITICAL_THRESHOLD * 100
        ? `below ${WATER_LEVEL_CRITICAL_THRESHOLD * 100} %`
        : null,
  },
  {
    key: 'oxygen',
    label: 'O₂',
    read: (state) => state.resources.oxygen,
    unit: () => OxygenResource.unit,
    display: same,
    decimals: OxygenResource.precision,
    status: (value) => classifyVital('oxygen', value).status,
    note: (value) =>
      value < LOW_OXYGEN_THRESHOLD ? `below ${LOW_OXYGEN_THRESHOLD.toFixed(1)}` : null,
  },
  {
    key: 'co2',
    label: 'CO₂',
    read: (state) => state.resources.co2,
    unit: () => Co2Resource.unit,
    display: same,
    decimals: Co2Resource.precision,
    status: (value) => classifyVital('co2', value).status,
    note: (value, before) => overLine(value, before, HIGH_CO2_THRESHOLD),
  },
  nutrient('phosphate', 'PO₄', PhosphateResource.precision),
  nutrient('potassium', 'K', PotassiumResource.precision),
  nutrient('iron', 'Fe', IronResource.precision),
  {
    key: 'food',
    label: 'Food',
    read: (state) => state.resources.food,
    unit: () => 'g',
    display: same,
    decimals: FoodResource.precision,
    status: quiet,
    note: unqualified,
  },
  {
    key: 'algae',
    label: 'Algae',
    read: (state) => state.algae.mass,
    unit: PERCENT,
    display: same,
    decimals: 0,
    status: (value) => algaeStatus(value),
    note: unqualified,
  },
  {
    key: 'tallest',
    label: 'Tallest',
    read: (state) => state.plants.reduce((tallest, plant) => Math.max(tallest, plant.size), 0),
    unit: PERCENT,
    display: same,
    decimals: 0,
    status: quiet,
    note: unqualified,
  },
];

const RANK: Record<Status, number> = { neutral: 0, ok: 1, warn: 2, alert: 3 };

/** Two values that would print identically have not moved as far as a reader is concerned. */
function prints(a: number, b: number, decimals: number): boolean {
  return Math.abs(a - b) < 0.5 / 10 ** decimals;
}

/**
 * The rows for every reading the outcomes move. More than one outcome renders
 * as a range: the scrub is the one verb the engine randomises, and naming its
 * bounds is truer than picking a figure out of them.
 */
export function previewRows(
  before: SimulationState,
  outcomes: SimulationState[],
  units: UnitSystem
): PreviewRow[] {
  const rows: PreviewRow[] = [];

  for (const reading of READINGS) {
    const from = reading.read(before);
    const values = outcomes.map(reading.read);
    if (values.every((value) => prints(value, from, reading.decimals))) continue;

    const format = (value: number): string =>
      reading.display(value, units).toFixed(reading.decimals);
    const low = Math.min(...values);
    const high = Math.max(...values);

    let worst = 0;
    outcomes.forEach((state, i) => {
      if (RANK[reading.status(values[i], state)] > RANK[reading.status(values[worst], outcomes[worst])]) {
        worst = i;
      }
    });

    rows.push({
      key: reading.key,
      label: reading.label,
      before: format(from),
      after: prints(low, high, reading.decimals) ? format(values[0]) : `${format(low)}–${format(high)}`,
      unit: reading.unit(units),
      status: reading.status(values[worst], outcomes[worst]),
      note: reading.note(values[worst], from, outcomes[worst], units),
    });
  }

  return rows;
}

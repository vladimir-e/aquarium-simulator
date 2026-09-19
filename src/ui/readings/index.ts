/**
 * Every reading the instrument can show, in one shape: the number, the band the
 * engine judges it against, what that band means in words, and what fills and
 * drains the stock where the run layer knows. Widgets render rows out of this
 * and the drawer inspects one of them by id, so a reading cannot say one thing
 * on the Overview and another in its own inspector.
 */

import type { SimulationState } from '../../simulation/index.js';
import {
  HIGH_ALGAE_THRESHOLD,
  HIGH_AMMONIA_THRESHOLD,
  HIGH_CO2_THRESHOLD,
  HIGH_NITRATE_THRESHOLD,
  HIGH_NITRITE_THRESHOLD,
  LOW_OXYGEN_THRESHOLD,
  WATER_LEVEL_CRITICAL_THRESHOLD,
} from '../../simulation/alerts/index.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import type { StripBand, StripTone } from '../components/ui/RangeStrip';
import {
  algaeStatus,
  algaeWord,
  bacteriaReadout,
  gasReadings,
  gaugeFill,
  nutrientReadings,
  projectNitritePeak,
  stockedBand,
  toleranceStatus,
  waterGauges,
  wasteReadout,
  type BacteriaReadout,
  type CycleProjection,
  type GasReading,
  type NutrientKey,
  type NutrientReading,
  type RunSnapshot,
  type Status,
  type StockedBand,
  type WasteReadout,
  type WaterGauge,
  NITRATE_LOW_PPM,
} from '../run';
import { formatTemperature, type UnitSystem } from '../utils/units.js';

export type ReadingId =
  | 'waste'
  | 'ammonia'
  | 'nitrite'
  | 'nitrate'
  | 'temperature'
  | 'ph'
  | 'level'
  | 'oxygen'
  | 'co2'
  | 'phosphate'
  | 'potassium'
  | 'iron'
  | 'algae';

/** One arm of a stock's balance: what it is, and how fast it moves. */
export interface ReadingFlow {
  label: string;
  rate: string;
}

export interface ReadingView {
  id: ReadingId;
  name: string;
  /** Formatted in the reader's units, at this reading's fixed precision. */
  value: string;
  unit: string;
  /** Position on the display scale, 0–1. */
  at: number;
  band: StripBand | null;
  tone: StripTone;
  /** Direction and rate over the last day; empty while it is steady. */
  trend: string;
  /** The short qualifier a row carries beside the strip. */
  note: string;
  /** What the band means, in the engine's words. */
  sentence: string;
  fills: ReadingFlow[];
  drains: ReadingFlow[];
  /** Where this reading lives in the history buffer, when it is recorded. */
  series: ((snapshot: RunSnapshot) => number) | null;
}

export interface ReadingBook {
  byId: Record<ReadingId, ReadingView>;
  /**
   * The four plant foods banded on demand rather than on an alert line — the
   * one reading the tank judges twice, since NO₃ is both a toxin the engine
   * alerts on and the plants' nitrogen.
   */
  demand: ReadingView[];
  gauges: WaterGauge[];
  gases: GasReading[];
  nutrients: NutrientReading[];
  bacteria: BacteriaReadout;
  waste: WasteReadout;
  projection: CycleProjection | null;
}

export interface TankInput {
  state: SimulationState;
  config: TunableConfig;
  history: RunSnapshot[];
  units: UnitSystem;
}

const SERIES: Partial<Record<ReadingId, (snapshot: RunSnapshot) => number>> = {
  ammonia: (s) => s.ammonia,
  nitrite: (s) => s.nitrite,
  nitrate: (s) => s.nitrate,
  temperature: (s) => s.temperature,
  ph: (s) => s.ph,
  level: (s) => s.waterPct,
  oxygen: (s) => s.oxygen,
  co2: (s) => s.co2,
  algae: (s) => s.algaeMass,
};

const DECIMALS: Record<ReadingId, number> = {
  waste: 3,
  ammonia: 3,
  nitrite: 3,
  nitrate: 1,
  temperature: 1,
  ph: 2,
  level: 0,
  oxygen: 1,
  co2: 1,
  phosphate: 2,
  potassium: 1,
  iron: 2,
  algae: 0,
};

export function toneOf(status: Status): StripTone {
  return status === 'warn' || status === 'alert' ? status : 'ink';
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Position and band on a scale that starts at zero. */
function scale(max: number): (value: number) => number {
  return (value) => (max > 0 ? clamp(value / max) : 0);
}

/**
 * Change per day, measured off the history buffer rather than modelled — over
 * the last 24 samples where there are that many, and extrapolated from what
 * there is where there are not.
 */
function trendOf(history: RunSnapshot[], id: ReadingId): string {
  const read = SERIES[id];
  if (!read) return '';
  const window = history.slice(-24);
  if (window.length < 2) return '';
  const hours = window.length - 1;
  const perDay = ((read(window[hours]) - read(window[0])) / hours) * 24;
  const decimals = DECIMALS[id];
  if (Math.abs(perDay) < 0.5 / 10 ** decimals) return '';
  return `${perDay > 0 ? '↗' : '↘'} ${Math.abs(perDay).toFixed(decimals)}/d`;
}

function toleranceSentence(
  band: StockedBand | null,
  span: string,
  nothingStocked: string
): string {
  if (band === null) return nothingStocked;
  return `${span} — the span every stocked species tolerates`;
}

interface GaugeSource {
  gauge: WaterGauge;
  /** Overrides the gauge's own band, which temp and pH deliberately lack. */
  band?: StripBand | null;
  tone?: StripTone;
  note?: string;
  sentence: string;
  fills?: ReadingFlow[];
  drains?: ReadingFlow[];
}

function fromGauge(id: ReadingId, history: RunSnapshot[], source: GaugeSource): ReadingView {
  const { gauge } = source;
  return {
    id,
    name: gauge.name,
    value: gauge.text,
    unit: gauge.unit,
    at: gauge.fill,
    band: source.band === undefined ? gauge.band : source.band,
    tone: source.tone ?? toneOf(gauge.status),
    trend: trendOf(history, id),
    note: source.note ?? '',
    sentence: source.sentence,
    fills: source.fills ?? [],
    drains: source.drains ?? [],
    series: SERIES[id] ?? null,
  };
}

function ppmPerHour(value: number): string {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(4)} ppm/h`;
}

function gramsPerHour(value: number): string {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(3)} g/h`;
}

/** A nutrient banded on what the plants ask for, rather than on an alert line. */
function nutrientView(
  id: ReadingId,
  reading: NutrientReading,
  history: RunSnapshot[]
): ReadingView {
  const at = scale(Math.max(reading.needed * 2, reading.ppm, 0.001));
  return {
    id,
    name: reading.label,
    value: reading.text,
    unit: 'ppm',
    at: at(reading.ppm),
    band: reading.needed > 0 ? { from: at(reading.needed), to: 1 } : null,
    tone: toneOf(reading.status),
    trend: trendOf(history, id),
    note: reading.needed > 0 ? `need ${reading.neededText}` : 'nothing planted',
    sentence:
      reading.needed > 0
        ? `Plants ask for ${reading.neededText} ppm — below it the engine's own sufficiency drops.`
        : 'Nothing planted, so nothing is asking for it.',
    fills: [],
    drains: [],
    series: SERIES[id] ?? null,
  };
}

/**
 * Read the whole tank once. Everything the Overview and the Water module draw
 * comes out of this call, so the expensive derivations — the vitality passes
 * behind the waste ledger, the nitrite projection — happen once per tick.
 */
export function readTank({ state, config, history, units }: TankInput): ReadingBook {
  const gauges = waterGauges({ state, phConfig: config.ph, history, units });
  const gases = gasReadings(state);
  const nutrients = nutrientReadings(state, config);
  const bacteria = bacteriaReadout(state, config);
  const waste = wasteReadout(state, config);
  const projection = projectNitritePeak(state, config);

  const gauge = (key: WaterGauge['key']): WaterGauge => gauges.find((g) => g.key === key)!;
  const gas = (key: GasReading['key']): GasReading => gases.find((g) => g.key === key)!;
  const nutrient = (key: NutrientKey): NutrientReading =>
    nutrients.find((n) => n.key === key)!;

  const { rates } = bacteria;
  const tempBand = stockedBand(state, (data) => data.temperatureRange);
  const phBand = stockedBand(state, (data) => data.phRange);
  const algae = state.algae.mass;
  const algaeAt = scale(100);
  const wasteAt = scale(Math.max(waste.standing * 1.4, waste.perHour * 24, 0.01));
  const oxygenAt = scale(12);
  const co2At = scale(HIGH_CO2_THRESHOLD * 1.5);

  const byId: Record<ReadingId, ReadingView> = {
    waste: {
      id: 'waste',
      name: 'Waste',
      value: waste.standing.toFixed(DECIMALS.waste),
      unit: 'g',
      at: wasteAt(waste.standing),
      band: null,
      tone: 'ink',
      trend: '',
      note: '',
      sentence:
        'A pool with no safe line: it settles where what mineralises out matches what falls in.',
      fills: waste.sources
        .filter((source) => source.gramsPerHour > 0)
        .map((source) => ({ label: source.label, rate: gramsPerHour(source.gramsPerHour) })),
      drains: [{ label: 'Mineralising to NH₃', rate: gramsPerHour(-waste.mineralised) }],
      series: null,
    },
    ammonia: fromGauge('ammonia', history, {
      gauge: gauge('ammonia'),
      note: `safe ≤ ${HIGH_AMMONIA_THRESHOLD.toFixed(2)}`,
      sentence: `Safe at or under ${HIGH_AMMONIA_THRESHOLD.toFixed(2)} ppm — the line the engine alerts on.`,
      fills: [
        { label: 'Waste mineralising', rate: ppmPerHour(rates.wasteToAmmonia) },
        { label: 'Fish gills', rate: ppmPerHour(rates.gillsToAmmonia) },
      ],
      drains: [{ label: 'AOB oxidising', rate: ppmPerHour(-rates.ammoniaOxidised) }],
    }),
    nitrite: fromGauge('nitrite', history, {
      gauge: gauge('nitrite'),
      note: `safe ≤ ${HIGH_NITRITE_THRESHOLD.toFixed(2)}`,
      sentence: `Safe at or under ${HIGH_NITRITE_THRESHOLD.toFixed(2)} ppm — the line the engine alerts on.`,
      fills: [{ label: 'AOB oxidising NH₃', rate: ppmPerHour(rates.ammoniaToNitrite) }],
      drains: [{ label: 'NOB clearing', rate: ppmPerHour(-rates.nitriteToNitrate) }],
    }),
    nitrate: fromGauge('nitrate', history, {
      gauge: gauge('nitrate'),
      note: `${NITRATE_LOW_PPM}–${HIGH_NITRATE_THRESHOLD}`,
      sentence: `Plants go short under ${NITRATE_LOW_PPM} ppm; the engine alerts over ${HIGH_NITRATE_THRESHOLD}.`,
      fills: [{ label: 'NOB clearing NO₂', rate: ppmPerHour(rates.nitriteToNitrate) }],
      drains: [],
    }),
    temperature: fromGauge('temperature', history, {
      gauge: gauge('temperature'),
      band: tempBand
        ? { from: gaugeFill('temperature', tempBand.min), to: gaugeFill('temperature', tempBand.max) }
        : null,
      tone: toneOf(toleranceStatus(gauge('temperature').value, tempBand)),
      note: gauge('temperature').caption,
      sentence: toleranceSentence(
        tempBand,
        tempBand
          ? `${formatTemperature(tempBand.min, units, 0)}–${formatTemperature(tempBand.max, units, 0)}`
          : '',
        'Nothing stocked, so nothing in the tank has a temperature to prefer.'
      ),
    }),
    ph: fromGauge('ph', history, {
      gauge: gauge('ph'),
      band: phBand
        ? { from: gaugeFill('ph', phBand.min), to: gaugeFill('ph', phBand.max) }
        : null,
      tone: toneOf(toleranceStatus(gauge('ph').value, phBand)),
      note: gauge('ph').caption,
      sentence: toleranceSentence(
        phBand,
        phBand ? `pH ${phBand.min.toFixed(1)}–${phBand.max.toFixed(1)}` : '',
        'Nothing stocked, so nothing in the tank has a pH to prefer.'
      ),
    }),
    level: fromGauge('level', history, {
      gauge: gauge('water'),
      note: gauge('water').caption,
      sentence: `Under ${WATER_LEVEL_CRITICAL_THRESHOLD * 100} % of capacity the engine calls the level critical.`,
    }),
    oxygen: {
      id: 'oxygen',
      name: gas('oxygen').name,
      value: gas('oxygen').text,
      unit: gas('oxygen').unit,
      at: oxygenAt(gas('oxygen').value),
      band: { from: oxygenAt(LOW_OXYGEN_THRESHOLD), to: 1 },
      tone: toneOf(gas('oxygen').status),
      trend: trendOf(history, 'oxygen'),
      note: `alerts under ${LOW_OXYGEN_THRESHOLD.toFixed(1)}`,
      sentence: `Under ${LOW_OXYGEN_THRESHOLD.toFixed(1)} mg/L the engine alerts and fish start paying for it.`,
      fills: [],
      drains: [],
      series: SERIES.oxygen ?? null,
    },
    co2: {
      id: 'co2',
      name: gas('co2').name,
      value: gas('co2').text,
      unit: gas('co2').unit,
      at: co2At(gas('co2').value),
      band: { from: 0, to: co2At(HIGH_CO2_THRESHOLD) },
      tone: toneOf(gas('co2').status),
      trend: trendOf(history, 'co2'),
      note: `alerts over ${HIGH_CO2_THRESHOLD.toFixed(0)}`,
      sentence: `Over ${HIGH_CO2_THRESHOLD.toFixed(0)} mg/L the engine alerts — plants take it up, surface exchange drives it off.`,
      fills: [],
      drains: [],
      series: SERIES.co2 ?? null,
    },
    phosphate: nutrientView('phosphate', nutrient('phosphate'), history),
    potassium: nutrientView('potassium', nutrient('potassium'), history),
    iron: nutrientView('iron', nutrient('iron'), history),
    algae: {
      id: 'algae',
      name: 'Algae',
      value: algae.toFixed(DECIMALS.algae),
      unit: '%',
      at: algaeAt(algae),
      band: { from: 0, to: algaeAt(HIGH_ALGAE_THRESHOLD) },
      tone: toneOf(algaeStatus(algae)),
      trend: trendOf(history, 'algae'),
      note: algaeWord(algae),
      sentence: `Coverage the plants are competing with; over ${HIGH_ALGAE_THRESHOLD} % the engine calls it a bloom.`,
      fills: [],
      drains: [],
      series: SERIES.algae ?? null,
    },
  };

  const demand = nutrients.map((reading) => nutrientView(reading.key, reading, history));

  return { byId, demand, gauges, gases, nutrients, bacteria, waste, projection };
}

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
  equipmentRows,
  scheduleBand,
  type EquipmentRow,
  type ScheduleBand,
} from '../build';
import {
  algaeRow,
  algaeStatus,
  bacteriaReadout,
  doseDeltas,
  doseToCover,
  formatDose,
  gasReadings,
  readingAt,
  groupBySpecies,
  groupPlantsBySpecies,
  nutrientReadings,
  plantRows,
  projectNitritePeak,
  stockedBand,
  toleranceStatus,
  waterReadings,
  wasteReadout,
  type AlgaeRow,
  type BacteriaReadout,
  type CycleProjection,
  type DoseAdvice,
  type GasReading,
  type NutrientKey,
  type PlantSpeciesGroup,
  type SpeciesGroup,
  type NutrientReading,
  type RunSnapshot,
  type Status,
  type StockedBand,
  type WasteReadout,
  type WaterReading,
  NITRATE_LOW_PPM,
} from '../run';
import {
  formatTemperatureRange,
  toDisplayTemperature,
  type UnitSystem,
} from '../utils/units.js';

export type ReadingId =
  | 'waste'
  | 'ammonia'
  | 'nitrite'
  | 'nitrate'
  | 'nitrateDemand'
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
  /** What the band means, in the engine's words. */
  sentence: string;
  /** Fills minus drains, where the run layer can close the balance. */
  net: string | null;
  fills: ReadingFlow[];
  drains: ReadingFlow[];
  /** The reading's line in the history buffer, in display units, where it has one. */
  series: ((snapshot: RunSnapshot) => number) | null;
}

/** The four plant foods, read as demand rather than against an alert line. */
type DemandId = Extract<ReadingId, 'nitrateDemand' | 'phosphate' | 'potassium' | 'iron'>;

const DEMAND_ID: Record<NutrientKey, DemandId> = {
  nitrate: 'nitrateDemand',
  phosphate: 'phosphate',
  potassium: 'potassium',
  iron: 'iron',
};

/** A plant food, with what the plants are asking for beside it. */
export interface NutrientView extends ReadingView {
  need: string;
}

export type ReadingsById = {
  [K in ReadingId]: K extends DemandId ? NutrientView : ReadingView;
};

/** Who lives here, folded the way every roster reads them. */
export interface Roster {
  fish: SpeciesGroup[];
  plants: PlantSpeciesGroup[];
  algae: AlgaeRow;
}

/** The rack, and the clock the scheduled devices keep. */
export interface Rack {
  devices: EquipmentRow[];
  schedules: ScheduleBand;
}

/** The millilitre that moves the plant foods, and how many of them it takes. */
export interface Dosing {
  advice: DoseAdvice | null;
  /** What a single millilitre adds, one line. */
  perMl: string;
}

export interface ReadingBook {
  /** What the tank is running on, for the line beside a title. */
  caption: string;
  byId: ReadingsById;
  /**
   * The four plant foods banded on demand rather than on an alert line — the
   * one reading the tank judges twice, since NO₃ is both a toxin the engine
   * alerts on and the plants' nitrogen.
   */
  demand: NutrientView[];
  nutrients: NutrientReading[];
  bacteria: BacteriaReadout;
  waste: WasteReadout;
  projection: CycleProjection | null;
  roster: Roster;
  rack: Rack;
  dose: Dosing;
}

export interface TankInput {
  state: SimulationState;
  config: TunableConfig;
  history: RunSnapshot[];
  units: UnitSystem;
}

type Series = (snapshot: RunSnapshot) => number;

/**
 * The buffer and the readings taken off it, in the units the reader is on — so
 * the trend, the chart and the number it sits under can never be in different
 * scales.
 */
interface Tape {
  history: RunSnapshot[];
  series: Partial<Record<ReadingId, Series>>;
}

function tapeOf(history: RunSnapshot[], units: UnitSystem): Tape {
  return {
    history,
    series: {
      ammonia: (s) => s.ammonia,
      nitrite: (s) => s.nitrite,
      nitrate: (s) => s.nitrate,
      nitrateDemand: (s) => s.nitrate,
      temperature: (s) => toDisplayTemperature(s.temperature, units),
      ph: (s) => s.ph,
      level: (s) => s.waterPct,
      oxygen: (s) => s.oxygen,
      co2: (s) => s.co2,
      algae: (s) => s.algaeMass,
    },
  };
}

const DECIMALS: Record<ReadingId, number> = {
  waste: 3,
  ammonia: 3,
  nitrite: 3,
  nitrate: 1,
  nitrateDemand: 1,
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

/**
 * Display scales for the readings the engine draws no line on. Fixed, because a
 * scale taken off the value it is showing pins the marker wherever the value
 * goes, and the strip then reads the same on an empty tank and a filthy one.
 */
const WASTE_SCALE_G = 2;

const NUTRIENT_SCALE_PPM: Record<NutrientKey, number> = {
  nitrate: 100,
  phosphate: 4,
  potassium: 30,
  iron: 1,
};

/** A figure in a band's sentence, at the precision its reading is read to. */
function said(id: ReadingId, value: number): string {
  return value.toFixed(DECIMALS[id]);
}

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

function belowPrecision(value: number, decimals: number): boolean {
  return Math.abs(value) < 0.5 / 10 ** decimals;
}

/**
 * Change per day, measured off the history buffer rather than modelled — over
 * the last 24 samples where there are that many, and extrapolated from what
 * there is where there are not.
 */
function trendOf(tape: Tape, id: ReadingId): string {
  const read = tape.series[id];
  if (!read) return '';
  const window = tape.history.slice(-24);
  if (window.length < 2) return '';
  const hours = window.length - 1;
  const perDay = ((read(window[hours]) - read(window[0])) / hours) * 24;
  const decimals = DECIMALS[id];
  if (belowPrecision(perDay, decimals)) return '';
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

interface WaterSource {
  reading: WaterReading;
  /** Overrides the reading's own band, which temp and pH deliberately lack. */
  band?: StripBand | null;
  tone?: StripTone;
  sentence: string;
  net?: string;
  fills?: ReadingFlow[];
  drains?: ReadingFlow[];
}

function fromWater(id: ReadingId, tape: Tape, source: WaterSource): ReadingView {
  const { reading } = source;
  return {
    id,
    name: reading.name,
    value: reading.text,
    unit: reading.unit,
    at: reading.fill,
    band: source.band === undefined ? reading.band : source.band,
    tone: source.tone ?? toneOf(reading.status),
    trend: trendOf(tape, id),
    sentence: source.sentence,
    net: source.net ?? null,
    fills: source.fills ?? [],
    drains: source.drains ?? [],
    series: tape.series[id] ?? null,
  };
}

export type RateUnit = 'ppm' | 'g';

const RATE_DECIMALS: Record<RateUnit, number> = { ppm: 4, g: 3 };

function signedRate(value: number, unit: RateUnit): string {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(RATE_DECIMALS[unit])} ${unit}/h`;
}

/** One arm of a balance, or `none` where it is moving less than it can print. */
export function ratePerHour(value: number, unit: RateUnit): string {
  return belowPrecision(value, RATE_DECIMALS[unit]) ? 'none' : signedRate(value, unit);
}

/** A stock's fills minus its drains, or `steady` where the two cancel. */
export function netPerHour(value: number, unit: RateUnit): string {
  return belowPrecision(value, RATE_DECIMALS[unit]) ? 'steady' : signedRate(value, unit);
}

/** A nutrient banded on what the plants ask for, rather than on an alert line. */
function nutrientView(
  id: DemandId,
  reading: NutrientReading,
  tape: Tape,
  fills: ReadingFlow[] = []
): NutrientView {
  const at = scale(NUTRIENT_SCALE_PPM[reading.key]);
  return {
    id,
    name: reading.label,
    value: reading.text,
    unit: 'ppm',
    at: at(reading.ppm),
    band: reading.needed > 0 ? { from: at(reading.needed), to: 1 } : null,
    tone: toneOf(reading.status),
    trend: trendOf(tape, id),
    need: reading.needed > 0 ? `need ${reading.neededText}` : '',
    sentence:
      reading.needed > 0
        ? `Plants ask for ${reading.neededText} ppm — below it the engine's own sufficiency drops.`
        : 'Nothing planted, so nothing is asking for it.',
    net: null,
    fills,
    drains: [],
    series: tape.series[id] ?? null,
  };
}

/**
 * Read the whole tank once. Everything the Overview and the Water module draw
 * comes out of this call, so the expensive derivations — the vitality passes
 * behind the waste ledger, the nitrite projection — happen once per tick.
 */
export function readTank({ state, config, history, units }: TankInput): ReadingBook {
  const tape = tapeOf(history, units);
  const water = waterReadings(state, units);
  const gases = gasReadings(state);
  const nutrients = nutrientReadings(state, config);
  const bacteria = bacteriaReadout(state, config);
  const waste = wasteReadout(state, config);
  const projection = projectNitritePeak(state, config);
  const specimens = plantRows(state, config);

  const read = (key: WaterReading['key']): WaterReading => water.find((r) => r.key === key)!;
  const gas = (key: GasReading['key']): GasReading => gases.find((g) => g.key === key)!;
  const nutrient = (key: NutrientKey): NutrientReading =>
    nutrients.find((n) => n.key === key)!;

  const { rates } = bacteria;
  const tempBand = stockedBand(state, (data) => data.temperatureRange);
  const phBand = stockedBand(state, (data) => data.phRange);
  const algae = state.algae.mass;
  const algaeAt = scale(100);
  const wasteAt = scale(WASTE_SCALE_G);
  const oxygenAt = scale(12);
  const co2At = scale(HIGH_CO2_THRESHOLD * 1.5);

  const nitrateFills: ReadingFlow[] = [
    { label: 'NOB clearing NO₂', rate: ratePerHour(rates.nitriteToNitrate, 'ppm') },
  ];

  const byId: ReadingsById = {
    waste: {
      id: 'waste',
      name: 'Waste',
      value: waste.standing.toFixed(DECIMALS.waste),
      unit: 'g',
      at: wasteAt(waste.standing),
      band: null,
      tone: 'ink',
      trend: '',
      sentence:
        'A pool with no safe line: it settles where what mineralises out matches what falls in.',
      net: netPerHour(waste.perHour - waste.mineralised, 'g'),
      fills: waste.sources
        .filter((source) => source.gramsPerHour > 0)
        .map((source) => ({ label: source.label, rate: ratePerHour(source.gramsPerHour, 'g') })),
      drains: [{ label: 'Mineralising to NH₃', rate: ratePerHour(-waste.mineralised, 'g') }],
      series: null,
    },
    ammonia: fromWater('ammonia', tape, {
      reading: read('ammonia'),
      sentence: `Safe at or under ${said('ammonia', HIGH_AMMONIA_THRESHOLD)} ppm — the line the engine alerts on.`,
      net: netPerHour(
        rates.wasteToAmmonia + rates.gillsToAmmonia - rates.ammoniaOxidised,
        'ppm'
      ),
      fills: [
        { label: 'Waste mineralising', rate: ratePerHour(rates.wasteToAmmonia, 'ppm') },
        { label: 'Fish gills', rate: ratePerHour(rates.gillsToAmmonia, 'ppm') },
      ],
      drains: [{ label: 'AOB oxidising', rate: ratePerHour(-rates.ammoniaOxidised, 'ppm') }],
    }),
    nitrite: fromWater('nitrite', tape, {
      reading: read('nitrite'),
      sentence: `Safe at or under ${said('nitrite', HIGH_NITRITE_THRESHOLD)} ppm — the line the engine alerts on.`,
      net: netPerHour(rates.netNitrite, 'ppm'),
      fills: [{ label: 'AOB oxidising NH₃', rate: ratePerHour(rates.ammoniaToNitrite, 'ppm') }],
      drains: [{ label: 'NOB clearing', rate: ratePerHour(-rates.nitriteToNitrate, 'ppm') }],
    }),
    nitrate: fromWater('nitrate', tape, {
      reading: read('nitrate'),
      sentence: `Plants go short under ${said('nitrate', NITRATE_LOW_PPM)} ppm; the engine alerts over ${said('nitrate', HIGH_NITRATE_THRESHOLD)}.`,
      fills: nitrateFills,
      drains: [],
    }),
    temperature: fromWater('temperature', tape, {
      reading: read('temperature'),
      band: tempBand
        ? { from: readingAt('temperature', tempBand.min), to: readingAt('temperature', tempBand.max) }
        : null,
      tone: toneOf(toleranceStatus(read('temperature').value, tempBand)),
      sentence: toleranceSentence(
        tempBand,
        tempBand
          ? formatTemperatureRange([tempBand.min, tempBand.max], units, DECIMALS.temperature)
          : '',
        'Nothing stocked, so nothing in the tank has a temperature to prefer.'
      ),
    }),
    ph: fromWater('ph', tape, {
      reading: read('ph'),
      band: phBand
        ? { from: readingAt('ph', phBand.min), to: readingAt('ph', phBand.max) }
        : null,
      tone: toneOf(toleranceStatus(read('ph').value, phBand)),
      sentence: toleranceSentence(
        phBand,
        phBand ? `pH ${said('ph', phBand.min)}–${said('ph', phBand.max)}` : '',
        'Nothing stocked, so nothing in the tank has a pH to prefer.'
      ),
    }),
    level: fromWater('level', tape, {
      reading: read('water'),
      sentence: `Under ${said('level', WATER_LEVEL_CRITICAL_THRESHOLD * 100)} % of capacity the engine calls the level critical.`,
    }),
    oxygen: {
      id: 'oxygen',
      name: gas('oxygen').name,
      value: gas('oxygen').text,
      unit: gas('oxygen').unit,
      at: oxygenAt(gas('oxygen').value),
      band: { from: oxygenAt(LOW_OXYGEN_THRESHOLD), to: 1 },
      tone: toneOf(gas('oxygen').status),
      trend: trendOf(tape, 'oxygen'),
      sentence: `Under ${said('oxygen', LOW_OXYGEN_THRESHOLD)} mg/L the engine alerts and fish start paying for it.`,
      net: null,
      fills: [],
      drains: [],
      series: tape.series.oxygen ?? null,
    },
    co2: {
      id: 'co2',
      name: gas('co2').name,
      value: gas('co2').text,
      unit: gas('co2').unit,
      at: co2At(gas('co2').value),
      band: { from: 0, to: co2At(HIGH_CO2_THRESHOLD) },
      tone: toneOf(gas('co2').status),
      trend: trendOf(tape, 'co2'),
      sentence: `Over ${said('co2', HIGH_CO2_THRESHOLD)} mg/L the engine alerts — plants take it up, surface exchange drives it off.`,
      net: null,
      fills: [],
      drains: [],
      series: tape.series.co2 ?? null,
    },
    nitrateDemand: nutrientView('nitrateDemand', nutrient('nitrate'), tape, nitrateFills),
    phosphate: nutrientView('phosphate', nutrient('phosphate'), tape),
    potassium: nutrientView('potassium', nutrient('potassium'), tape),
    iron: nutrientView('iron', nutrient('iron'), tape),
    algae: {
      id: 'algae',
      name: 'Algae',
      value: algae.toFixed(DECIMALS.algae),
      unit: '%',
      at: algaeAt(algae),
      band: { from: 0, to: algaeAt(HIGH_ALGAE_THRESHOLD) },
      tone: toneOf(algaeStatus(algae)),
      trend: trendOf(tape, 'algae'),
      sentence: `Coverage the plants are competing with; over ${said('algae', HIGH_ALGAE_THRESHOLD)} % the engine calls it a bloom.`,
      net: null,
      fills: [],
      drains: [],
      series: tape.series.algae ?? null,
    },
  };

  const demand = nutrients.map((reading) => byId[DEMAND_ID[reading.key]]);

  return {
    caption: [
      state.equipment.heater.enabled ? 'heater on' : 'no heater',
      state.equipment.ato.enabled ? 'ATO on' : 'ATO off',
    ].join(' · '),
    byId,
    demand,
    nutrients,
    bacteria,
    waste,
    projection,
    roster: {
      fish: groupBySpecies(state, config.livestock),
      plants: groupPlantsBySpecies(specimens),
      algae: algaeRow(state, config),
    },
    rack: {
      devices: equipmentRows(state, bacteria, units),
      schedules: scheduleBand(state),
    },
    dose: {
      advice: doseToCover(nutrients, state, config),
      perMl: formatDose(
        doseDeltas(1, state.resources.water, config.nutrients.fertilizerFormula)
      ),
    },
  };
}

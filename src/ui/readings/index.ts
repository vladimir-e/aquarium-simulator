/**
 * Every reading the instrument can show, in one shape: the number, the band the
 * engine judges it against, what that band means in words, and what fills and
 * drains the stock where the run layer knows. Widgets render rows out of this
 * and the drawer inspects one of them by id, so a reading cannot say one thing
 * on the Overview and another in its own inspector.
 */

import { ALGAE, type SimulationState } from '../../simulation/index.js';
import {
  algaeAlertLine,
  ammoniaAlertLine,
  HIGH_CO2_THRESHOLD,
  waterLevelAlertLine,
} from '../../simulation/alerts/index.js';
import {
  FREE_AMMONIA_EDGE,
  NITRATE_EDGE,
  NITRITE_EDGE,
  OXYGEN_EDGE,
} from '../../simulation/livestock/tolerance.js';
import type { Nutrient, TunableConfig } from '../../simulation/config/index.js';
import type { StripBand, StripTone } from '../components/ui/strip.js';
import {
  equipmentRows,
  rackSchedules,
  type EquipmentRow,
  type RackSchedules,
} from '../build';
import {
  algaeReading,
  algaeStatus,
  bacteriaReadout,
  bedReading,
  dailyLightReading,
  doseDeltas,
  doseToCover,
  formatDose,
  gasReadings,
  readingAt,
  groupBySpecies,
  groupFry,
  groupPlantsBySpecies,
  nutrientProbe,
  nutrientReadings,
  plantRows,
  projectedDrift,
  projectNitritePeak,
  readFish,
  readHourAhead,
  stockedBand,
  toleranceStatus,
  waterReadings,
  wasteReadout,
  type BacteriaReadout,
  type BedReading,
  type CycleProjection,
  type DoseAdvice,
  type FryBatch,
  type GasReading,
  type HourAhead,
  type PlantSpeciesGroup,
  type SpeciesGroup,
  type NutrientReading,
  type PopulationRosterRow,
  type RunSnapshot,
  type Status,
  type StockedBand,
  type WasteReadout,
  type WaterReading,
  DAILY_LIGHT_DECIMALS,
  DAILY_LIGHT_UNIT,
  TAB_DECIMALS,
  WATER_DECIMALS,
  WATER_SCALE,
  dayTrend,
  printsAsZero,
} from '../run';
import { categorizeLog } from '../review/category.js';
import {
  COVERAGE_DECIMALS,
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
  | 'kh'
  | 'gh'
  | 'level'
  | 'oxygen'
  | 'co2'
  | 'phosphate'
  | 'potassium'
  | 'iron'
  | 'bed'
  | 'algae'
  | 'dailyLight';

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
  /** Direction and rate per day; empty while it holds, null until there is a clean day to measure it over. */
  trend: string | null;
  /** What the band means, in the engine's words. */
  sentence: string;
  /** Fills minus drains, where the run layer can close the balance. */
  net: string | null;
  fills: ReadingFlow[];
  drains: ReadingFlow[];
  /** The reading's line in the history buffer, in display units, where it has one. */
  series: ((snapshot: RunSnapshot) => number) | null;
}

/**
 * The four plant foods, banded on what the plants ask for rather than on an
 * alert line — which is why NO₃ has two readings: the toxin the engine alerts
 * on, and the plants' nitrogen.
 */
type DemandId = Extract<ReadingId, 'nitrateDemand' | 'phosphate' | 'potassium' | 'iron'>;

/** Every reading banded on what the plants ask for: the four foods, the bed and the day's light. */
type NeedId = DemandId | 'bed' | 'dailyLight';

const DEMAND_ID: Record<Nutrient, DemandId> = {
  nitrate: 'nitrateDemand',
  phosphate: 'phosphate',
  potassium: 'potassium',
  iron: 'iron',
};

/** A reading with what the plants are asking for beside it. */
export interface NeedView extends ReadingView {
  need: string;
}

export type ReadingsById = {
  [K in ReadingId]: K extends NeedId ? NeedView : ReadingView;
};

/** Who lives here, folded the way every roster reads them. */
export interface Roster {
  fish: SpeciesGroup[];
  fry: FryBatch | null;
  plants: PlantSpeciesGroup[];
  /** The bloom as the one population row both rosters carry. */
  algae: PopulationRosterRow;
}

/** The rack, and the clock the scheduled devices keep. */
export interface Rack {
  devices: EquipmentRow[];
  schedules: RackSchedules;
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
  /** The hour the next tick runs, which every forward-looking reading shares. */
  ahead: HourAhead;
  byId: ReadingsById;
  demand: NeedView[];
  nutrients: NutrientReading[];
  /** The bed's store for root feeders. */
  bed: BedReading;
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
  /** The tick the keeper last acted on: the buffer before it is another tank's. */
  since: number;
  series: Partial<Record<ReadingId, Series>>;
}

function tapeOf(state: SimulationState, history: RunSnapshot[], units: UnitSystem): Tape {
  const acted = state.logs.filter((log) => categorizeLog(log) === 'user');
  return {
    history,
    since: acted.length > 0 ? acted[acted.length - 1].tick : -Infinity,
    series: {
      ammonia: (s) => s.ammonia,
      nitrite: (s) => s.nitrite,
      nitrate: (s) => s.nitrate,
      nitrateDemand: (s) => s.nitrate,
      temperature: (s) => toDisplayTemperature(s.temperature, units),
      ph: (s) => s.ph,
      kh: (s) => s.kh,
      gh: (s) => s.gh,
      level: (s) => s.waterPct,
      oxygen: (s) => s.oxygen,
      co2: (s) => s.co2,
      algae: (s) => s.algaeMass,
    },
  };
}

/** Fixed precision per reading — the one place a reading's decimals are set. */
export const DECIMALS: Record<ReadingId, number> = {
  waste: 3,
  ammonia: WATER_DECIMALS.ammonia,
  nitrite: WATER_DECIMALS.nitrite,
  nitrate: WATER_DECIMALS.nitrate,
  nitrateDemand: WATER_DECIMALS.nitrate,
  temperature: WATER_DECIMALS.temperature,
  ph: WATER_DECIMALS.ph,
  kh: WATER_DECIMALS.kh,
  gh: WATER_DECIMALS.gh,
  level: WATER_DECIMALS.water,
  oxygen: WATER_DECIMALS.oxygen,
  co2: WATER_DECIMALS.co2,
  phosphate: 2,
  potassium: 1,
  iron: 2,
  bed: TAB_DECIMALS,
  algae: COVERAGE_DECIMALS,
  dailyLight: DAILY_LIGHT_DECIMALS,
};

/**
 * Display scales for the readings the engine draws no line on — shared with the
 * action preview, so a marker cannot sit at one place on a widget row and
 * another on the row that predicts it. Fixed, because a scale taken off the
 * value it is showing pins the marker wherever the value goes, and the strip
 * then reads the same on an empty tank and a filthy one. Ammonia's scale
 * stretches with its line instead.
 */
export const DISPLAY_CEILING = {
  waste: 2,
  food: 2,
  oxygen: 12,
  co2: HIGH_CO2_THRESHOLD * 1.5,
  algae: 100,
  plantSize: 100,
  // The one nitrate track: the lab sheet and the preview read it at one scale.
  nitrate: WATER_SCALE.nitrate[1],
  phosphate: 4,
  potassium: 30,
  iron: 1,
  dailyLight: 4,
} as const;

/** Position of a value on a scale that starts at zero. */
export function onScale(ceiling: number, value: number): number {
  return ceiling > 0 ? clamp(value / ceiling) : 0;
}

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
  return (value) => onScale(max, value);
}

const DAY = 24;

/**
 * Change over the last day, measured off the history buffer rather than
 * modelled, and only over a whole one the keeper has not touched: a part-day
 * is a slice of the tank's daily swing, and an action is a step the tank did
 * not take.
 */
function measuredTrend(tape: Tape, id: ReadingId): string | null {
  const read = tape.series[id];
  if (!read) return '';
  const { history } = tape;
  const last = history[history.length - 1];
  const first = history[history.length - 1 - DAY];
  if (!first || first.tick !== last.tick - DAY || first.tick < tape.since) return null;
  return dayTrend(read(last) - read(first), DECIMALS[id]);
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
    trend: measuredTrend(tape, id),
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
  return printsAsZero(value, RATE_DECIMALS[unit]) ? 'none' : signedRate(value, unit);
}

/** A stock's fills minus its drains, or `steady` where the two cancel. */
export function netPerHour(value: number, unit: RateUnit): string {
  return printsAsZero(value, RATE_DECIMALS[unit]) ? 'steady' : signedRate(value, unit);
}

/**
 * What a nutrient's ceiling is, in words: nitrate's is the engine's alert line
 * unless the least hardy plant's own edge comes first.
 */
function harmClause(id: ReadingId, ceiling: number | null): string {
  if (ceiling === null) return '';
  return ceiling < NITRATE_EDGE
    ? `past ${said(id, ceiling)} the least hardy plant here takes harm, and the engine alerts over ${said(id, NITRATE_EDGE)}`
    : `the engine alerts over ${said(id, ceiling)}`;
}

/** A nutrient banded on what the plants ask for, and nitrate on its alert line too. */
function nutrientView(
  id: DemandId,
  reading: NutrientReading,
  tape: Tape,
  fills: ReadingFlow[] = []
): NeedView {
  const at = scale(DISPLAY_CEILING[reading.key]);
  const harm = harmClause(id, reading.ceiling);
  return {
    id,
    name: reading.label,
    value: reading.text,
    unit: 'ppm',
    at: at(reading.ppm),
    band:
      reading.needed > 0 || reading.ceiling !== null
        ? { from: at(reading.needed), to: reading.ceiling === null ? 1 : at(reading.ceiling) }
        : null,
    tone: toneOf(reading.status),
    trend: measuredTrend(tape, id),
    need: reading.needed > 0 ? `need ${reading.neededText}` : '',
    sentence:
      reading.needed > 0
        ? `Plants ask for ${reading.neededText} ppm — below it the engine's own sufficiency drops${harm && `; ${harm}`}.`
        : `Nothing planted, so nothing is asking for it${harm && `; ${harm}`}.`,
    net: null,
    fills,
    drains: [],
    series: tape.series[id] ?? null,
  };
}

/** The bed read in the tabs a keeper pushes into it, banded on what its root feeders ask for. */
function bedView(bed: BedReading): NeedView {
  const asked = !bed.bare && bed.needed > 0;
  return {
    id: 'bed',
    name: 'Bed',
    value: bed.bare ? '—' : bed.text,
    unit: 'tabs',
    at: onScale(bed.scale, bed.tabs),
    band: asked ? { from: onScale(bed.scale, bed.needed), to: 1 } : null,
    tone: toneOf(bed.status),
    trend: '',
    need: asked ? `need ${bed.neededText}` : '',
    sentence: bed.bare
      ? bed.limiting
        ? 'A bare bottom holds nothing for roots, and takes no tab — its root feeders go short however well the water is dosed.'
        : 'A bare bottom holds nothing for roots, and takes no tab.'
      : asked
        ? `Root tabs' worth of the nutrient the bed runs shortest on. Root feeders ask for ${bed.neededText} tabs — below it the engine's own sufficiency drops.`
        : "Root tabs' worth of the nutrient the bed holds least of. Nothing here feeds through its roots, so it only leaks into the water.",
    net: null,
    fills: [],
    drains: [],
    series: null,
  };
}

/**
 * Read the whole tank once. Everything the console draws comes out of this
 * call, so the expensive derivations — the hour the next tick settles, the
 * nitrite projection — happen once per tick.
 */
export function readTank({ state, config, history, units }: TankInput): ReadingBook {
  const tape = tapeOf(state, history, units);
  const ahead = readHourAhead(state, config);
  const probe = nutrientProbe(state, config);
  const nutrients = nutrientReadings(state, config, probe);
  const bed = bedReading(state, config, probe);
  const nitrate = nutrients.find((n) => n.key === 'nitrate')!;
  const water = waterReadings(state, config, units, nitrate);
  const gases = gasReadings(state);
  const bacteria = bacteriaReadout(state, config, ahead);
  const waste = wasteReadout(state, config, ahead);
  const projection = projectNitritePeak(state, config, ahead);
  const specimens = plantRows(state, config, ahead);
  const fish = readFish(state, config, ahead);
  const light = dailyLightReading(ahead);

  const read = (key: WaterReading['key']): WaterReading => water.find((r) => r.key === key)!;
  const gas = (key: GasReading['key']): GasReading => gases.find((g) => g.key === key)!;
  const nutrient = (key: Nutrient): NutrientReading =>
    nutrients.find((n) => n.key === key)!;

  const { rates } = bacteria;
  const tempBand = stockedBand(state, (data) => data.temperatureRange);
  const phBand = stockedBand(state, (data) => data.phRange);
  const ghBand = stockedBand(state, (data) => data.ghRange);
  const algae = state.algae.mass;
  const algaeLine = algaeAlertLine(config);
  const levelLine = waterLevelAlertLine(config);
  const algaeAt = scale(DISPLAY_CEILING.algae);
  const wasteAt = scale(DISPLAY_CEILING.waste);
  const oxygenAt = scale(DISPLAY_CEILING.oxygen);
  const co2At = scale(DISPLAY_CEILING.co2);
  const lightAt = scale(DISPLAY_CEILING.dailyLight);
  const algaeDrift = projectedDrift(ahead.algae.mass - algae);

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
        'A pool with no safe line: it levels off where what mineralises and settles out matches what falls in.',
      net: netPerHour(waste.perHour - waste.mineralised - waste.settled, 'g'),
      fills: waste.sources
        .filter((source) => source.gramsPerHour > 0)
        .map((source) => ({ label: source.label, rate: ratePerHour(source.gramsPerHour, 'g') })),
      drains: [
        { label: 'Mineralising to NH₃', rate: ratePerHour(-waste.mineralised, 'g') },
        { label: 'Settling into the bed', rate: ratePerHour(-waste.settled, 'g') },
      ],
      series: null,
    },
    ammonia: fromWater('ammonia', tape, {
      reading: read('ammonia'),
      sentence: `Safe at or under ${said('ammonia', ammoniaAlertLine(state.resources))} ppm at this pH and temperature — where free NH₃ reaches the ${FREE_AMMONIA_EDGE} ppm the engine alerts on.`,
      net: netPerHour(rates.netAmmonia, 'ppm'),
      fills: [
        { label: 'Waste mineralising', rate: ratePerHour(rates.wasteToAmmonia, 'ppm') },
        { label: 'Fish gills', rate: ratePerHour(rates.gillsToAmmonia, 'ppm') },
        { label: 'Food decaying', rate: ratePerHour(rates.foodToAmmonia, 'ppm') },
      ],
      drains: [{ label: 'AOB oxidising', rate: ratePerHour(-rates.ammoniaOxidised, 'ppm') }],
    }),
    nitrite: fromWater('nitrite', tape, {
      reading: read('nitrite'),
      sentence: `Safe at or under ${said('nitrite', NITRITE_EDGE)} ppm — the line the engine alerts on.`,
      net: netPerHour(rates.netNitrite, 'ppm'),
      fills: [{ label: 'AOB oxidising NH₃', rate: ratePerHour(rates.ammoniaToNitrite, 'ppm') }],
      drains: [{ label: 'NOB clearing', rate: ratePerHour(-rates.nitriteToNitrate, 'ppm') }],
    }),
    nitrate: fromWater('nitrate', tape, {
      reading: read('nitrate'),
      sentence:
        nitrate.needed > 0
          ? `Plants go short under ${nitrate.neededText} ppm; ${harmClause('nitrate', nitrate.ceiling)}.`
          : `Nothing planted to feed on it; ${harmClause('nitrate', nitrate.ceiling)}.`,
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
    kh: fromWater('kh', tape, {
      reading: read('kh'),
      sentence:
        'The buffer that holds pH against CO₂. Tap water brings it; nitrification, driftwood and aqua soil spend it; calcite adds it.',
    }),
    gh: fromWater('gh', tape, {
      reading: read('gh'),
      band: ghBand
        ? { from: readingAt('gh', ghBand.min), to: readingAt('gh', ghBand.max) }
        : null,
      tone: toneOf(toleranceStatus(read('gh').value, ghBand)),
      sentence: toleranceSentence(
        ghBand,
        ghBand ? `GH ${said('gh', ghBand.min)}–${said('gh', ghBand.max)} dGH` : '',
        'Nothing stocked, so nothing in the tank has a hardness to prefer.'
      ),
    }),
    level: fromWater('level', tape, {
      reading: read('water'),
      sentence: `Under ${said('level', levelLine)} % of capacity the water starts to harm fish, and the engine alerts.`,
    }),
    oxygen: {
      id: 'oxygen',
      name: gas('oxygen').name,
      value: gas('oxygen').text,
      unit: gas('oxygen').unit,
      at: oxygenAt(gas('oxygen').value),
      band: { from: oxygenAt(OXYGEN_EDGE), to: 1 },
      tone: toneOf(gas('oxygen').status),
      trend: measuredTrend(tape, 'oxygen'),
      sentence: `Under ${said('oxygen', OXYGEN_EDGE)} mg/L the engine alerts; a mid-hardiness fish takes harm lower still.`,
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
      trend: measuredTrend(tape, 'co2'),
      sentence: `Over ${said('co2', HIGH_CO2_THRESHOLD)} mg/L — what keepers treat as too much — the engine alerts. Plants take it up, surface exchange drives it off.`,
      net: null,
      fills: [],
      drains: [],
      series: tape.series.co2 ?? null,
    },
    nitrateDemand: nutrientView('nitrateDemand', nutrient('nitrate'), tape, nitrateFills),
    phosphate: nutrientView('phosphate', nutrient('phosphate'), tape),
    potassium: nutrientView('potassium', nutrient('potassium'), tape),
    iron: nutrientView('iron', nutrient('iron'), tape),
    bed: bedView(bed),
    algae: {
      id: 'algae',
      name: 'Algae',
      value: algae.toFixed(DECIMALS.algae),
      unit: '%',
      at: algaeAt(algae),
      band: { from: 0, to: algaeAt(algaeLine) },
      tone: toneOf(algaeStatus(algae, algaeLine)),
      trend: algaeDrift,
      sentence: `Coverage the plants are competing with; over ${said('algae', algaeLine)} % it shades them, and the engine alerts.`,
      net: null,
      fills: [],
      drains: [],
      series: tape.series.algae ?? null,
    },
    dailyLight: {
      id: 'dailyLight',
      name: 'Daily light',
      value: light.text,
      unit: DAILY_LIGHT_UNIT,
      at: lightAt(light.value),
      band: light.needed > 0 ? { from: lightAt(light.needed), to: 1 } : null,
      tone: toneOf(light.status),
      trend: '',
      need: light.need,
      sentence:
        light.needed > 0
          ? `The substrate's PAR over the day the next hour closes. Under ${said('dailyLight', light.needed)} ${DAILY_LIGHT_UNIT} the worst-lit plant here starves, on the light at its own height.`
          : 'Nothing planted, so nothing is asking for it.',
      net: null,
      fills: [],
      drains: [],
      series: null,
    },
  };

  const demand = nutrients.map((reading) => byId[DEMAND_ID[reading.key]]);

  return {
    ahead,
    caption: [
      state.equipment.heater.enabled ? 'heater on' : 'no heater',
      state.equipment.ato.enabled ? 'ATO on' : 'ATO off',
    ].join(' · '),
    byId,
    demand,
    nutrients,
    bed,
    bacteria,
    waste,
    projection,
    roster: {
      fish: groupBySpecies(fish, config.livestock),
      fry: groupFry(fish, config.livestock),
      plants: groupPlantsBySpecies(specimens),
      algae: {
        kind: 'population',
        key: 'algae',
        name: ALGAE.name,
        figure: `${byId.algae.value} %`,
        caption: 'coverage',
        trend: algaeDrift,
        at: byId.algae.at,
        band: byId.algae.band,
        ...algaeReading(algae, algaeLine),
      },
    },
    rack: {
      devices: equipmentRows(state, bacteria, units),
      schedules: rackSchedules(state),
    },
    dose: {
      advice: doseToCover(nutrients, state, config),
      perMl: formatDose(
        doseDeltas(1, state.resources.water, config.nutrients.fertilizerFormula)
      ),
    },
  };
}

/**
 * The live figures every index-rail row carries. Reading the rail is meant to
 * replace visiting a section, so each row derives its numbers from the same
 * engine values and thresholds its section would show — nothing here invents a
 * band. Pure; the rail renders whatever these return.
 */

import {
  PLANT_SPECIES_DATA,
  getMaxPlants,
  type LidType,
  type SimulationState,
} from '../../simulation/index.js';
import { getPpm } from '../../simulation/resources/index.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import { bioload, buildDeviceList } from '../build/index.js';
import {
  allNutrientsDepleted,
  biofilterColonisation,
  CYCLED_PCT,
  classifyVital,
  conditionStatus,
  conditionWord,
  countHungry,
  nutrientReadings,
  scapeSummary,
  type Status,
  type VitalKey,
} from '../run/index.js';
import {
  formatTemperature,
  formatVolume,
  getTemperatureUnit,
  type UnitSystem,
} from '../utils/units.js';
import type { SectionId } from './sections.js';

/** One of the six vertical micro-meters pinned to the Water row. */
export interface MicroMeter {
  key: MeterKey;
  /** Unit caption under the track. */
  label: string;
  /** Canonical value: °C, pH, % of capacity, or ppm. */
  value: number;
  /** Track fill, 0–1. */
  fill: number;
  status: Status;
}

export interface NavPill {
  text: string;
  status: Status;
}

export interface NavFigure {
  pill: NavPill | null;
  lines: string[];
  /** Water only: chemistry pinned to the rail so it never leaves the screen. */
  meters?: MicroMeter[];
  /** Equipment only: one dot per device, in list order. */
  dots?: boolean[];
}

type MeterKey = Extract<
  VitalKey,
  'temperature' | 'ph' | 'water' | 'ammonia' | 'nitrite' | 'nitrate'
>;

/**
 * Micro-meter track ranges. Wide enough that a healthy tank reads mid-track and
 * a failing one is unmistakable — these are display scales, not safe bands
 * (`classifyVital` owns the bands and colours the fill).
 */
const METER_RANGE: Record<MeterKey, [min: number, max: number]> = {
  temperature: [15, 35],
  ph: [5.5, 8.5],
  water: [0, 100],
  ammonia: [0, 0.2],
  nitrite: [0, 0.6],
  nitrate: [0, 60],
};

const METER_LABEL: Record<Exclude<MeterKey, 'temperature'>, string> = {
  ph: 'pH',
  water: 'lvl',
  ammonia: 'NH₃',
  nitrite: 'NO₂',
  nitrate: 'NO₃',
};

const LID_LABEL: Record<LidType, string> = {
  none: 'no lid',
  mesh: 'mesh lid',
  full: 'full lid',
  sealed: 'sealed lid',
};

function fillOf(key: MeterKey, value: number): number {
  const [min, max] = METER_RANGE[key];
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function waterMeters(state: SimulationState, units: UnitSystem): MicroMeter[] {
  const r = state.resources;
  const capacity = state.tank.capacity;
  const readings: Array<[MeterKey, number]> = [
    ['temperature', r.temperature],
    ['ph', r.ph],
    ['water', capacity > 0 ? (r.water / capacity) * 100 : 0],
    ['ammonia', getPpm(r.ammonia, r.water)],
    ['nitrite', getPpm(r.nitrite, r.water)],
    ['nitrate', getPpm(r.nitrate, r.water)],
  ];
  return readings.map(([key, value]) => ({
    key,
    label: key === 'temperature' ? getTemperatureUnit(units) : METER_LABEL[key],
    value,
    fill: fillOf(key, value),
    status: classifyVital(key, value).status,
  }));
}

/** An uncycled tank outranks a soft warning: quiet now, about to stop being quiet. */
function waterPill(
  state: SimulationState,
  config: TunableConfig,
  meters: MicroMeter[]
): NavPill | null {
  const named = (m: MicroMeter): NavPill => ({
    text: `${m.label} ${(classifyVital(m.key, m.value).pill ?? '').toLowerCase()}`.trim(),
    status: m.status,
  });
  const alert = meters.find((m) => m.status === 'alert');
  if (alert) return named(alert);
  if (biofilterColonisation(state.resources, config.nitrogenCycle) < CYCLED_PCT) {
    return { text: 'uncycled', status: 'neutral' };
  }
  const warn = meters.find((m) => m.status === 'warn');
  return warn ? named(warn) : null;
}

function equipmentFigure(state: SimulationState, config: TunableConfig): NavFigure {
  const devices = buildDeviceList(state.equipment);
  const on = devices.filter((d) => d.on).length;
  const colonisation = Math.round(biofilterColonisation(state.resources, config.nitrogenCycle));
  return {
    pill: null,
    lines: [`${on} of ${devices.length} on · biofilter ${colonisation} %`],
    dots: devices.map((d) => d.on),
  };
}

function floraFigure(state: SimulationState): NavFigure {
  const { plants, algae, resources, equipment, tank } = state;
  const algaePct = Math.round(algae.mass);
  const readings = nutrientReadings(resources, resources.water);
  const depleted = readings.find((r) => r.state === 'depleted');
  const worst = plants.reduce<(typeof plants)[number] | null>(
    (lowest, p) => (lowest === null || p.condition < lowest.condition ? p : lowest),
    null
  );

  const pill: NavPill | null = allNutrientsDepleted(readings)
    ? { text: 'no nutrients', status: 'warn' }
    : depleted
      ? { text: `${depleted.label} 0`, status: 'warn' }
      : null;

  const second =
    worst && conditionStatus(worst.condition) !== 'ok'
      ? `${PLANT_SPECIES_DATA[worst.species].name} ${conditionWord(worst.condition)}`
      : scapeSummary(equipment.substrate.type, equipment.hardscape.items);

  const algaeText = algaePct < 1 ? 'no algae' : `algae ${algaePct} %`;

  return {
    pill,
    lines: [`${plants.length} of ${getMaxPlants(tank.capacity)} plants · ${algaeText}`, second],
  };
}

function livestockFigure(state: SimulationState, config: TunableConfig): NavFigure {
  const { fish, clutches, tank } = state;
  const species = new Set(fish.map((f) => f.species)).size;
  const hungry = countHungry(fish, config.livestock);
  const load = bioload(fish, tank.capacity);

  const counts = [`${fish.length} fish`];
  if (species > 0) counts.push(`${species} species`);
  if (clutches.length > 0) {
    counts.push(`${clutches.length} clutch${clutches.length > 1 ? 'es' : ''}`);
  }

  return {
    pill: hungry > 0 ? { text: `${hungry} hungry`, status: 'warn' } : null,
    lines: [counts.join(' · '), `bioload ${load.ratio.toFixed(1)}× vs guideline`],
  };
}

function analyticsFigure(state: SimulationState, run: RunTally): NavFigure {
  if (state.tick === 0) {
    return { pill: null, lines: ['0 ticks', 'no history yet'] };
  }
  const days = Math.floor(state.tick / 24);
  const hours = state.tick % 24;
  return {
    pill: null,
    lines: [
      `${state.tick} ticks · ${days} d ${hours} h`,
      `${run.alerts} alerts · ${run.deaths} deaths · ${run.births} fry`,
    ],
  };
}

function scenarioFigure(state: SimulationState, presetName: string, units: UnitSystem): NavFigure {
  const { tank, environment, equipment } = state;
  return {
    pill: null,
    lines: [
      `${presetName} · ${formatVolume(tank.capacity, units, 0)}`,
      `room ${formatTemperature(environment.roomTemperature, units, 0)} · ${LID_LABEL[equipment.lid.type]}`,
    ],
  };
}

interface RunTally {
  alerts: number;
  deaths: number;
  births: number;
}

export interface NavFigureInput extends RunTally {
  state: SimulationState;
  config: TunableConfig;
  presetName: string;
  units: UnitSystem;
}

export function navFigures(input: NavFigureInput): Record<SectionId, NavFigure> {
  const { state, config, presetName, units } = input;
  const meters = waterMeters(state, units);
  return {
    water: { pill: waterPill(state, config, meters), lines: [], meters },
    equipment: equipmentFigure(state, config),
    flora: floraFigure(state),
    livestock: livestockFigure(state, config),
    analytics: analyticsFigure(state, input),
    scenario: scenarioFigure(state, presetName, units),
  };
}

export function formatMeter(meter: MicroMeter, displayTemp: (celsius: number) => number): string {
  switch (meter.key) {
    case 'temperature':
      return displayTemp(meter.value).toFixed(1);
    case 'ph':
      return meter.value.toFixed(2);
    case 'water':
      return Math.round(meter.value).toString();
    case 'nitrate':
      return meter.value.toFixed(1);
    // Toxins run to three decimals; the leading zero is dropped to fit the track.
    case 'ammonia':
    case 'nitrite':
      return meter.value.toFixed(3).replace(/^0\./, '.');
  }
}

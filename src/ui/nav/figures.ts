/**
 * The live figures every index-rail row carries. Reading the rail is meant to
 * replace visiting a section, so each row derives its numbers from the same
 * engine values and thresholds its section would show — nothing here invents a
 * band. Pure; the rail renders whatever these return.
 */

import type { LogEntry, SimulationState } from '../../simulation/index.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import {
  bioload,
  buildDeviceList,
  equipmentSummary,
  scapeSummary,
  scenarioSummary,
  LID_LABEL,
} from '../build/index.js';
import { summaryLines } from '../review/index.js';
import type { RunAggregates } from '../run/index.js';
import {
  ailingPlants,
  bacteriaReadout,
  bandStatus,
  classifyVital,
  GAUGE_KEYS,
  gasReadings,
  gaugeFill,
  gaugeValues,
  hungerOf,
  nutrientAlert,
  nutrientReadings,
  plantRows,
  plantsAndAlgae,
  rosterSummary,
  waterAlert,
  type BacteriaReadout,
  type GaugeKey,
  type Status,
} from '../run/index.js';
import { formatTemperature, getTemperatureUnit, type UnitSystem } from '../utils/units.js';
import type { SectionId } from './sections.js';

/** One of the six vertical micro-meters pinned to the Water row. */
export interface MicroMeter {
  key: GaugeKey;
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

const METER_LABEL: Record<Exclude<GaugeKey, 'temperature'>, string> = {
  ph: 'pH',
  water: 'lvl',
  ammonia: 'NH₃',
  nitrite: 'NO₂',
  nitrate: 'NO₃',
};

/** Same values, same scales, same classifier as the Water section's gauges. */
function waterMeters(state: SimulationState, units: UnitSystem): MicroMeter[] {
  const values = gaugeValues(state);
  return GAUGE_KEYS.map((key) => ({
    key,
    label: key === 'temperature' ? getTemperatureUnit(units) : METER_LABEL[key],
    value: values[key],
    fill: gaugeFill(key, values[key]),
    status: classifyVital(key, values[key]).status,
  }));
}

function equipmentFigure(state: SimulationState, bacteria: BacteriaReadout): NavFigure {
  return {
    pill: null,
    lines: [equipmentSummary(state, bacteria)],
    dots: buildDeviceList(state.equipment).map((d) => d.on),
  };
}

function floraFigure(state: SimulationState, config: TunableConfig): NavFigure {
  const { substrate, hardscape } = state.equipment;
  const [worst] = ailingPlants(plantRows(state, config));

  return {
    pill: nutrientAlert(nutrientReadings(state, config)),
    lines: [
      plantsAndAlgae(state),
      worst ? `${worst.name} ${worst.word}` : scapeSummary(substrate.type, hardscape.items),
    ],
  };
}

function livestockFigure(state: SimulationState, config: TunableConfig): NavFigure {
  const hunger = hungerOf(state.fish, config.livestock);
  const load = bioload(state.fish, state.tank.capacity);

  return {
    pill: hunger ? { text: `${hunger.count} hungry`, status: bandStatus(hunger.band) } : null,
    lines: [rosterSummary(state), `bioload ${load.ratio.toFixed(1)}× vs guideline`],
  };
}

function scenarioFigure(
  state: SimulationState,
  presetName: string,
  units: UnitSystem,
  modified: boolean
): NavFigure {
  const { environment, equipment } = state;
  return {
    pill: modified ? { text: 'modified', status: 'warn' } : null,
    lines: [
      scenarioSummary(state, presetName, units),
      `room ${formatTemperature(environment.roomTemperature, units, 0)} · ${LID_LABEL[equipment.lid.type]}`,
    ],
  };
}

export interface NavFigureInput {
  state: SimulationState;
  config: TunableConfig;
  aggregates: RunAggregates;
  runLogs: LogEntry[];
  presetName: string;
  presetModified: boolean;
  units: UnitSystem;
}

export function navFigures(input: NavFigureInput): Record<SectionId, NavFigure> {
  const { state, config, aggregates, runLogs, presetName, presetModified, units } = input;
  const meters = waterMeters(state, units);
  const bacteria = bacteriaReadout(state, config);
  return {
    water: {
      pill: waterAlert([...meters, ...gasReadings(state)], bacteria.cycled),
      lines: [],
      meters,
    },
    equipment: equipmentFigure(state, bacteria),
    flora: floraFigure(state, config),
    livestock: livestockFigure(state, config),
    analytics: { pill: null, lines: summaryLines(aggregates, runLogs, units) },
    scenario: scenarioFigure(state, presetName, units, presetModified),
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

/**
 * What each device is doing right now, as the inspector reads it out. Every
 * figure is an engine value or an engine formula — nothing here is a plausible
 * number, and a device that is off says so rather than reporting its rating as
 * if it were running.
 */

import {
  calculateHeatingRate,
  getFilterFlow,
  getAirPumpFlow,
  getAirPumpOutput,
  isAirPumpUndersized,
  isScheduleActive,
  FILTER_SPECS,
  FILTER_SURFACE,
  POWERHEAD_FLOW_LPH,
  type DailySchedule,
  type SimulationState,
} from '../../simulation/index.js';
import { getLightOutput } from '../../simulation/equipment/light.js';
import { WATER_LEVEL_THRESHOLD } from '../../simulation/equipment/ato.js';
import { formatCo2Rate } from '../../simulation/equipment/co2-generator.js';
import { Co2Resource, SurfaceResource } from '../../simulation/resources/index.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import {
  bacteriaReadout,
  colonyCount,
  cycleWord,
  doseDeltas,
  formatDose,
  type BacteriaReadout,
} from '../run/index.js';
import {
  formatFlowRate,
  formatTemperature,
  formatVolume,
  getTemperatureUnit,
  type UnitSystem,
} from '../utils/units.js';
import type { EquipmentId } from './devices.js';
import { hourLabel, scheduleRange } from './schedules.js';

export interface DeviceReading {
  label: string;
  value: string;
  note?: string;
}

export interface DeviceReadingInput {
  state: SimulationState;
  config: TunableConfig;
  units: UnitSystem;
}

/** A temperature difference, which converts by scale alone — no 32° offset. */
function temperatureGap(celsius: number, units: UnitSystem): string {
  const scaled = units === 'imperial' ? (celsius * 9) / 5 : celsius;
  return `${scaled.toFixed(1)} ${getTemperatureUnit(units)}`;
}

/** Flow as tank volumes per hour, in the one wording every surface quotes. */
export function turnover(litersPerHour: number, capacity: number): string {
  if (capacity <= 0) return '—';
  return `${(litersPerHour / capacity).toFixed(1)} × tank volume/h`;
}

/** How much longer a running schedule has, for one that ever stops. */
function runsUntil(schedule: DailySchedule): string {
  if (schedule.duration >= 24) return 'all day';
  return `until ${hourLabel((schedule.startHour + schedule.duration) % 24)}`;
}

function heaterReadings({ state, units }: DeviceReadingInput): DeviceReading[] {
  const { heater } = state.equipment;
  const { temperature, water } = state.resources;
  const gap = temperature - heater.targetTemperature;
  const rate = calculateHeatingRate(heater.wattage, water);

  return [
    {
      label: 'Water now',
      value: formatTemperature(temperature, units, 1),
      note: !heater.enabled
        ? 'unheated'
        : Math.abs(gap) < 0.05
          ? 'at target'
          : `${temperatureGap(Math.abs(gap), units)} ${gap > 0 ? 'over' : 'under'} target`,
    },
    {
      label: 'Element',
      value: !heater.enabled ? 'off' : heater.isOn ? 'heating' : 'idle',
    },
    {
      label: 'Heat rate',
      value: `${temperatureGap(rate, units)}/h`,
      note: `${heater.wattage} W in ${formatVolume(water, units, 0)}`,
    },
    {
      label: 'Room',
      value: formatTemperature(state.environment.roomTemperature, units, 0),
      note: 'set in Scenario',
    },
  ];
}

function filterReadings({ state, units }: DeviceReadingInput): DeviceReading[] {
  const { filter } = state.equipment;
  const lph = getFilterFlow(filter.type, state.tank.capacity);
  const media = FILTER_SURFACE[filter.type];
  const share = state.resources.surface > 0 ? (media / state.resources.surface) * 100 : 0;

  return [
    {
      label: 'Flow',
      value: filter.enabled ? formatFlowRate(lph, units) : 'none',
      note: filter.enabled ? turnover(lph, state.tank.capacity) : 'no circulation while off',
    },
    {
      label: 'Media surface',
      value: SurfaceResource.format(media),
      note: filter.enabled
        ? `${Math.round(share)} % of the tank’s biofilm`
        : 'not colonised while off',
    },
    {
      label: 'Rated to',
      value: formatVolume(FILTER_SPECS[filter.type].maxCapacityLiters, units, 0),
    },
  ];
}

function lightReadings({ state }: DeviceReadingInput): DeviceReading[] {
  const { light } = state.equipment;
  const hour = state.tick % 24;
  const lit = light.enabled && isScheduleActive(hour, light.schedule);

  return [
    {
      label: 'Output now',
      value: `${getLightOutput(light, hour)} W`,
      note: !light.enabled
        ? 'fixture off'
        : lit
          ? `lit ${runsUntil(light.schedule)}`
          : `next on at ${hourLabel(light.schedule.startHour)}`,
    },
    { label: 'Photoperiod', value: `${light.schedule.duration} h/day` },
  ];
}

function airPumpReadings({ state, units }: DeviceReadingInput): DeviceReading[] {
  const { airPump } = state.equipment;
  const capacity = state.tank.capacity;
  const output = formatFlowRate(getAirPumpOutput(capacity), units);

  return [
    {
      label: 'Air output',
      value: airPump.enabled ? output : 'none',
      note: airPump.enabled
        ? `+${formatFlowRate(getAirPumpFlow(capacity), units)} of flow`
        : `would move ${output}`,
    },
    {
      label: 'Aeration',
      value: state.resources.aeration ? 'active' : 'none',
      note: !airPump.enabled && state.resources.aeration ? 'from the air-driven filter' : undefined,
    },
  ];
}

function atoReadings({ state, units }: DeviceReadingInput): DeviceReading[] {
  const { water } = state.resources;
  const capacity = state.tank.capacity;

  return [
    {
      label: 'Water level',
      value: `${capacity > 0 ? Math.round((water / capacity) * 100) : 0} %`,
      note: `${formatVolume(water, units, 1)} of ${formatVolume(capacity, units, 0)}`,
    },
    {
      label: 'Tops off below',
      value: `${Math.round(WATER_LEVEL_THRESHOLD * 100)} %`,
      note: 'refills to full in one hour',
    },
  ];
}

function co2Readings({ state }: DeviceReadingInput): DeviceReading[] {
  const { co2Generator } = state.equipment;
  const hour = state.tick % 24;
  const injecting = co2Generator.enabled && isScheduleActive(hour, co2Generator.schedule);

  return [
    { label: 'CO₂ now', value: Co2Resource.format(state.resources.co2) },
    {
      label: 'Injecting',
      value: !co2Generator.enabled ? 'off' : injecting ? 'yes' : 'no',
      note: !co2Generator.enabled
        ? `would run ${scheduleRange(co2Generator.schedule)}`
        : injecting
          ? runsUntil(co2Generator.schedule)
          : `next at ${hourLabel(co2Generator.schedule.startHour)}`,
    },
  ];
}

function powerheadReadings({ state, units }: DeviceReadingInput): DeviceReading[] {
  const { powerhead } = state.equipment;
  const { flow } = state.resources;
  const lph = POWERHEAD_FLOW_LPH[powerhead.flowRateGPH];

  return [
    {
      label: 'Tank circulation',
      value: formatFlowRate(flow, units),
      note: turnover(flow, state.tank.capacity),
    },
    {
      label: 'This powerhead',
      value: powerhead.enabled ? formatFlowRate(lph, units) : 'off',
      note: powerhead.enabled
        ? turnover(lph, state.tank.capacity)
        : `would add ${formatFlowRate(lph, units)}`,
    },
  ];
}

function autoDoserReadings({ state }: DeviceReadingInput): DeviceReading[] {
  const { autoDoser } = state.equipment;
  const hour = state.tick % 24;
  const until = (autoDoser.schedule.startHour - hour + 24) % 24;

  return [
    {
      label: 'Next dose',
      value: autoDoser.enabled ? hourLabel(autoDoser.schedule.startHour) : 'off',
      note: !autoDoser.enabled
        ? `would dose at ${hourLabel(autoDoser.schedule.startHour)}`
        : autoDoser.dosedToday
          ? 'dosed today'
          : until === 0
            ? 'this hour'
            : `in ${until} h`,
    },
  ];
}

/** What the cycle reading rests on, in the terms a keeper tests for. */
function cycleNote(readout: BacteriaReadout): string {
  if (readout.cycled) return 'NH₃ and NO₂ at trace, both stages keeping up';
  if (readout.aob.count === 0) return 'nothing colonised yet';
  if (readout.atTrace) return 'colonies too small to hold a feeding';
  return readout.rates.netNitrite > 0 ? 'nitrite still climbing' : 'NH₃ or NO₂ still reading';
}

function biofilterReadings({ state, config }: DeviceReadingInput): DeviceReading[] {
  const readout = bacteriaReadout(state, config);
  const colony = (count: number, ceiling: number): string =>
    `${colonyCount(count)} / ${colonyCount(ceiling)}`;

  return [
    {
      label: 'Cycle',
      value: cycleWord(readout.cycled),
      note: cycleNote(readout),
    },
    {
      label: 'AOB · ammonia → nitrite',
      value: colony(readout.aob.count, readout.aob.ceiling),
      note: `${Math.round(readout.aob.pct)} % of ceiling`,
    },
    {
      label: 'NOB · nitrite → nitrate',
      value: colony(readout.nob.count, readout.nob.ceiling),
      note: `${Math.round(readout.nob.pct)} % of ceiling`,
    },
    { label: 'Biofilm surface', value: SurfaceResource.format(readout.surface) },
  ];
}

const READINGS: Record<EquipmentId, (input: DeviceReadingInput) => DeviceReading[]> = {
  filter: filterReadings,
  heater: heaterReadings,
  light: lightReadings,
  airPump: airPumpReadings,
  ato: atoReadings,
  co2Generator: co2Readings,
  powerhead: powerheadReadings,
  autoDoser: autoDoserReadings,
  biofilter: biofilterReadings,
};

export function deviceReadings(id: EquipmentId, input: DeviceReadingInput): DeviceReading[] {
  return READINGS[id](input);
}

export interface DeviceHint {
  text: string;
  tone: 'muted' | 'warn';
}

/** The one sentence worth saying about a device beyond its own figures. */
export function deviceHint(
  id: EquipmentId,
  state: SimulationState,
  config: TunableConfig
): DeviceHint | null {
  const { equipment, tank, resources } = state;
  const muted = (text: string): DeviceHint => ({ text, tone: 'muted' });

  switch (id) {
    case 'filter': {
      if (!equipment.filter.enabled) {
        return muted('No biological filtration while the filter is off.');
      }
      const spec = FILTER_SPECS[equipment.filter.type];
      if (tank.capacity <= spec.maxCapacityLiters) return null;
      const lph = getFilterFlow(equipment.filter.type, tank.capacity);
      return {
        text: `Undersized for this tank — ${turnover(lph, tank.capacity)} against the ${spec.targetTurnover} × it is built for.`,
        tone: 'warn',
      };
    }
    case 'heater':
      return null;
    case 'light':
      return muted('Photoperiod drives plant growth, and the algae with it.');
    case 'airPump':
      return equipment.airPump.enabled && isAirPumpUndersized(tank.capacity)
        ? { text: 'Past what one air stone can aerate — this tank needs more.', tone: 'warn' }
        : muted('Adds oxygen and off-gasses CO₂ through surface agitation.');
    case 'ato':
      return muted('Tops off with tap water, blending the tank toward tap pH and temperature.');
    case 'co2Generator':
      return muted(
        `${formatCo2Rate(equipment.co2Generator.bubbleRate, tank.capacity)} while injecting.`
      );
    case 'powerhead':
      return muted('Extra circulation and gas exchange on top of the filter.');
    case 'autoDoser':
      return muted(
        `Each dose adds ${formatDose(
          doseDeltas(
            equipment.autoDoser.doseAmountMl,
            resources.water,
            config.nutrients.fertilizerFormula
          )
        )} ppm.`
      );
    case 'biofilter':
      return muted(
        'Colonies grow into whatever surface the filter, substrate, hardscape and glass offer — there is nothing to set here.'
      );
  }
}

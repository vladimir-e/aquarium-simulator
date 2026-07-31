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
  isScheduleActive,
  FILTER_SPECS,
  FILTER_SURFACE,
  POWERHEAD_FLOW_LPH,
  type PowerheadFlowRate,
  type SimulationState,
} from '../../simulation/index.js';
import { getLightOutput } from '../../simulation/equipment/light.js';
import { WATER_LEVEL_THRESHOLD } from '../../simulation/equipment/ato.js';
import { formatCo2Rate } from '../../simulation/equipment/co2-generator.js';
import { formatDosePreview } from '../../simulation/equipment/auto-doser.js';
import { SurfaceResource } from '../../simulation/resources/index.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import { bacteriaReadout, CYCLED_PCT } from '../run/index.js';
import {
  formatFlowRate,
  formatTemperature,
  formatVolume,
  getTemperatureUnit,
  lphToGph,
  type UnitSystem,
} from '../utils/units.js';
import type { EquipmentId } from './devices.js';
import { hourLabel } from './schedules.js';

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

const POWERHEAD_SUITED_TO: Record<UnitSystem, Record<PowerheadFlowRate, string>> = {
  imperial: { 240: '5–20 gal', 400: '20–30 gal', 600: '30–50 gal', 850: '50–80 gal' },
  metric: { 240: '20–75 L', 400: '75–115 L', 600: '115–190 L', 850: '190–300 L' },
};

/** A temperature difference, which converts by scale alone — no 32° offset. */
function temperatureGap(celsius: number, units: UnitSystem): string {
  const scaled = units === 'imperial' ? (celsius * 9) / 5 : celsius;
  return `${scaled.toFixed(1)} ${getTemperatureUnit(units)}`;
}

function turnover(litersPerHour: number, capacity: number): string {
  if (capacity <= 0) return '—';
  return `${(litersPerHour / capacity).toFixed(1)} × tank volume/h`;
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
      value: filter.enabled ? formatFlowRate(Math.round(lphToGph(lph)), units) : 'none',
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
  const end = (light.schedule.startHour + light.schedule.duration) % 24;

  return [
    {
      label: 'Output now',
      value: `${getLightOutput(light, hour)} W`,
      note: !light.enabled
        ? 'fixture off'
        : lit
          ? `lit until ${hourLabel(end)}`
          : `next on at ${hourLabel(light.schedule.startHour)}`,
    },
    { label: 'Photoperiod', value: `${light.schedule.duration} h/day` },
  ];
}

function airPumpReadings({ state }: DeviceReadingInput): DeviceReading[] {
  const { airPump } = state.equipment;
  const capacity = state.tank.capacity;
  const output = getAirPumpOutput(capacity);

  return [
    {
      label: 'Air output',
      value: airPump.enabled ? `${output} L/h` : 'none',
      note: airPump.enabled
        ? `+${getAirPumpFlow(capacity)} L/h of flow`
        : `would move ${output} L/h`,
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
    { label: 'CO₂ now', value: `${state.resources.co2.toFixed(1)} ppm` },
    {
      label: 'Injecting',
      value: injecting ? 'yes' : 'no',
      note:
        co2Generator.enabled && !injecting
          ? `next at ${hourLabel(co2Generator.schedule.startHour)}`
          : undefined,
    },
  ];
}

function powerheadReadings({ state, units }: DeviceReadingInput): DeviceReading[] {
  const { powerhead } = state.equipment;
  const { flow } = state.resources;

  return [
    {
      label: 'Tank circulation',
      value: `${Math.round(flow)} L/h`,
      note: turnover(flow, state.tank.capacity),
    },
    {
      label: 'This powerhead',
      value: powerhead.enabled ? `${POWERHEAD_FLOW_LPH[powerhead.flowRateGPH]} L/h` : 'off',
      note: `rated for ${POWERHEAD_SUITED_TO[units][powerhead.flowRateGPH]}`,
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

function biofilterReadings({ state, config }: DeviceReadingInput): DeviceReading[] {
  const readout = bacteriaReadout(state, config);
  const colony = (count: number, ceiling: number): string =>
    `${Math.round(count)} / ${Math.round(ceiling)}`;

  return [
    {
      label: 'Colonisation',
      value: `${Math.round(readout.colonisation)} %`,
      note: readout.cycled ? 'cycled' : `cycled at ${CYCLED_PCT} %`,
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
export function deviceHint(id: EquipmentId, state: SimulationState): DeviceHint | null {
  const { equipment, tank, resources } = state;
  const muted = (text: string): DeviceHint => ({ text, tone: 'muted' });

  switch (id) {
    case 'filter':
      if (!equipment.filter.enabled) {
        return muted('No biological filtration while the filter is off.');
      }
      return tank.capacity > FILTER_SPECS[equipment.filter.type].maxCapacityLiters
        ? { text: 'Undersized for this tank — filtration can’t keep up.', tone: 'warn' }
        : null;
    case 'heater':
      return null;
    case 'light':
      return muted('Photoperiod drives plant growth, and the algae with it.');
    case 'airPump':
      return muted('Adds oxygen and off-gasses CO₂ through surface agitation.');
    case 'ato':
      return muted('Tops off with tap water, blending the tank toward tap pH and temperature.');
    case 'co2Generator':
      return muted(
        `${formatCo2Rate(equipment.co2Generator.bubbleRate, tank.capacity)} while injecting.`
      );
    case 'powerhead':
      return muted('Extra circulation and gas exchange on top of the filter.');
    case 'autoDoser':
      return muted(formatDosePreview(equipment.autoDoser.doseAmountMl, resources.water));
    case 'biofilter':
      return muted(
        'Colonies grow into whatever surface the filter, substrate, hardscape and glass offer — there is nothing to set here.'
      );
  }
}

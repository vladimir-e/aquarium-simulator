/**
 * Equipment model: the fixed device set, the one-line summary each list row
 * carries, and the section's own headline figure. Pure — the Equipment list and
 * the index rail both render these, which is what keeps their counts in
 * agreement.
 */

import { getFilterFlow, type Equipment, type SimulationState } from '../../simulation/index.js';
import type { TunableConfig } from '../../simulation/config/index.js';
import { SurfaceResource } from '../../simulation/resources/index.js';
import { biofilterColonisation, CYCLED_PCT } from '../run/index.js';
import { formatFlowRate, formatTemperature, lphToGph, type UnitSystem } from '../utils/units.js';
import { hourLabel, scheduleRange } from './schedules.js';

/** The configurable devices, in list order. */
export type DeviceId =
  | 'filter'
  | 'heater'
  | 'light'
  | 'airPump'
  | 'ato'
  | 'co2Generator'
  | 'powerhead'
  | 'autoDoser';

/** A list entry: the eight devices plus the biofilter, which is derived. */
export type EquipmentId = DeviceId | 'biofilter';

export interface DeviceRow {
  id: DeviceId;
  name: string;
  /** Whether the device is enabled — drives the list status dot. */
  on: boolean;
}

export interface EquipmentRow {
  id: EquipmentId;
  name: string;
  /** Enabled, or cycled for the biofilter. */
  on: boolean;
  summary: string;
}

const DEVICE_ORDER: DeviceId[] = [
  'filter',
  'heater',
  'light',
  'airPump',
  'ato',
  'co2Generator',
  'powerhead',
  'autoDoser',
];

export const DEVICE_NAME: Record<DeviceId, string> = {
  filter: 'Filter',
  heater: 'Heater',
  light: 'Light',
  airPump: 'Air pump',
  ato: 'ATO',
  co2Generator: 'CO₂ injector',
  powerhead: 'Powerhead',
  autoDoser: 'Auto doser',
};

export const EQUIPMENT_NAME: Record<EquipmentId, string> = {
  ...DEVICE_NAME,
  biofilter: 'Biofilter',
};

export function isEquipmentId(value: string): value is EquipmentId {
  return value in EQUIPMENT_NAME;
}

export function buildDeviceList(equipment: Equipment): DeviceRow[] {
  return DEVICE_ORDER.map((id) => ({ id, name: DEVICE_NAME[id], on: equipment[id].enabled }));
}

/** The right-hand figure on a device row: its setting, or `off`. */
function deviceSummary(id: DeviceId, state: SimulationState, units: UnitSystem): string {
  const { equipment, tank } = state;
  switch (id) {
    case 'filter': {
      const f = equipment.filter;
      const gph = Math.round(lphToGph(getFilterFlow(f.type, tank.capacity)));
      return f.enabled ? `${f.type} · ${formatFlowRate(gph, units)}` : 'off';
    }
    case 'heater': {
      const h = equipment.heater;
      return h.enabled ? `on · target ${formatTemperature(h.targetTemperature, units, 0)}` : 'off';
    }
    case 'light': {
      const l = equipment.light;
      return l.enabled ? `${l.wattage} W · ${scheduleRange(l.schedule)}` : 'off';
    }
    case 'airPump':
      return equipment.airPump.enabled ? 'on' : 'off';
    case 'ato':
      return equipment.ato.enabled ? 'on · tops to full' : 'off';
    case 'co2Generator': {
      const c = equipment.co2Generator;
      return c.enabled ? `${c.bubbleRate.toFixed(1)} bps · ${scheduleRange(c.schedule)}` : 'off';
    }
    case 'powerhead': {
      const p = equipment.powerhead;
      return p.enabled ? formatFlowRate(p.flowRateGPH, units) : 'off';
    }
    case 'autoDoser': {
      const d = equipment.autoDoser;
      return d.enabled
        ? `${d.doseAmountMl.toFixed(1)} ml · ${hourLabel(d.schedule.startHour)}`
        : 'off';
    }
  }
}

/** Every list row, in order. The biofilter closes the list: derived, no settings. */
export function equipmentRows(
  state: SimulationState,
  config: TunableConfig,
  units: UnitSystem
): EquipmentRow[] {
  const colonisation = biofilterColonisation(state.resources, config.nitrogenCycle);
  return [
    ...buildDeviceList(state.equipment).map((device) => ({
      ...device,
      summary: deviceSummary(device.id, state, units),
    })),
    {
      id: 'biofilter' as const,
      name: EQUIPMENT_NAME.biofilter,
      on: colonisation >= CYCLED_PCT,
      summary: `${Math.round(colonisation)} % · ${SurfaceResource.format(state.resources.surface)}`,
    },
  ];
}

/** Case-insensitive name filter for the search field. Blank query = all. */
export function filterRows(rows: EquipmentRow[], query: string): EquipmentRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => row.name.toLowerCase().includes(q));
}

/** The section's headline figure, shared with the rail's Equipment row. */
export function equipmentSummary(state: SimulationState, config: TunableConfig): string {
  const devices = buildDeviceList(state.equipment);
  const on = devices.filter((d) => d.on).length;
  const colonisation = Math.round(biofilterColonisation(state.resources, config.nitrogenCycle));
  return `${on} of ${devices.length} on · biofilter ${colonisation} %`;
}

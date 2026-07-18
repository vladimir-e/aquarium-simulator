/**
 * Equipment column model: the fixed device set, its search filter, and the
 * routing from a carried-in selection (a Systems-card tap) to a device. Pure —
 * the column renders these and owns the selection state.
 */

import type { Equipment } from '../../simulation/index.js';

/**
 * The configurable devices, in list order. Matches the ids the Run Systems
 * card emits (so a device tap preselects here), plus the auto doser, whose
 * schedule/amount only have a home in Build.
 */
export type DeviceId =
  | 'filter'
  | 'heater'
  | 'light'
  | 'airPump'
  | 'ato'
  | 'co2Generator'
  | 'powerhead'
  | 'autoDoser';

export interface DeviceRow {
  id: DeviceId;
  name: string;
  /** Whether the device is enabled — drives the list status dot. */
  on: boolean;
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

export function isDeviceId(value: string): value is DeviceId {
  return value in DEVICE_NAME;
}

export function buildDeviceList(equipment: Equipment): DeviceRow[] {
  return DEVICE_ORDER.map((id) => ({ id, name: DEVICE_NAME[id], on: equipment[id].enabled }));
}

/** Case-insensitive name filter for the search field. Blank query = all. */
export function filterDevices(devices: DeviceRow[], query: string): DeviceRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return devices;
  return devices.filter((d) => d.name.toLowerCase().includes(q));
}

/**
 * The device the inspector opens on. Honours a carried-in id (Systems tap),
 * falling back to the first device. Uses the full list, not the filtered one —
 * a search hiding the selected device must not deselect it.
 */
export function resolveSelectedDevice(selectedId: string | null, devices: DeviceRow[]): DeviceId {
  if (selectedId && isDeviceId(selectedId) && devices.some((d) => d.id === selectedId)) {
    return selectedId;
  }
  return devices[0]?.id ?? 'filter';
}

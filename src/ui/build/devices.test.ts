import { describe, it, expect } from 'vitest';
import { createSimulation } from '../../simulation/index.js';
import { buildDeviceList, filterDevices, isDeviceId, resolveSelectedDevice } from './devices';

const equipment = createSimulation({ tankCapacity: 40 }).equipment;

describe('buildDeviceList', () => {
  it('lists the eight configurable devices in order', () => {
    expect(buildDeviceList(equipment).map((d) => d.id)).toEqual([
      'filter',
      'heater',
      'light',
      'airPump',
      'ato',
      'co2Generator',
      'powerhead',
      'autoDoser',
    ]);
  });

  it('reflects each device enabled flag in its status dot', () => {
    const list = buildDeviceList(equipment);
    for (const row of list) {
      expect(row.on).toBe(equipment[row.id].enabled);
    }
  });
});

describe('filterDevices', () => {
  const list = buildDeviceList(equipment);

  it('returns all devices for a blank query', () => {
    expect(filterDevices(list, '')).toHaveLength(list.length);
    expect(filterDevices(list, '   ')).toHaveLength(list.length);
  });

  it('matches on name, case-insensitively', () => {
    expect(filterDevices(list, 'air').map((d) => d.id)).toEqual(['airPump']);
    expect(filterDevices(list, 'PUMP').map((d) => d.id)).toEqual(['airPump']);
    expect(filterDevices(list, 'co₂').map((d) => d.id)).toEqual(['co2Generator']);
  });

  it('returns nothing when no name matches', () => {
    expect(filterDevices(list, 'skimmer')).toEqual([]);
  });
});

describe('isDeviceId', () => {
  it('accepts device ids and rejects others', () => {
    expect(isDeviceId('filter')).toBe(true);
    expect(isDeviceId('autoDoser')).toBe(true);
    expect(isDeviceId('substrate')).toBe(false);
    expect(isDeviceId('')).toBe(false);
  });
});

describe('resolveSelectedDevice', () => {
  const list = buildDeviceList(equipment);

  it('honours a carried-in device id', () => {
    expect(resolveSelectedDevice('light', list)).toBe('light');
  });

  it('falls back to the first device for null or unknown ids', () => {
    expect(resolveSelectedDevice(null, list)).toBe('filter');
    expect(resolveSelectedDevice('substrate', list)).toBe('filter');
  });
});

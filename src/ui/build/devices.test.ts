import { describe, it, expect } from 'vitest';
import { createSimulation, type SimulationState } from '../../simulation/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { cycledTank } from '../../simulation/tests/tanks.js';
import { bacteriaReadout, type BacteriaReadout } from '../run/index.js';
import {
  buildDeviceList,
  equipmentRows,
  equipmentSummary,
  filterRows,
  isEquipmentId,
} from './devices';

/** Defaults: filter, heater and light on; the other five off. */
const base: SimulationState = createSimulation({ tankCapacity: 40 });
const withPowerhead: SimulationState = createSimulation({
  tankCapacity: 40,
  powerhead: { enabled: true, flowRateGPH: 400 },
});
const readout = (state: SimulationState): BacteriaReadout =>
  bacteriaReadout(state, DEFAULT_CONFIG);
const rows = equipmentRows(base, readout(base), 'metric');

describe('buildDeviceList', () => {
  it('lists the eight configurable devices in order', () => {
    expect(buildDeviceList(base.equipment).map((d) => d.id)).toEqual([
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
    for (const row of buildDeviceList(base.equipment)) {
      expect(row.on).toBe(base.equipment[row.id].enabled);
    }
  });
});

describe('equipmentRows', () => {
  it('closes the eight devices with the derived biofilter', () => {
    expect(rows).toHaveLength(9);
    expect(rows[8].id).toBe('biofilter');
    expect(rows[8].summary).toMatch(/^0 % · [\d,]+ cm²$/);
  });

  it('summarises a running device by its setting and a stopped one by "off"', () => {
    expect(rows.find((r) => r.id === 'heater')?.summary).toBe('on · target 25°C');
    expect(rows.find((r) => r.id === 'light')?.summary).toBe('100 W · 08:00–18:00');
    expect(rows.find((r) => r.id === 'powerhead')?.summary).toBe('off');
  });

  it('reads filter and powerhead flow in the reader’s units', () => {
    // Engine values: the sponge turns a 40 L tank over 4× an hour; the 400 GPH
    // powerhead preset is 1514 L/h.
    const imperialRows = equipmentRows(withPowerhead, readout(withPowerhead), 'imperial');
    const metricRows = equipmentRows(withPowerhead, readout(withPowerhead), 'metric');
    const summary = (list: typeof rows, id: string): string | undefined =>
      list.find((r) => r.id === id)?.summary;

    expect(summary(metricRows, 'filter')).toBe('sponge · 160 L/h');
    expect(summary(metricRows, 'powerhead')).toBe('1514 L/h');
    expect(summary(imperialRows, 'filter')).toBe('sponge · 42 GPH');
    expect(summary(imperialRows, 'powerhead')).toBe('400 GPH');
  });

  it('marks the biofilter on once it is cycled', () => {
    const cycled = cycledTank(40);
    expect(equipmentRows(cycled, readout(cycled), 'metric')[8].on).toBe(true);
    expect(rows[8].on).toBe(false);
  });
});

describe('isEquipmentId', () => {
  it('admits every list row and nothing else', () => {
    for (const row of rows) expect(isEquipmentId(row.id)).toBe(true);
    expect(isEquipmentId('skimmer')).toBe(false);
    expect(isEquipmentId('')).toBe(false);
  });

  it('rejects Object.prototype keys — a route is arbitrary user input', () => {
    for (const key of ['toString', 'constructor', 'valueOf', 'hasOwnProperty', '__proto__']) {
      expect(isEquipmentId(key)).toBe(false);
    }
  });
});

describe('filterRows', () => {
  it('returns every row for a blank query', () => {
    expect(filterRows(rows, '')).toHaveLength(9);
    expect(filterRows(rows, '   ')).toHaveLength(9);
  });

  it('matches on name, case-insensitively', () => {
    expect(filterRows(rows, 'air').map((r) => r.id)).toEqual(['airPump']);
    expect(filterRows(rows, 'PUMP').map((r) => r.id)).toEqual(['airPump']);
    expect(filterRows(rows, 'co₂').map((r) => r.id)).toEqual(['co2Generator']);
    expect(filterRows(rows, 'bio').map((r) => r.id)).toEqual(['biofilter']);
  });

  it('returns nothing when no name matches', () => {
    expect(filterRows(rows, 'skimmer')).toEqual([]);
  });
});

describe('equipmentSummary', () => {
  it('counts the devices that are on and names the biofilter', () => {
    expect(equipmentSummary(base, readout(base))).toBe('3 of 8 on · biofilter 0 %');
  });

  it('follows a device being switched off', () => {
    const dark: SimulationState = {
      ...base,
      equipment: { ...base.equipment, light: { ...base.equipment.light, enabled: false } },
    };
    expect(equipmentSummary(dark, readout(dark))).toBe('2 of 8 on · biofilter 0 %');
  });
});

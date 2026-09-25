import { describe, it, expect } from 'vitest';
import { createSimulation, type SimulationState } from '../../simulation/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { getFilterFlow } from '../../simulation/equipment/filter.js';
import { POWERHEAD_FLOW_LPH } from '../../simulation/equipment/powerhead.js';
import { bacteriaReadout, type BacteriaReadout } from '../run/index.js';
import {
  buildDeviceList,
  equipmentRows,
  equipmentSummary,
  isDeviceId,
} from './devices';

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
    expect(rows[8].summary).toMatch(/^uncycled · [\d,]+ cm²$/);
  });

  it('summarises a running device by its setting and a stopped one by "off"', () => {
    expect(rows.find((r) => r.id === 'heater')?.summary).toBe('on · target 25°C');
    expect(rows.find((r) => r.id === 'light')?.summary).toBe('50 PAR at surface · 08:00–18:00');
    expect(rows.find((r) => r.id === 'powerhead')?.summary).toBe('off');
  });

  it('reads filter and powerhead flow in the reader’s units', () => {
    const imperialRows = equipmentRows(withPowerhead, readout(withPowerhead), 'imperial');
    const metricRows = equipmentRows(withPowerhead, readout(withPowerhead), 'metric');
    const summary = (list: typeof rows, id: string): string | undefined =>
      list.find((r) => r.id === id)?.summary;

    expect(summary(metricRows, 'filter')).toBe(`sponge · ${getFilterFlow('sponge', 40)} L/h`);
    expect(summary(metricRows, 'powerhead')).toBe(`${POWERHEAD_FLOW_LPH[400]} L/h`);
    expect(summary(imperialRows, 'filter')).toMatch(/^sponge · \d+ GPH$/);
    expect(summary(imperialRows, 'powerhead')).toBe('400 GPH');
  });

  it('marks the biofilter on once it is cycled, and says so', () => {
    const cycled = createSimulation({ tankCapacity: 40 }, { bacteria: 'cycled' });
    const row = equipmentRows(cycled, readout(cycled), 'metric')[8];

    expect(row.on).toBe(true);
    expect(row.summary).toMatch(/^cycled · [\d,]+ cm²$/);
    expect(rows[8].on).toBe(false);
  });
});

describe('isDeviceId', () => {
  it('admits every device the rack racks, and nothing else', () => {
    for (const device of buildDeviceList(base.equipment)) {
      expect(isDeviceId(device.id)).toBe(true);
    }
    expect(isDeviceId('biofilter')).toBe(false);
    expect(isDeviceId('skimmer')).toBe(false);
    expect(isDeviceId('')).toBe(false);
  });

  it('rejects Object.prototype keys — a route is arbitrary user input', () => {
    for (const key of ['toString', 'constructor', 'valueOf', 'hasOwnProperty', '__proto__']) {
      expect(isDeviceId(key)).toBe(false);
    }
  });
});

describe('equipmentSummary', () => {
  it('counts the devices that are on and names the biofilter', () => {
    expect(equipmentSummary(base, readout(base))).toBe('3 of 8 on · biofilter uncycled');
  });

  it('follows a device being switched off', () => {
    const dark: SimulationState = {
      ...base,
      equipment: { ...base.equipment, light: { ...base.equipment.light, enabled: false } },
    };
    expect(equipmentSummary(dark, readout(dark))).toBe('2 of 8 on · biofilter uncycled');
  });
});

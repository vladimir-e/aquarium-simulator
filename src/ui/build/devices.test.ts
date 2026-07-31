import { describe, it, expect } from 'vitest';
import { createSimulation, type SimulationState } from '../../simulation/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { buildDeviceList, equipmentRows, equipmentSummary, filterRows } from './devices';

/** Defaults: filter, heater and light on; the other five off. */
const base: SimulationState = createSimulation({ tankCapacity: 40 });
const rows = equipmentRows(base, DEFAULT_CONFIG, 'metric');

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

  it('reads flow in the reader’s units', () => {
    const metric = rows.find((r) => r.id === 'filter')?.summary;
    const imperial = equipmentRows(base, DEFAULT_CONFIG, 'imperial').find(
      (r) => r.id === 'filter'
    )?.summary;
    expect(metric).toBe('sponge · 159 L/h');
    expect(imperial).toBe('sponge · 42 GPH');
  });

  it('marks the biofilter on once it is cycled', () => {
    const cycled: SimulationState = {
      ...base,
      resources: {
        ...base.resources,
        aob: base.resources.surface * DEFAULT_CONFIG.nitrogenCycle.bacteriaPerCm2,
        nob: base.resources.surface * DEFAULT_CONFIG.nitrogenCycle.bacteriaPerCm2,
      },
    };
    expect(equipmentRows(cycled, DEFAULT_CONFIG, 'metric')[8].on).toBe(true);
    expect(rows[8].on).toBe(false);
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
    expect(equipmentSummary(base, DEFAULT_CONFIG)).toBe('3 of 8 on · biofilter 0 %');
  });

  it('follows a device being switched off', () => {
    const dark: SimulationState = {
      ...base,
      equipment: { ...base.equipment, light: { ...base.equipment.light, enabled: false } },
    };
    expect(equipmentSummary(dark, DEFAULT_CONFIG)).toBe('2 of 8 on · biofilter 0 %');
  });
});

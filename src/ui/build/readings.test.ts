import { describe, it, expect } from 'vitest';
import { createSimulation, tick, type SimulationState } from '../../simulation/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { bacteriaReadout } from '../run/index.js';
import type { UnitSystem } from '../utils/units.js';
import type { EquipmentId } from './devices';
import { deviceHint, deviceReadings, type DeviceReading } from './readings';

const base: SimulationState = createSimulation({ tankCapacity: 40 });

function read(
  id: EquipmentId,
  state: SimulationState = base,
  units: UnitSystem = 'metric'
): DeviceReading[] {
  return deviceReadings(id, { state, config: DEFAULT_CONFIG, units });
}

function value(readings: DeviceReading[], label: string): DeviceReading {
  const found = readings.find((r) => r.label === label);
  if (!found) throw new Error(`no reading labelled ${label}`);
  return found;
}

describe('heater readings', () => {
  it('measures the water against the target the heater is holding', () => {
    const cold: SimulationState = {
      ...base,
      resources: { ...base.resources, temperature: 22.5 },
    };
    expect(value(read('heater', cold), 'Water now')).toEqual({
      label: 'Water now',
      value: '22.5°C',
      note: '2.5 °C under target',
    });
    expect(value(read('heater'), 'Water now').note).toBe('at target');
  });

  it('converts the gap by scale, not by the freezing offset', () => {
    const warm: SimulationState = {
      ...base,
      resources: { ...base.resources, temperature: 26 },
    };
    expect(value(read('heater', warm, 'imperial'), 'Water now').note).toBe('1.8 °F over target');
  });

  it('reports the element from engine state, and says off when disabled', () => {
    const running = tick(base, DEFAULT_CONFIG);
    expect(value(read('heater', running), 'Element').value).toBe(
      running.equipment.heater.isOn ? 'heating' : 'idle'
    );

    const unheated: SimulationState = {
      ...base,
      equipment: { ...base.equipment, heater: { ...base.equipment.heater, enabled: false } },
    };
    expect(value(read('heater', unheated), 'Element').value).toBe('off');
    expect(value(read('heater', unheated), 'Water now').note).toBe('unheated');
  });
});

describe('filter readings', () => {
  it('reads flow as turnover and media as a share of the tank’s biofilm', () => {
    const readings = read('filter');
    expect(value(readings, 'Flow')).toEqual({
      label: 'Flow',
      value: '159 L/h',
      note: '4.0 × tank volume/h',
    });
    expect(value(readings, 'Media surface').note).toBe('58 % of the tank’s biofilm');
  });

  it('stops claiming flow or colonisation once it is switched off', () => {
    const off: SimulationState = {
      ...base,
      equipment: { ...base.equipment, filter: { ...base.equipment.filter, enabled: false } },
    };
    const readings = read('filter', off);
    expect(value(readings, 'Flow').value).toBe('none');
    expect(value(readings, 'Media surface').note).toBe('not colonised while off');
    expect(deviceHint('filter', off)).toEqual({
      text: 'No biological filtration while the filter is off.',
      tone: 'muted',
    });
  });

  it('warns when the filter is rated below the tank it is in', () => {
    const big = createSimulation({ tankCapacity: 400 });
    expect(deviceHint('filter', big)?.tone).toBe('warn');
    expect(deviceHint('filter', base)).toBeNull();
  });
});

describe('light readings', () => {
  it('reports the fixture’s output for the current hour', () => {
    let lit = base;
    for (let i = 0; i < 9; i++) lit = tick(lit, DEFAULT_CONFIG);
    expect(value(read('light', lit), 'Output now')).toEqual({
      label: 'Output now',
      value: '100 W',
      note: 'lit until 18:00',
    });
    expect(value(read('light'), 'Output now')).toEqual({
      label: 'Output now',
      value: '0 W',
      note: 'next on at 08:00',
    });
  });
});

describe('auto doser readings', () => {
  const dosing: SimulationState = {
    ...base,
    equipment: {
      ...base.equipment,
      autoDoser: { ...base.equipment.autoDoser, enabled: true },
    },
  };

  it('counts the hours to the next dose', () => {
    expect(value(read('autoDoser', dosing), 'Next dose')).toEqual({
      label: 'Next dose',
      value: '08:00',
      note: 'in 8 h',
    });
  });

  it('says it has already run once the engine has dosed today', () => {
    let dosed = dosing;
    for (let i = 0; i < 10; i++) dosed = tick(dosed, DEFAULT_CONFIG);
    expect(dosed.equipment.autoDoser.dosedToday).toBe(true);
    expect(value(read('autoDoser', dosed), 'Next dose').note).toBe('dosed today');
  });

  it('offers what it would do while off', () => {
    expect(value(read('autoDoser'), 'Next dose')).toEqual({
      label: 'Next dose',
      value: 'off',
      note: 'would dose at 08:00',
    });
  });
});

describe('air pump readings', () => {
  it('credits an air-driven filter for the aeration the pump is not providing', () => {
    expect(base.equipment.airPump.enabled).toBe(false);
    expect(value(read('airPump'), 'Aeration')).toEqual({
      label: 'Aeration',
      value: 'active',
      note: 'from the air-driven filter',
    });
  });
});

describe('biofilter readings', () => {
  it('reads the same colonies the Water section’s Bacteria card does', () => {
    const readout = bacteriaReadout(base, DEFAULT_CONFIG);
    const readings = read('biofilter');
    expect(value(readings, 'Colonisation').value).toBe(`${Math.round(readout.colonisation)} %`);
    expect(value(readings, 'AOB · ammonia → nitrite').value).toBe(
      `${Math.round(readout.aob.count)} / ${Math.round(readout.aob.ceiling)}`
    );
    expect(value(readings, 'Colonisation').note).toBe('cycled at 25 %');
  });

  it('has nothing to configure, and says so', () => {
    expect(deviceHint('biofilter', base)?.text).toMatch(/nothing to set here/);
  });
});

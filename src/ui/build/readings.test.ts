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

/** The tank at a given water temperature, everything else at defaults. */
function at(temperature: number): SimulationState {
  return { ...base, resources: { ...base.resources, temperature } };
}

/** Turns a device on without touching the rest of its settings. */
function enabled(id: 'airPump' | 'co2Generator'): SimulationState {
  return {
    ...base,
    equipment: { ...base.equipment, [id]: { ...base.equipment[id], enabled: true } },
  };
}

describe('heater readings', () => {
  it('measures the water against the target the heater is holding', () => {
    const cold = at(22.5);
    expect(value(read('heater', cold), 'Water now')).toEqual({
      label: 'Water now',
      value: '22.5°C',
      note: '2.5 °C under target',
    });
    expect(value(read('heater'), 'Water now').note).toBe('at target');
  });

  it('converts the gap by scale, not by the freezing offset', () => {
    expect(value(read('heater', at(26), 'imperial'), 'Water now').note).toBe('1.8 °F over target');
  });

  it('reports the element from engine state, and says off when disabled', () => {
    const heating = tick(at(20), DEFAULT_CONFIG);
    expect(heating.equipment.heater.isOn).toBe(true);
    expect(value(read('heater', heating), 'Element').value).toBe('heating');

    const idle = tick(at(28), DEFAULT_CONFIG);
    expect(idle.equipment.heater.isOn).toBe(false);
    expect(value(read('heater', idle), 'Element').value).toBe('idle');

    const unheated: SimulationState = {
      ...base,
      equipment: { ...base.equipment, heater: { ...base.equipment.heater, enabled: false } },
    };
    expect(value(read('heater', unheated), 'Element').value).toBe('off');
    expect(value(read('heater', unheated), 'Water now').note).toBe('unheated');
  });

  it('reads the heat rate off the wattage and the volume it has to warm', () => {
    expect(value(read('heater'), 'Heat rate')).toEqual({
      label: 'Heat rate',
      value: '3.4 °C/h',
      note: '100 W in 40 L',
    });
    // A rate is a difference, so it scales by 9/5 without the freezing offset.
    expect(value(read('heater', base, 'imperial'), 'Heat rate')).toEqual({
      label: 'Heat rate',
      value: '6.1 °F/h',
      note: '100 W in 11 gal',
    });
  });

  it('carries the room the tank is standing in, and where it is set', () => {
    expect(value(read('heater'), 'Room')).toEqual({
      label: 'Room',
      value: '22°C',
      note: 'set in Scenario',
    });
  });
});

describe('filter readings', () => {
  it('reads flow as turnover and media as a share of the tank’s biofilm', () => {
    const readings = read('filter');
    expect(value(readings, 'Flow')).toEqual({
      label: 'Flow',
      value: '160 L/h',
      note: '4.0 × tank volume/h',
    });
    expect(value(readings, 'Media surface').note).toBe('58 % of the tank’s biofilm');
    expect(value(read('filter', base, 'imperial'), 'Flow').value).toBe('42 GPH');
  });

  it('stops claiming flow or colonisation once it is switched off', () => {
    const off: SimulationState = {
      ...base,
      equipment: { ...base.equipment, filter: { ...base.equipment.filter, enabled: false } },
    };
    const readings = read('filter', off);
    expect(value(readings, 'Flow').value).toBe('none');
    expect(value(readings, 'Media surface').note).toBe('not colonised while off');
    expect(deviceHint('filter', off, DEFAULT_CONFIG)).toEqual({
      text: 'No biological filtration while the filter is off.',
      tone: 'muted',
    });
  });

  it('warns when the filter is rated below the tank it is in', () => {
    const big = createSimulation({ tankCapacity: 400 });
    expect(deviceHint('filter', big, DEFAULT_CONFIG)?.tone).toBe('warn');
    expect(deviceHint('filter', base, DEFAULT_CONFIG)).toBeNull();
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

  it('says a round-the-clock photoperiod is on all day, not on until it started', () => {
    const always: SimulationState = {
      ...base,
      equipment: {
        ...base.equipment,
        light: { ...base.equipment.light, schedule: { startHour: 8, duration: 24 } },
      },
    };
    expect(value(read('light', always), 'Output now').note).toBe('lit all day');
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

  it('reads the engine’s air output and the flow it adds, in the reader’s units', () => {
    // A 40 L tank sits in the pump's small-tank band: 60 L/h of air, 10% of it
    // as water movement.
    expect(value(read('airPump', enabled('airPump')), 'Air output')).toEqual({
      label: 'Air output',
      value: '60 L/h',
      note: '+6 L/h of flow',
    });
    expect(value(read('airPump', enabled('airPump'), 'imperial'), 'Air output')).toEqual({
      label: 'Air output',
      value: '16 GPH',
      note: '+2 GPH of flow',
    });
  });

  it('offers what it would move while off', () => {
    expect(value(read('airPump'), 'Air output')).toEqual({
      label: 'Air output',
      value: 'none',
      note: 'would move 60 L/h',
    });
  });

  it('rounds the cap rather than printing its floating-point tail', () => {
    // Past 400 L the engine's output is 60 × 6.67, which is not exactly 400.2.
    const huge: SimulationState = {
      ...enabled('airPump'),
      tank: { ...base.tank, capacity: 1000 },
    };
    expect(value(read('airPump', huge), 'Air output').value).toBe('400 L/h');
  });
});

describe('ATO readings', () => {
  it('reads the level against capacity and the threshold it acts on', () => {
    const readings = read('ato');
    expect(value(readings, 'Water level')).toEqual({
      label: 'Water level',
      value: '100 %',
      note: '40.0 L of 40 L',
    });
    expect(value(readings, 'Tops off below')).toEqual({
      label: 'Tops off below',
      value: '99 %',
      note: 'refills to full in one hour',
    });
  });

  it('falls with the water it is watching', () => {
    const low: SimulationState = { ...base, resources: { ...base.resources, water: 38 } };
    expect(value(read('ato', low), 'Water level')).toEqual({
      label: 'Water level',
      value: '95 %',
      note: '38.0 L of 40 L',
    });
  });
});

describe('CO₂ injector readings', () => {
  it('says it is off rather than merely not injecting', () => {
    expect(base.equipment.co2Generator.enabled).toBe(false);
    expect(value(read('co2Generator'), 'Injecting')).toEqual({
      label: 'Injecting',
      value: 'off',
      note: 'would run 07:00–17:00',
    });
  });

  it('counts down to the next window while it waits', () => {
    expect(value(read('co2Generator', enabled('co2Generator')), 'Injecting')).toEqual({
      label: 'Injecting',
      value: 'no',
      note: 'next at 07:00',
    });
  });

  it('names the end of the window while it runs', () => {
    let injecting = enabled('co2Generator');
    for (let i = 0; i < 8; i++) injecting = tick(injecting, DEFAULT_CONFIG);
    expect(value(read('co2Generator', injecting), 'Injecting')).toEqual({
      label: 'Injecting',
      value: 'yes',
      note: 'until 17:00',
    });
  });
});

describe('powerhead readings', () => {
  // Built by the engine, so `resources.flow` carries the powerhead's contribution.
  const running: SimulationState = createSimulation({
    tankCapacity: 40,
    powerhead: { enabled: true, flowRateGPH: 400 },
  });

  it('separates the tank’s whole circulation from this device’s share', () => {
    // The engine adds the 400 GPH preset's 1514 L/h to the filter's 160 L/h.
    const readings = read('powerhead', running);
    expect(value(readings, 'Tank circulation')).toEqual({
      label: 'Tank circulation',
      value: '1674 L/h',
      note: '41.9 × tank volume/h',
    });
    expect(value(readings, 'This powerhead')).toEqual({
      label: 'This powerhead',
      value: '1514 L/h',
      note: '37.9 × tank volume/h',
    });
  });

  it('reads both figures in GPH under imperial — the list row’s units', () => {
    const readings = read('powerhead', running, 'imperial');
    expect(value(readings, 'Tank circulation').value).toBe('442 GPH');
    expect(value(readings, 'This powerhead').value).toBe('400 GPH');
  });

  it('offers what it would add while off', () => {
    expect(value(read('powerhead'), 'This powerhead')).toEqual({
      label: 'This powerhead',
      value: 'off',
      note: 'would add 1514 L/h',
    });
  });

  it('declines to divide by a tank with no volume', () => {
    const empty: SimulationState = { ...running, tank: { ...base.tank, capacity: 0 } };
    expect(value(read('powerhead', empty), 'Tank circulation').note).toBe('—');
  });
});

describe('biofilter readings', () => {
  /** Colonies at their ceiling, so the readout is not all zeroes. */
  const cycled: SimulationState = {
    ...base,
    resources: {
      ...base.resources,
      aob: base.resources.surface * DEFAULT_CONFIG.nitrogenCycle.bacteriaPerCm2,
      nob: base.resources.surface * DEFAULT_CONFIG.nitrogenCycle.bacteriaPerCm2,
    },
  };

  it('reads the same colonies the Water section’s Bacteria card does', () => {
    const readout = bacteriaReadout(cycled, DEFAULT_CONFIG);
    const readings = read('biofilter', cycled);
    expect(readout.colonisation).toBeGreaterThan(0);
    expect(value(readings, 'Colonisation').value).toBe(`${Math.round(readout.colonisation)} %`);
    expect(value(readings, 'AOB · ammonia → nitrite').value).toBe(
      `${Math.round(readout.aob.count)} / ${Math.round(readout.aob.ceiling)}`
    );
    expect(value(readings, 'NOB · nitrite → nitrate').value).toBe(
      `${Math.round(readout.nob.count)} / ${Math.round(readout.nob.ceiling)}`
    );
  });

  it('names the threshold while uncycled and stops naming it once cycled', () => {
    expect(value(read('biofilter'), 'Colonisation').note).toBe('cycled at 25 %');
    expect(value(read('biofilter', cycled), 'Colonisation').note).toBe('cycled');
  });

  it('has nothing to configure, and says so', () => {
    expect(deviceHint('biofilter', base, DEFAULT_CONFIG)?.text).toMatch(/nothing to set here/);
  });
});

describe('deviceHint', () => {
  it('adds one sentence to the devices whose figures do not speak for themselves', () => {
    const ids = ['light', 'airPump', 'ato', 'co2Generator', 'powerhead', 'autoDoser'] as const;
    for (const id of ids) {
      expect(deviceHint(id, base, DEFAULT_CONFIG)).toEqual({
        text: expect.stringMatching(/\.$/),
        tone: 'muted',
      });
    }
    // The heater reads itself out; the filter speaks only when it is undersized
    // or off, both covered above.
    expect(deviceHint('heater', base, DEFAULT_CONFIG)).toBeNull();
    expect(deviceHint('filter', base, DEFAULT_CONFIG)).toBeNull();
  });

  it('quotes the engine’s own rate for the devices that have one', () => {
    expect(deviceHint('co2Generator', base, DEFAULT_CONFIG)?.text).toBe('+5.0 mg/L/hr while injecting.');
    expect(deviceHint('autoDoser', base, DEFAULT_CONFIG)?.text).toBe(
      'Each dose adds +2.5 NO₃ · +0.25 PO₄ · +2.0 K · +0.05 Fe ppm.'
    );
  });
});

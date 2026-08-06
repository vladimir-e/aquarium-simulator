import { describe, it, expect } from 'vitest';
import {
  computeFishVitality,
  createSimulation,
  FILTER_SPECS,
  FILTER_TYPES,
  FISH_SPECIES_DATA,
  getAirPumpFlow,
  isAirPumpUndersized,
  tick,
  type SimulationState,
} from '../../simulation/index.js';
import { applyAction } from '../../simulation/actions/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { bacteriaReadout, colonyCount } from '../run/index.js';
import { cycledTank, run as runUnfed } from '../../simulation/tests/tanks.js';
import { getPresetById } from '../../simulation/presets.js';
import type { UnitSystem } from '../utils/units.js';
import type { EquipmentId } from './devices';
import { deviceHint, deviceReadings, type DeviceHint, type DeviceReading } from './readings';

const base: SimulationState = createSimulation({ tankCapacity: 40 });

const UNITS = ['metric', 'imperial'] as const;

function read(
  id: EquipmentId,
  state: SimulationState = base,
  units: UnitSystem = 'metric'
): DeviceReading[] {
  return deviceReadings(id, { state, config: DEFAULT_CONFIG, units });
}

function hint(
  id: EquipmentId,
  state: SimulationState = base,
  units: UnitSystem = 'metric'
): DeviceHint | null {
  return deviceHint(id, state, DEFAULT_CONFIG, units);
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
  /**
   * Capacities either side of where each class's flow cap starts to bite,
   * including the slivers where the shortfall is under a rendered unit — the
   * band a gate on formatted strings decided differently for each reader.
   */
  const SIZING_SWEEP = [
    40, 75, 75.13, 76, 100, 208, 208.2, 208.4, 209, 300, 400, 562, 562.55, 563, 568, 600, 1000,
  ];

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
    expect(hint('filter', off)).toEqual({
      text: 'No biological filtration while the filter is off.',
      tone: 'muted',
    });
  });

  it('warns when the filter is rated below the tank it is in, and by how much', () => {
    const big = createSimulation({ tankCapacity: 400 });
    expect(hint('filter', big)).toEqual({
      text: 'Undersized for this tank — 300 L/h against the 1600 L/h a 4 × turnover here would take.',
      tone: 'warn',
    });
    expect(hint('filter', big, 'imperial')?.text).toContain('79 GPH against the 423 GPH');
    expect(hint('filter', base)).toBeNull();
  });

  it('states the sizing gap in flow, so a tank low on water is not read as over-filtered', () => {
    const boundary = createSimulation({ tankCapacity: 76 });
    const low: SimulationState = {
      ...boundary,
      resources: { ...boundary.resources, water: 60 },
    };

    expect(hint('filter', boundary)).toEqual({
      text: 'Undersized for this tank — 300 L/h against the 304 L/h a 4 × turnover here would take.',
      tone: 'warn',
    });
    expect(hint('filter', low)).toEqual(hint('filter', boundary));
  });

  it('warns about the roster before the rating when a filter is over both', () => {
    const overRated = createSimulation({
      tankCapacity: 209,
      filter: { enabled: true, type: 'hob' },
    });
    const stocked = applyAction(overRated, { type: 'addFish', species: 'betta' }).state;

    expect(hint('filter', overRated)?.text).toContain('Undersized');
    expect(hint('filter', stocked)).toEqual({
      text: 'Too much current for Betta — 6.0 × tank volume/h against its 5 ×.',
      tone: 'warn',
    });
  });

  it('says nothing about sizing while the filter still delivers its class’s turnover', () => {
    const atRating = createSimulation({ tankCapacity: 75 });
    const pastRating = createSimulation({
      tankCapacity: 208.2,
      filter: { enabled: true, type: 'hob' },
    });

    expect(hint('filter', atRating)).toBeNull();
    expect(hint('filter', pastRating)).toBeNull();
  });

  it('warns exactly where a class’s cap bites, never on a gap its figures agree on', () => {
    for (const units of UNITS) {
      for (const type of FILTER_TYPES) {
        const spec = FILTER_SPECS[type];
        const warned: number[] = [];

        for (const tankCapacity of SIZING_SWEEP) {
          const state = createSimulation({ tankCapacity, filter: { enabled: true, type } });
          const warning = hint('filter', state, units);
          if (warning === null) continue;

          const [, delivers, wants] =
            /— (\d+ (?:L\/h|GPH)) against the (\d+ (?:L\/h|GPH))/.exec(warning.text) ?? [];
          expect(delivers).toBeDefined();
          expect(parseInt(delivers!)).toBeLessThan(parseInt(wants!));
          expect(value(read('filter', state, units), 'Flow').value).toBe(delivers);
          warned.push(tankCapacity);
        }

        const bites = SIZING_SWEEP.filter((c) => c > spec.maxFlowLph / spec.targetTurnover);
        expect(warned).toEqual(bites);
      }
    }
  });

  it('never calls a filter with no cap undersized, however big the tank', () => {
    for (const units of UNITS) {
      for (const tankCapacity of [...SIZING_SWEEP, 5000, 50000]) {
        const sump = createSimulation({ tankCapacity, filter: { enabled: true, type: 'sump' } });
        expect(hint('filter', sump, units)).toBeNull();
      }
    }
  });

  it('never renders away the excess it is warning about', () => {
    const water = 40;
    const { maxTurnover } = FISH_SPECIES_DATA.betta;
    const tank = createSimulation({ tankCapacity: water, filter: { enabled: true, type: 'canister' } });
    const stocked = applyAction(tank, { type: 'addFish', species: 'betta' }).state;
    const at = (rate: number): SimulationState => ({
      ...stocked,
      resources: { ...stocked.resources, flow: rate * water, water },
    });

    expect(hint('filter', at(maxTurnover))).toBeNull();

    for (const over of [0.001, 0.01, 0.05, 0.2, 1, 3]) {
      const warning = hint('filter', at(maxTurnover + over));
      expect(warning).not.toBeNull();

      const shown = Number(/— ([\d.]+) ×/.exec(warning?.text ?? '')?.[1]);
      expect(shown).toBeGreaterThan(maxTurnover);
    }
  });

  it('speaks up on exactly the currents the engine charges the fish for', () => {
    const water = 40;
    const { maxTurnover } = FISH_SPECIES_DATA.neon_tetra;
    const tank = createSimulation({
      tankCapacity: water,
      filter: { enabled: true, type: 'canister' },
    });
    const stocked = applyAction(tank, { type: 'addFish', species: 'neon_tetra' }).state;
    const rates = [-2, -0.05, 0, 0.05, 2, 30].map((over) => maxTurnover + over);

    for (const rate of rates) {
      const state: SimulationState = {
        ...stocked,
        resources: { ...stocked.resources, flow: rate * water, water },
      };
      const fish = state.fish[0];
      if (fish === undefined) throw new Error('the tetra did not stock');

      const { breakdown } = computeFishVitality(
        fish,
        state.resources,
        state.plants,
        water,
        state.tank.capacity,
        DEFAULT_CONFIG.livestock
      );
      const charged = breakdown.stressors.find((s) => s.key === 'flow')?.amount ?? 0;
      const warning = hint('filter', state);
      const shown = Number(/— ([\d.]+) ×/.exec(warning?.text ?? '')?.[1]);

      expect(warning?.text.startsWith('Too much current') ?? false).toBe(charged > 0);
      if (charged > 0) expect(shown).toBeGreaterThanOrEqual(rate);
    }
  });

  it('leaves a tank sitting exactly on a tolerance alone, however the division rounds', () => {
    const { maxTurnover } = FISH_SPECIES_DATA.guppy;
    const tank = createSimulation({ tankCapacity: 300, filter: { enabled: true, type: 'sump' } });
    const stocked = applyAction(tank, { type: 'addFish', species: 'guppy' }).state;

    // Water volumes where `flow / water` lands a hair over the tolerance
    // rather than on it — an ordinary artefact of evaporating in litres.
    for (const water of [200.4, 200.9, 201.4]) {
      const flow = maxTurnover * water;
      expect(flow / water).not.toBe(maxTurnover);

      expect(
        hint('filter', { ...stocked, resources: { ...stocked.resources, flow, water } })
      ).toBeNull();
    }
  });

  it('reads the current against the water left, not the tank it was filled to', () => {
    const brisk = createSimulation({ tankCapacity: 40, filter: { enabled: true, type: 'canister' } });
    const stocked = applyAction(brisk, { type: 'addFish', species: 'neon_tetra' }).state;
    const evaporated: SimulationState = {
      ...stocked,
      resources: { ...stocked.resources, water: 30 },
    };

    expect(hint('filter', stocked)).toBeNull();
    expect(hint('filter', evaporated)).toEqual({
      text: 'Too much current for Neon Tetra — 10.7 × tank volume/h against its 10 ×.',
      tone: 'warn',
    });
  });

  it('takes the current warning when it is the only thing moving the water', () => {
    const brisk = createSimulation({ tankCapacity: 40, filter: { enabled: true, type: 'canister' } });
    const stocked = applyAction(brisk, { type: 'addFish', species: 'betta' }).state;

    expect(hint('filter', stocked)).toEqual({
      text: 'Too much current for Betta — 8.0 × tank volume/h against its 5 ×.',
      tone: 'warn',
    });
  });

  it('leaves the current warning to the powerhead once one is running', () => {
    const brisk = createSimulation({
      tankCapacity: 40,
      filter: { enabled: true, type: 'canister' },
      powerhead: { enabled: true, flowRateGPH: 240 },
    });
    const stocked = applyAction(brisk, { type: 'addFish', species: 'betta' }).state;

    expect(hint('filter', stocked)).toBeNull();
    expect(hint('powerhead', stocked)?.tone).toBe('warn');
  });
});

describe('light readings', () => {
  it('reports the fixture’s output for the current hour', () => {
    let lit = base;
    for (let i = 0; i < 9; i++) lit = tick(lit, DEFAULT_CONFIG);
    expect(value(read('light', lit), 'Output now')).toEqual({
      label: 'Output now',
      value: '50 PAR',
      note: 'lit until 18:00',
    });
    expect(value(read('light'), 'Output now')).toEqual({
      label: 'Output now',
      value: '0 PAR',
      note: 'next on at 08:00',
    });
  });

  it('reports what survives the water column, and how deep it had to go', () => {
    let lit = base;
    for (let i = 0; i < 9; i++) lit = tick(lit, DEFAULT_CONFIG);
    const surface = Number(value(read('light', lit), 'Output now').value.split(' ')[0]);
    const substrate = value(read('light', lit), 'At substrate');
    expect(Number(substrate.value.split(' ')[0])).toBeLessThan(surface);
    expect(substrate.note).toBe('through 27 cm of water');
  });

  it('lands the same fixture harder on a shallow tank than a deep one', () => {
    const atHour = (capacity: number): number => {
      let state = createSimulation({ tankCapacity: capacity });
      for (let i = 0; i < 9; i++) state = tick(state, DEFAULT_CONFIG);
      return Number(value(read('light', state), 'At substrate').value.split(' ')[0]);
    };

    expect(atHour(20)).toBeGreaterThan(atHour(300));
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

  it('warns once the tank outgrows what one air stone can aerate', () => {
    // AIR_PUMP_SPEC.maxCapacityLiters is 400 L, so 401 L is past the engine's own line.
    const over = (capacity: number): SimulationState => ({
      ...enabled('airPump'),
      tank: { ...base.tank, capacity },
    });

    expect(isAirPumpUndersized(401)).toBe(true);
    expect(hint('airPump', over(401))).toEqual({
      text: 'Past what one air stone can aerate — this tank needs more.',
      tone: 'warn',
    });

    // A tank inside the pump's range says nothing extra…
    expect(isAirPumpUndersized(400)).toBe(false);
    expect(hint('airPump', over(400))?.tone).toBe('muted');
    // …and neither does an oversized tank whose pump is switched off.
    const off: SimulationState = { ...base, tank: { ...base.tank, capacity: 401 } };
    expect(hint('airPump', off)?.tone).toBe('muted');
  });

  it('answers for the current it adds rather than leaving the filter to', () => {
    // The shipped Betta Cube, evaporated to 17 L of its 20. Its sponge alone
    // is 4.7 × — inside a betta's 5 — and the pump's uplift carries it to 5.1.
    const cube = getPresetById('betta')!;
    const evaporate = (tank: SimulationState): SimulationState => {
      const { state } = applyAction(tank, { type: 'addFish', species: 'betta' });
      return { ...state, resources: { ...state.resources, water: 17 } };
    };

    const pumped = evaporate(createSimulation({ ...cube.config, airPump: { enabled: true } }));
    expect(hint('airPump', pumped)).toEqual({
      text: 'Too much current for Betta — 5.1 × tank volume/h against its 5 ×.',
      tone: 'warn',
    });
    expect(hint('filter', pumped)).toBeNull();

    // The same cube as it ships is under tolerance, and nothing warns.
    const sponge = evaporate(createSimulation(cube.config));
    expect(pumped.resources.flow - sponge.resources.flow).toBe(getAirPumpFlow(20));
    expect(hint('filter', sponge)).toBeNull();
    expect(hint('airPump', sponge)?.tone).toBe('muted');
  });

  it('leaves the current warning to the powerhead, the way the filter does', () => {
    const stacked = applyAction(
      createSimulation({
        tankCapacity: 40,
        filter: { enabled: true, type: 'canister' },
        powerhead: { enabled: true, flowRateGPH: 240 },
        airPump: { enabled: true },
      }),
      { type: 'addFish', species: 'betta' }
    ).state;

    expect(hint('powerhead', stacked)?.tone).toBe('warn');
    expect(hint('airPump', stacked)?.tone).toBe('muted');
    expect(hint('filter', stacked)).toBeNull();
  });

  it('says the fish are straining before it says one stone is not enough', () => {
    const both = applyAction(
      createSimulation({
        tankCapacity: 500,
        filter: { enabled: true, type: 'sump' },
        airPump: { enabled: true },
      }),
      { type: 'addFish', species: 'betta' }
    ).state;

    expect(isAirPumpUndersized(both.tank.capacity)).toBe(true);
    expect(hint('airPump', both)).toEqual({
      text: 'Too much current for Betta — 10.1 × tank volume/h against its 5 ×.',
      tone: 'warn',
    });
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

  it('declines to divide by a tank with no water in it', () => {
    const drained: SimulationState = { ...running, resources: { ...running.resources, water: 0 } };
    expect(value(read('powerhead', drained), 'Tank circulation').note).toBe('—');
  });

  it('says nothing beyond what it is for while the roster can take the current', () => {
    const gentle = applyAction(createSimulation({ tankCapacity: 300 }), {
      type: 'addFish',
      species: 'neon_tetra',
    }).state;
    expect(hint('powerhead', gentle)).toEqual({
      text: 'Extra circulation and gas exchange on top of the filter.',
      tone: 'muted',
    });
    expect(hint('powerhead', running)?.tone).toBe('muted');
  });

  it('quotes the panel’s own reading back, at every level the water can sit at', () => {
    const brisk = createSimulation({
      tankCapacity: 40,
      filter: { enabled: true, type: 'canister' },
      powerhead: { enabled: true, flowRateGPH: 240 },
    });
    const stocked = applyAction(brisk, { type: 'addFish', species: 'neon_tetra' }).state;
    let warned = 0;

    for (let tenths = 250; tenths <= 400; tenths++) {
      const water = tenths / 10;
      const state: SimulationState = { ...stocked, resources: { ...stocked.resources, water } };
      const warning = hint('powerhead', state);
      if (warning?.tone !== 'warn') continue;

      const quoted = /— (.+ × tank volume\/h)/.exec(warning.text)?.[1];
      expect(read('powerhead', state).map((r) => r.note)).toContain(quoted);
      warned++;
    }

    expect(warned).toBe(151);
  });

  it('warns once a fish in the tank cannot take the current, naming the tightest', () => {
    const stocked = ['guppy' as const, 'neon_tetra' as const].reduce(
      (state, species) => applyAction(state, { type: 'addFish', species }).state,
      running
    );
    expect(hint('powerhead', stocked)).toEqual({
      text: 'Too much current for Neon Tetra — 41.9 × tank volume/h against its 10 ×.',
      tone: 'warn',
    });
  });

  it('does not take the blame for a current it is switched off for', () => {
    const filterOnly = createSimulation({
      tankCapacity: 40,
      filter: { enabled: true, type: 'canister' },
    });
    const stocked = applyAction(filterOnly, { type: 'addFish', species: 'betta' }).state;

    expect(hint('powerhead', stocked)?.tone).toBe('muted');
    expect(hint('filter', stocked)?.tone).toBe('warn');
  });
});

describe('biofilter readings', () => {
  const cycled: SimulationState = cycledTank(40);

  it('reads the same colonies the Water section’s Bacteria card does', () => {
    // Both surfaces render through `colonyCount`, so the pane and the card
    // never disagree on a population spanning six orders of magnitude.
    const readout = bacteriaReadout(cycled, DEFAULT_CONFIG);
    const readings = read('biofilter', cycled);
    expect(readout.aob.count).toBeGreaterThan(0);
    expect(value(readings, 'AOB · ammonia → nitrite').value).toBe(
      `${colonyCount(readout.aob.count)} / ${colonyCount(readout.aob.ceiling)}`
    );
    expect(value(readings, 'NOB · nitrite → nitrate').value).toBe(
      `${colonyCount(readout.nob.count)} / ${colonyCount(readout.nob.ceiling)}`
    );
  });

  it('leads with the cycle and backs it with the reading behind it', () => {
    expect(value(read('biofilter'), 'Cycle')).toEqual({
      label: 'Cycle',
      value: 'uncycled',
      note: 'nothing colonised yet',
    });
    expect(value(read('biofilter', cycled), 'Cycle')).toEqual({
      label: 'Cycle',
      value: 'cycled',
      note: 'NH₃ and NO₂ at trace, both stages keeping up',
    });
  });

  it('never says a gauge is reading when both of them are at zero', () => {
    // A tank starved until its colony faded reads uncycled on two gauges at
    // zero — the note has to be about the colony, not about a toxin.
    const starved = runUnfed(cycledTank(150), 150 * 24);
    const readout = bacteriaReadout(starved, DEFAULT_CONFIG);

    expect(readout.cycled).toBe(false);
    expect(readout.atTrace).toBe(true);
    expect(value(read('biofilter', starved), 'Cycle')).toEqual({
      label: 'Cycle',
      value: 'uncycled',
      note: 'colonies too small to hold a feeding',
    });
  });

  /**
   * Share of ceiling is the one figure the re-pinned gauge does not let the
   * headline carry: a cycled tank sits at a couple of percent by design, so it
   * reads as the room the colony has left and never as its health.
   */
  it('keeps share of ceiling as the colonies’ own secondary figure', () => {
    const readings = read('biofilter', cycled);
    const readout = bacteriaReadout(cycled, DEFAULT_CONFIG);

    expect(readout.aob.pct).toBeLessThan(10);
    expect(value(readings, 'AOB · ammonia → nitrite').note).toBe(
      `${Math.round(readout.aob.pct)} % of ceiling`
    );
    expect(value(readings, 'NOB · nitrite → nitrate').note).toBe(
      `${Math.round(readout.nob.pct)} % of ceiling`
    );
  });

  it('has nothing to configure, and says so', () => {
    expect(hint('biofilter', base)?.text).toMatch(/nothing to set here/);
  });
});

describe('deviceHint', () => {
  it('adds one sentence to the devices whose figures do not speak for themselves', () => {
    const ids = ['light', 'airPump', 'ato', 'co2Generator', 'powerhead', 'autoDoser'] as const;
    for (const id of ids) {
      expect(hint(id, base)).toEqual({
        text: expect.stringMatching(/\.$/),
        tone: 'muted',
      });
    }
    // The heater reads itself out; the filter speaks only when it is undersized
    // or off, both covered above.
    expect(hint('heater', base)).toBeNull();
    expect(hint('filter', base)).toBeNull();
  });

  it('quotes the engine’s own rate for the devices that have one', () => {
    expect(hint('co2Generator', base)?.text).toBe('+5.0 mg/L/hr while injecting.');
    expect(hint('autoDoser', base)?.text).toBe(
      'Each dose adds +2.5 NO₃ · +0.25 PO₄ · +2.0 K · +0.05 Fe ppm.'
    );
  });
});

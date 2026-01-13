import { describe, it, expect } from 'vitest';
import {
  createSimulation,
  calculateTankBacteriaSurface,
  DEFAULT_HEATER,
  DEFAULT_FILTER,
  DEFAULT_POWERHEAD,
  DEFAULT_SUBSTRATE,
  FILTER_SURFACE,
} from './state.js';

describe('createSimulation', () => {
  it('creates simulation with specified tank capacity', () => {
    const state = createSimulation({ tankCapacity: 100 });

    expect(state.tank.capacity).toBe(100);
  });

  it('sets water level to tank capacity', () => {
    const state = createSimulation({ tankCapacity: 100 });

    expect(state.tank.waterLevel).toBe(100);
  });

  it('defaults temperature to 25°C', () => {
    const state = createSimulation({ tankCapacity: 100 });

    expect(state.resources.temperature).toBe(25);
  });

  it('allows custom initial temperature', () => {
    const state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 28,
    });

    expect(state.resources.temperature).toBe(28);
  });

  it('starts at tick 0', () => {
    const state = createSimulation({ tankCapacity: 100 });

    expect(state.tick).toBe(0);
  });

  it('creates simulation with custom temperature', () => {
    const state = createSimulation({
      tankCapacity: 200,
      initialTemperature: 22,
    });

    expect(state.tick).toBe(0);
    expect(state.tank.capacity).toBe(200);
    expect(state.tank.waterLevel).toBe(200);
    expect(state.resources.temperature).toBe(22);
  });

  describe('environment', () => {
    it('defaults room temperature to 22°C', () => {
      const state = createSimulation({ tankCapacity: 100 });

      expect(state.environment.roomTemperature).toBe(22);
    });

    it('allows custom room temperature', () => {
      const state = createSimulation({
        tankCapacity: 100,
        roomTemperature: 20,
      });

      expect(state.environment.roomTemperature).toBe(20);
    });
  });

  describe('equipment', () => {
    it('creates heater with default values when not specified', () => {
      const state = createSimulation({ tankCapacity: 100 });

      expect(state.equipment.heater).toEqual(DEFAULT_HEATER);
    });

    it('allows custom heater configuration', () => {
      const state = createSimulation({
        tankCapacity: 100,
        heater: {
          enabled: true,
          targetTemperature: 28,
          wattage: 200,
        },
      });

      expect(state.equipment.heater.enabled).toBe(true);
      expect(state.equipment.heater.targetTemperature).toBe(28);
      expect(state.equipment.heater.wattage).toBe(200);
      expect(state.equipment.heater.isOn).toBe(false); // Default
    });

    it('merges partial heater config with defaults', () => {
      const state = createSimulation({
        tankCapacity: 100,
        heater: { enabled: true },
      });

      expect(state.equipment.heater.enabled).toBe(true);
      expect(state.equipment.heater.isOn).toBe(DEFAULT_HEATER.isOn);
      expect(state.equipment.heater.targetTemperature).toBe(
        DEFAULT_HEATER.targetTemperature
      );
      expect(state.equipment.heater.wattage).toBe(DEFAULT_HEATER.wattage);
    });
  });

  describe('logs', () => {
    it('initializes with logs array', () => {
      const state = createSimulation({ tankCapacity: 100 });

      expect(Array.isArray(state.logs)).toBe(true);
    });

    it('emits "Simulation created" log on initialization', () => {
      const state = createSimulation({ tankCapacity: 100 });

      expect(state.logs.length).toBe(1);
      expect(state.logs[0].source).toBe('simulation');
      expect(state.logs[0].severity).toBe('info');
      expect(state.logs[0].message).toContain('Simulation created');
    });

    it('includes tank capacity in creation log', () => {
      const state = createSimulation({ tankCapacity: 150 });

      expect(state.logs[0].message).toContain('150L tank');
    });

    it('includes room temperature in creation log', () => {
      const state = createSimulation({
        tankCapacity: 100,
        roomTemperature: 24,
      });

      expect(state.logs[0].message).toContain('24°C room');
    });

    it('includes heater status in creation log (enabled)', () => {
      const state = createSimulation({
        tankCapacity: 100,
        heater: { enabled: true },
      });

      expect(state.logs[0].message).toContain('heater enabled');
    });

    it('includes heater status in creation log (disabled)', () => {
      const state = createSimulation({
        tankCapacity: 100,
        heater: { enabled: false },
      });

      expect(state.logs[0].message).toContain('heater disabled');
    });

    it('creation log has tick 0', () => {
      const state = createSimulation({ tankCapacity: 100 });

      expect(state.logs[0].tick).toBe(0);
    });
  });
});

describe('DEFAULT_HEATER', () => {
  it('has expected default values', () => {
    expect(DEFAULT_HEATER).toEqual({
      enabled: true,
      isOn: false,
      targetTemperature: 25,
      wattage: 100,
    });
  });
});

describe('DEFAULT_FILTER', () => {
  it('has expected default values', () => {
    expect(DEFAULT_FILTER).toEqual({
      enabled: true,
      type: 'sponge',
    });
  });
});

describe('DEFAULT_POWERHEAD', () => {
  it('has expected default values', () => {
    expect(DEFAULT_POWERHEAD).toEqual({
      enabled: false,
      flowRateGPH: 400,
    });
  });
});

describe('DEFAULT_SUBSTRATE', () => {
  it('has expected default values', () => {
    expect(DEFAULT_SUBSTRATE).toEqual({
      type: 'none',
    });
  });
});

describe('calculateTankBacteriaSurface', () => {
  it('calculates surface area for tank', () => {
    // For a 100L tank
    const surface = calculateTankBacteriaSurface(100);

    // Should return a positive number
    expect(surface).toBeGreaterThan(0);
  });

  it('larger tanks have more surface area', () => {
    const surface100 = calculateTankBacteriaSurface(100);
    const surface200 = calculateTankBacteriaSurface(200);

    expect(surface200).toBeGreaterThan(surface100);
  });

  it('returns rounded integer', () => {
    const surface = calculateTankBacteriaSurface(75);

    expect(Number.isInteger(surface)).toBe(true);
  });
});

describe('createSimulation - tank bacteria surface', () => {
  it('initializes tank with bacteria surface calculated from capacity', () => {
    const state = createSimulation({ tankCapacity: 100 });

    expect(state.tank.bacteriaSurface).toBe(calculateTankBacteriaSurface(100));
  });

  it('bacteria surface varies with tank capacity', () => {
    const state100 = createSimulation({ tankCapacity: 100 });
    const state200 = createSimulation({ tankCapacity: 200 });

    expect(state200.tank.bacteriaSurface).toBeGreaterThan(
      state100.tank.bacteriaSurface
    );
  });
});

describe('createSimulation - filter', () => {
  it('initializes filter enabled with default type sponge', () => {
    const state = createSimulation({ tankCapacity: 100 });

    expect(state.equipment.filter).toEqual(DEFAULT_FILTER);
    expect(state.equipment.filter.enabled).toBe(true);
    expect(state.equipment.filter.type).toBe('sponge');
  });

  it('allows custom filter configuration', () => {
    const state = createSimulation({
      tankCapacity: 100,
      filter: { enabled: true, type: 'canister' },
    });

    expect(state.equipment.filter.enabled).toBe(true);
    expect(state.equipment.filter.type).toBe('canister');
  });

  it('merges partial filter config with defaults', () => {
    const state = createSimulation({
      tankCapacity: 100,
      filter: { type: 'hob' },
    });

    expect(state.equipment.filter.enabled).toBe(DEFAULT_FILTER.enabled);
    expect(state.equipment.filter.type).toBe('hob');
  });
});

describe('createSimulation - powerhead', () => {
  it('initializes powerhead disabled with default flow rate 400 GPH', () => {
    const state = createSimulation({ tankCapacity: 100 });

    expect(state.equipment.powerhead).toEqual(DEFAULT_POWERHEAD);
    expect(state.equipment.powerhead.enabled).toBe(false);
    expect(state.equipment.powerhead.flowRateGPH).toBe(400);
  });

  it('allows custom powerhead configuration', () => {
    const state = createSimulation({
      tankCapacity: 100,
      powerhead: { enabled: true, flowRateGPH: 850 },
    });

    expect(state.equipment.powerhead.enabled).toBe(true);
    expect(state.equipment.powerhead.flowRateGPH).toBe(850);
  });

  it('merges partial powerhead config with defaults', () => {
    const state = createSimulation({
      tankCapacity: 100,
      powerhead: { enabled: true },
    });

    expect(state.equipment.powerhead.enabled).toBe(true);
    expect(state.equipment.powerhead.flowRateGPH).toBe(DEFAULT_POWERHEAD.flowRateGPH);
  });
});

describe('createSimulation - substrate', () => {
  it('initializes substrate with default type none', () => {
    const state = createSimulation({ tankCapacity: 100 });

    expect(state.equipment.substrate).toEqual(DEFAULT_SUBSTRATE);
    expect(state.equipment.substrate.type).toBe('none');
  });

  it('allows custom substrate configuration', () => {
    const state = createSimulation({
      tankCapacity: 100,
      substrate: { type: 'aqua_soil' },
    });

    expect(state.equipment.substrate.type).toBe('aqua_soil');
  });
});

describe('createSimulation - passive resources', () => {
  it('initializes passive resources', () => {
    const state = createSimulation({ tankCapacity: 100 });

    expect(state.passiveResources).toBeDefined();
    expect(state.passiveResources.surface).toBeGreaterThan(0);
    expect(typeof state.passiveResources.flow).toBe('number');
  });

  it('initial passive resources include tank and filter surface', () => {
    const state = createSimulation({
      tankCapacity: 100,
      filter: { enabled: true, type: 'sponge' },
      substrate: { type: 'none' },
    });

    const expectedSurface =
      calculateTankBacteriaSurface(100) + FILTER_SURFACE.sponge;

    expect(state.passiveResources.surface).toBe(expectedSurface);
  });

  it('initial passive resources include filter flow', () => {
    const state = createSimulation({
      tankCapacity: 100,
      filter: { enabled: true, type: 'sponge' },
      powerhead: { enabled: false },
    });

    expect(state.passiveResources.flow).toBe(100); // Sponge filter flow
  });

  it('disabled filter contributes 0 flow', () => {
    const state = createSimulation({
      tankCapacity: 100,
      filter: { enabled: false },
      powerhead: { enabled: false },
    });

    expect(state.passiveResources.flow).toBe(0);
  });

  it('includes substrate surface in calculation', () => {
    const stateNone = createSimulation({
      tankCapacity: 100,
      filter: { enabled: false },
      substrate: { type: 'none' },
    });

    const stateGravel = createSimulation({
      tankCapacity: 100,
      filter: { enabled: false },
      substrate: { type: 'gravel' },
    });

    // Gravel adds 800 cm²/L * 100L = 80,000 cm²
    expect(stateGravel.passiveResources.surface).toBe(
      stateNone.passiveResources.surface + 80000
    );
  });
});

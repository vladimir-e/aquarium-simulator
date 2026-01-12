import { describe, it, expect } from 'vitest';
import { createSimulation, DEFAULT_HEATER } from './state.js';

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
});

describe('DEFAULT_HEATER', () => {
  it('has expected default values', () => {
    expect(DEFAULT_HEATER).toEqual({
      enabled: false,
      isOn: false,
      targetTemperature: 25,
      wattage: 100,
    });
  });
});

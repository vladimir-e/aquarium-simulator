import { describe, it, expect } from 'vitest';
import {
  calculateHeatingRate,
  heaterUpdate,
  applyHeaterStateChange,
} from './heater.js';
import { createSimulation } from '../state.js';
import { temperatureDefaults } from '../config/temperature.js';

describe('calculateHeatingRate', () => {
  it('follows expected formula at reference volume', () => {
    const wattage = 100;
    const rate = calculateHeatingRate(wattage, temperatureDefaults.referenceVolume);

    const expected = wattage / temperatureDefaults.referenceVolume;
    expect(rate).toBeCloseTo(expected, 6);
  });

  it('volume scaling follows expected formula', () => {
    const wattage = 100;
    const volume = 50;
    const rate = calculateHeatingRate(wattage, volume);

    const volumeScale = Math.pow(temperatureDefaults.referenceVolume / volume, temperatureDefaults.volumeExponent);
    const expected = (wattage / volume) * volumeScale;
    expect(rate).toBeCloseTo(expected, 6);
  });

  describe('edge cases', () => {
    it('returns 0 for zero volume', () => {
      const rate = calculateHeatingRate(100, 0);

      expect(rate).toBe(0);
    });

    it('returns 0 for zero wattage', () => {
      const rate = calculateHeatingRate(0, 100);

      expect(rate).toBe(0);
    });
  });
});

describe('heaterUpdate', () => {
  it('heats water when below target and enabled', () => {
    const state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 22,
      roomTemperature: 20,
      heater: { enabled: true, targetTemperature: 25, wattage: 100 },
    });

    const { effects, isOn } = heaterUpdate(state);

    expect(isOn).toBe(true);
    expect(effects).toHaveLength(1);
    expect(effects[0].tier).toBe('immediate');
    expect(effects[0].resource).toBe('temperature');
    expect(effects[0].delta).toBeGreaterThan(0);
    expect(effects[0].source).toBe('heater');
  });

  it('stops heating at target temperature', () => {
    const state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 25,
      roomTemperature: 20,
      heater: { enabled: true, targetTemperature: 25, wattage: 100 },
    });

    const { effects, isOn } = heaterUpdate(state);

    expect(isOn).toBe(false);
    expect(effects).toHaveLength(0);
  });

  it('does nothing when disabled', () => {
    const state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 20,
      roomTemperature: 20,
      heater: { enabled: false, targetTemperature: 25, wattage: 100 },
    });

    const { effects, isOn } = heaterUpdate(state);

    expect(isOn).toBe(false);
    expect(effects).toHaveLength(0);
  });

  it('does not overshoot target temperature', () => {
    const state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 24.9,
      roomTemperature: 20,
      heater: { enabled: true, targetTemperature: 25, wattage: 1000 },
    });

    const { effects } = heaterUpdate(state);

    expect(effects[0].delta).toBeCloseTo(0.1, 4);
  });

  describe('edge cases', () => {
    it('handles zero water level gracefully', () => {
      const state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 22,
        roomTemperature: 20,
        heater: { enabled: true, targetTemperature: 25, wattage: 100 },
      });
      const emptyState = {
        ...state,
        resources: { ...state.resources, water: 0 },
      };

      const { effects, isOn } = heaterUpdate(emptyState);

      expect(isOn).toBe(true);
      expect(effects).toHaveLength(1);
      expect(effects[0].delta).toBe(0);
    });

    it('handles very large wattage without numerical overflow', () => {
      const state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 22,
        roomTemperature: 20,
        heater: { enabled: true, targetTemperature: 30, wattage: 100000 },
      });

      const { effects, isOn } = heaterUpdate(state);

      expect(isOn).toBe(true);
      expect(effects).toHaveLength(1);
      expect(effects[0].delta).toBe(8);
      expect(Number.isFinite(effects[0].delta)).toBe(true);
    });
  });
});

describe('applyHeaterStateChange', () => {
  it('updates isOn state when different', () => {
    const state = createSimulation({
      tankCapacity: 100,
      heater: { enabled: true, isOn: false, targetTemperature: 25, wattage: 100 },
    });

    const newState = applyHeaterStateChange(state, true);

    expect(newState.equipment.heater.isOn).toBe(true);
    expect(newState).not.toBe(state);
  });

  it('returns same state when isOn unchanged', () => {
    const state = createSimulation({
      tankCapacity: 100,
      heater: { enabled: true, isOn: true, targetTemperature: 25, wattage: 100 },
    });

    const newState = applyHeaterStateChange(state, true);

    expect(newState).toBe(state);
  });

  it('does not mutate original state', () => {
    const state = createSimulation({
      tankCapacity: 100,
      heater: { enabled: true, isOn: false, targetTemperature: 25, wattage: 100 },
    });

    applyHeaterStateChange(state, true);

    expect(state.equipment.heater.isOn).toBe(false);
  });
});

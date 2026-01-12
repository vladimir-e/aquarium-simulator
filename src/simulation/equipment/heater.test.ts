import { describe, it, expect } from 'vitest';
import {
  calculateHeatingRate,
  heaterUpdate,
  applyHeaterStateChange,
} from './heater.js';
import { createSimulation } from '../state.js';
import { REFERENCE_VOLUME, VOLUME_EXPONENT } from '../systems/temperature-drift.js';

describe('calculateHeatingRate', () => {
  it('calculates heating rate based on wattage and volume', () => {
    const rate = calculateHeatingRate(100, 100);

    expect(rate).toBeGreaterThan(0);
  });

  it('heating rate increases with wattage', () => {
    const lowWattage = calculateHeatingRate(50, 100);
    const highWattage = calculateHeatingRate(200, 100);

    expect(highWattage).toBeGreaterThan(lowWattage);
  });

  it('heating rate scales inversely with volume', () => {
    const smallTank = calculateHeatingRate(100, 50);
    const largeTank = calculateHeatingRate(100, 200);

    // Smaller tanks heat faster
    expect(smallTank).toBeGreaterThan(largeTank);
  });

  it('follows expected formula at reference volume', () => {
    const wattage = 100;
    const rate = calculateHeatingRate(wattage, REFERENCE_VOLUME);

    // At reference volume, volumeScale = 1
    const expected = wattage / REFERENCE_VOLUME;
    expect(rate).toBeCloseTo(expected, 6);
  });

  it('volume scaling follows expected formula', () => {
    const wattage = 100;
    const volume = 50;
    const rate = calculateHeatingRate(wattage, volume);

    const volumeScale = Math.pow(REFERENCE_VOLUME / volume, VOLUME_EXPONENT);
    const expected = (wattage / volume) * volumeScale;
    expect(rate).toBeCloseTo(expected, 6);
  });

  describe('edge cases', () => {
    it('returns 0 for zero volume', () => {
      const rate = calculateHeatingRate(100, 0);

      expect(rate).toBe(0);
    });

    it('returns 0 for negative volume', () => {
      const rate = calculateHeatingRate(100, -50);

      expect(rate).toBe(0);
    });

    it('returns 0 for zero wattage', () => {
      const rate = calculateHeatingRate(0, 100);

      expect(rate).toBe(0);
    });

    it('returns 0 for negative wattage', () => {
      const rate = calculateHeatingRate(-100, 100);

      expect(rate).toBe(0);
    });

    it('handles very large wattage without numerical issues', () => {
      const rate = calculateHeatingRate(10000, 100);

      expect(rate).toBeGreaterThan(0);
      expect(Number.isFinite(rate)).toBe(true);
    });

    it('handles very small volume without numerical issues', () => {
      const rate = calculateHeatingRate(100, 0.1);

      expect(rate).toBeGreaterThan(0);
      expect(Number.isFinite(rate)).toBe(true);
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

  it('stops heating above target temperature', () => {
    const state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 28,
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

  it('heating rate depends on wattage', () => {
    const state1 = createSimulation({
      tankCapacity: 100,
      initialTemperature: 22,
      roomTemperature: 20,
      heater: { enabled: true, targetTemperature: 30, wattage: 50 },
    });
    const state2 = createSimulation({
      tankCapacity: 100,
      initialTemperature: 22,
      roomTemperature: 20,
      heater: { enabled: true, targetTemperature: 30, wattage: 200 },
    });

    const result1 = heaterUpdate(state1);
    const result2 = heaterUpdate(state2);

    expect(result2.effects[0].delta).toBeGreaterThan(result1.effects[0].delta);
  });

  it('heating rate scales inversely with volume', () => {
    const state1 = createSimulation({
      tankCapacity: 50,
      initialTemperature: 22,
      roomTemperature: 20,
      heater: { enabled: true, targetTemperature: 30, wattage: 100 },
    });
    const state2 = createSimulation({
      tankCapacity: 200,
      initialTemperature: 22,
      roomTemperature: 20,
      heater: { enabled: true, targetTemperature: 30, wattage: 100 },
    });

    const result1 = heaterUpdate(state1);
    const result2 = heaterUpdate(state2);

    // Smaller tank heats faster
    expect(result1.effects[0].delta).toBeGreaterThan(result2.effects[0].delta);
  });

  it('does not overshoot target temperature', () => {
    const state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 24.9, // Just below target
      roomTemperature: 20,
      heater: { enabled: true, targetTemperature: 25, wattage: 1000 }, // Very powerful heater
    });

    const { effects } = heaterUpdate(state);

    // Should only heat by 0.1°C to reach target, not overshoot
    expect(effects[0].delta).toBeCloseTo(0.1, 4);
  });

  describe('edge cases', () => {
    it('does not heat when target is below current temperature', () => {
      const state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 28,
        roomTemperature: 22,
        heater: { enabled: true, targetTemperature: 25, wattage: 100 },
      });

      const { effects, isOn } = heaterUpdate(state);

      expect(isOn).toBe(false);
      expect(effects).toHaveLength(0);
    });

    it('handles zero water level gracefully', () => {
      const state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 22,
        roomTemperature: 20,
        heater: { enabled: true, targetTemperature: 25, wattage: 100 },
      });
      const emptyState = {
        ...state,
        tank: { ...state.tank, waterLevel: 0 },
      };

      const { effects, isOn } = heaterUpdate(emptyState);

      // Should still try to heat but with 0 effect
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
      // Should be clamped to tempGap (8°C), not some huge number
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

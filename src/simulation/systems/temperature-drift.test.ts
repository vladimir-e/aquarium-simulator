import { describe, it, expect } from 'vitest';
import {
  calculateTemperatureDrift,
  temperatureDriftSystem,
  COOLING_COEFFICIENT,
  REFERENCE_VOLUME,
  VOLUME_EXPONENT,
} from './temperature-drift.js';
import { createSimulation } from '../state.js';
import { DEFAULT_CONFIG } from '../config/index.js';

describe('calculateTemperatureDrift', () => {
  it('drifts toward room temp when water is warmer', () => {
    const drift = calculateTemperatureDrift(28, 22, 100);

    expect(drift).toBeLessThan(0);
  });

  it('drifts toward room temp when water is cooler', () => {
    const drift = calculateTemperatureDrift(18, 22, 100);

    expect(drift).toBeGreaterThan(0);
  });

  it('returns zero drift when at room temperature', () => {
    const drift = calculateTemperatureDrift(22, 22, 100);

    expect(drift).toBe(0);
  });

  it('drift rate scales with temperature difference', () => {
    const smallDiff = calculateTemperatureDrift(24, 22, 100);
    const largeDiff = calculateTemperatureDrift(30, 22, 100);

    expect(Math.abs(largeDiff)).toBeGreaterThan(Math.abs(smallDiff));
  });

  it('drift rate scales inversely with tank volume', () => {
    const smallTank = calculateTemperatureDrift(28, 22, 50);
    const largeTank = calculateTemperatureDrift(28, 22, 200);

    // Smaller tanks have faster temperature changes
    expect(Math.abs(smallTank)).toBeGreaterThan(Math.abs(largeTank));
  });

  it('does not overshoot room temperature', () => {
    // Very small temperature difference
    const drift = calculateTemperatureDrift(22.001, 22, 100);

    // Drift should not exceed the difference
    expect(Math.abs(drift)).toBeLessThanOrEqual(0.001);
  });

  it('calculates correct drift at reference volume', () => {
    const waterTemp = 28;
    const roomTemp = 22;
    const deltaT = waterTemp - roomTemp; // 6°C

    const drift = calculateTemperatureDrift(waterTemp, roomTemp, REFERENCE_VOLUME);

    // At reference volume, volumeScale = 1, coolingRate = COOLING_COEFFICIENT * deltaT
    const expectedRate = COOLING_COEFFICIENT * deltaT;
    expect(drift).toBeCloseTo(-expectedRate, 6);
  });

  it('volume scaling follows expected formula', () => {
    const waterTemp = 28;
    const roomTemp = 22;
    const volume = 50;

    const drift = calculateTemperatureDrift(waterTemp, roomTemp, volume);

    const volumeScale = Math.pow(REFERENCE_VOLUME / volume, VOLUME_EXPONENT);
    const expectedRate = COOLING_COEFFICIENT * 6 * volumeScale;
    expect(drift).toBeCloseTo(-expectedRate, 6);
  });
});

describe('temperatureDriftSystem', () => {
  it('has correct id and tier', () => {
    expect(temperatureDriftSystem.id).toBe('temperature-drift');
    expect(temperatureDriftSystem.tier).toBe('immediate');
  });

  it('returns temperature effect when water is warmer than room', () => {
    const state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 28,
      roomTemperature: 22,
    });

    const effects = temperatureDriftSystem.update(state, DEFAULT_CONFIG);

    expect(effects).toHaveLength(1);
    expect(effects[0].tier).toBe('immediate');
    expect(effects[0].resource).toBe('temperature');
    expect(effects[0].delta).toBeLessThan(0);
    expect(effects[0].source).toBe('temperature-drift');
  });

  it('returns temperature effect when water is cooler than room', () => {
    const state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 18,
      roomTemperature: 22,
    });

    const effects = temperatureDriftSystem.update(state, DEFAULT_CONFIG);

    expect(effects).toHaveLength(1);
    expect(effects[0].delta).toBeGreaterThan(0);
  });

  it('returns empty array when at room temperature', () => {
    const state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 22,
      roomTemperature: 22,
    });

    const effects = temperatureDriftSystem.update(state, DEFAULT_CONFIG);

    expect(effects).toHaveLength(0);
  });
});

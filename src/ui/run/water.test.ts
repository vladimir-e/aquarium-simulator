import { describe, it, expect } from 'vitest';
import {
  gasReadings,
  readingAt,
  waterValues,
  waterReadings,
  type GasReading,
  type WaterReading,
} from './water';
import {
  HIGH_AMMONIA_THRESHOLD,
  HIGH_CO2_THRESHOLD,
  HIGH_NITRATE_THRESHOLD,
  HIGH_NITRITE_THRESHOLD,
  LOW_OXYGEN_THRESHOLD,
} from '../../simulation/alerts/index.js';
import { createSimulation, type SimulationState } from '../../simulation/index.js';

function tank(): SimulationState {
  return createSimulation({ tankCapacity: 200 });
}

function readings(state: SimulationState): WaterReading[] {
  return waterReadings(state, 'metric');
}

function byKey(state: SimulationState, key: string): WaterReading {
  const reading = readings(state).find((r) => r.key === key);
  if (!reading) throw new Error(`no reading for ${key}`);
  return reading;
}

describe('readingAt', () => {
  it('places a value along its own scale', () => {
    expect(readingAt('temperature', 25)).toBeCloseTo(0.5, 5);
    expect(readingAt('water', 100)).toBe(1);
    expect(readingAt('nitrate', 50)).toBeCloseTo(0.5, 5);
  });

  it('clamps readings that run off either end', () => {
    expect(readingAt('temperature', 60)).toBe(1);
    expect(readingAt('temperature', 0)).toBe(0);
  });
});

describe('display scales', () => {
  it('keeps every alert threshold on the track it belongs to', () => {
    expect(readingAt('ammonia', HIGH_AMMONIA_THRESHOLD)).toBeLessThan(1);
    expect(readingAt('nitrite', HIGH_NITRITE_THRESHOLD)).toBeLessThan(1);
    expect(readingAt('nitrate', HIGH_NITRATE_THRESHOLD)).toBeLessThan(1);
  });
});

describe('waterValues', () => {
  it('reads level as a percentage of capacity and the toxins as ppm', () => {
    const state = tank();
    state.resources.water = 150;
    state.resources.ammonia = 150 * 0.4;
    expect(waterValues(state).water).toBeCloseTo(75, 5);
    expect(waterValues(state).ammonia).toBeCloseTo(0.4, 5);
  });

  it('reads zero level rather than dividing by a capacity of nothing', () => {
    const state = tank();
    state.tank.capacity = 0;
    expect(waterValues(state).water).toBe(0);
  });
});

describe('waterReadings', () => {
  it('returns the six readings in reading order', () => {
    expect(readings(tank()).map((r) => r.key)).toEqual([
      'temperature',
      'ph',
      'water',
      'ammonia',
      'nitrite',
      'nitrate',
    ]);
  });

  it('bands the toxins at the engine thresholds and leaves temp and pH unbanded', () => {
    const state = tank();
    expect(byKey(state, 'ammonia').band).toEqual({
      from: 0,
      to: readingAt('ammonia', HIGH_AMMONIA_THRESHOLD),
    });
    expect(byKey(state, 'nitrate').band).toEqual({
      from: readingAt('nitrate', 5),
      to: readingAt('nitrate', HIGH_NITRATE_THRESHOLD),
    });
    expect(byKey(state, 'temperature').band).toBeNull();
    expect(byKey(state, 'ph').band).toBeNull();
  });

  it('takes its status from classifyVital, never from the scale', () => {
    const state = tank();
    state.resources.ammonia = state.resources.water * (HIGH_AMMONIA_THRESHOLD + 0.1);
    expect(byKey(state, 'ammonia').status).toBe('alert');
    expect(byKey(state, 'ph').status).toBe('neutral');
  });

  it('shows the reading in the reader’s units without moving it on the track', () => {
    const state = tank();
    state.resources.temperature = 25;
    const metric = waterReadings(state, 'metric')[0];
    const imperial = waterReadings(state, 'imperial')[0];
    expect(metric.text).toBe('25.0');
    expect(imperial.text).toBe('77.0');
    expect(imperial.fill).toBeCloseTo(metric.fill, 10);
  });
});

describe('gasReadings', () => {
  const gases = (oxygen: number, co2: number): GasReading[] =>
    gasReadings({ ...tank(), resources: { ...tank().resources, oxygen, co2 } });

  const gas = (oxygen: number, co2: number, key: 'oxygen' | 'co2'): GasReading => {
    const found = gases(oxygen, co2).find((g) => g.key === key);
    if (!found) throw new Error(`no reading for ${key}`);
    return found;
  };

  it('reads both gases off the engine in mg/L, in reading order', () => {
    const [oxygen, co2] = gases(7.25, 12.4);
    expect([oxygen.key, co2.key]).toEqual(['oxygen', 'co2']);
    expect(oxygen).toMatchObject({ name: 'O₂', value: 7.25, text: '7.3', unit: 'mg/L' });
    expect(co2).toMatchObject({ name: 'CO₂', value: 12.4, text: '12.4', unit: 'mg/L' });
  });

  it('calls oxygen low at the engine’s own alert threshold, and not before', () => {
    expect(LOW_OXYGEN_THRESHOLD).toBe(4);
    expect(gas(3.9, 12, 'oxygen')).toMatchObject({ status: 'warn' });
    expect(gas(5, 12, 'oxygen')).toMatchObject({ status: 'neutral' });
    expect(gas(6, 12, 'oxygen')).toMatchObject({ status: 'ok' });
  });

  it('calls CO₂ high only past the threshold its alert fires on', () => {
    expect(HIGH_CO2_THRESHOLD).toBe(30);
    expect(gas(7, 30.1, 'co2')).toMatchObject({ status: 'alert' });
    expect(gas(7, 30, 'co2')).toMatchObject({ status: 'neutral' });
  });
});

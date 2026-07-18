import { describe, it, expect } from 'vitest';
import { classifyVital } from './vitals';

describe('classifyVital', () => {
  it('flags toxins HIGH only past their alert threshold', () => {
    expect(classifyVital('ammonia', 0.05)).toEqual({ status: 'ok', pill: null });
    expect(classifyVital('ammonia', 0.2)).toEqual({ status: 'alert', pill: 'HIGH' });
    expect(classifyVital('nitrite', 0.5)).toEqual({ status: 'ok', pill: null });
    expect(classifyVital('nitrite', 1.5)).toEqual({ status: 'alert', pill: 'HIGH' });
  });

  it('reads nitrate as plant food: LOW when depleted, HIGH when it spikes', () => {
    expect(classifyVital('nitrate', 0)).toEqual({ status: 'warn', pill: 'LOW' });
    expect(classifyVital('nitrate', 20)).toEqual({ status: 'ok', pill: null });
    expect(classifyVital('nitrate', 100)).toEqual({ status: 'alert', pill: 'HIGH' });
  });

  it('keeps pH and temperature quiet regardless of value', () => {
    expect(classifyVital('ph', 6.0)).toEqual({ status: 'neutral', pill: null });
    expect(classifyVital('ph', 8.5)).toEqual({ status: 'neutral', pill: null });
    expect(classifyVital('temperature', 18)).toEqual({ status: 'neutral', pill: null });
    expect(classifyVital('temperature', 30)).toEqual({ status: 'neutral', pill: null });
  });

  it('grades oxygen: LOW when starved, neutral when marginal, ok when comfortable', () => {
    expect(classifyVital('oxygen', 3)).toEqual({ status: 'warn', pill: 'LOW' });
    expect(classifyVital('oxygen', 5)).toEqual({ status: 'neutral', pill: null });
    expect(classifyVital('oxygen', 8)).toEqual({ status: 'ok', pill: null });
  });

  it('flags CO₂ HIGH only past the harmful threshold, quiet otherwise', () => {
    expect(classifyVital('co2', 19)).toEqual({ status: 'neutral', pill: null });
    expect(classifyVital('co2', 35)).toEqual({ status: 'alert', pill: 'HIGH' });
  });

  it('marks water LOW below the critical level', () => {
    expect(classifyVital('water', 10)).toEqual({ status: 'warn', pill: 'LOW' });
    expect(classifyVital('water', 99)).toEqual({ status: 'ok', pill: null });
  });
});

import { describe, it, expect } from 'vitest';
import { classifyAmmonia, classifyVital } from './vitals';

describe('classifyAmmonia', () => {
  it('alerts only past the line it is handed', () => {
    expect(classifyAmmonia(0.5, 1)).toBe('ok');
    expect(classifyAmmonia(1.5, 1)).toBe('alert');
  });
});

describe('classifyVital', () => {
  it('alerts on a toxin only past its own threshold', () => {
    expect(classifyVital('nitrite', 0.5)).toBe('ok');
    expect(classifyVital('nitrite', 1.5)).toBe('alert');
  });

  it('reads nitrate as plant food: warns when depleted, alerts when it spikes', () => {
    expect(classifyVital('nitrate', 0)).toBe('warn');
    expect(classifyVital('nitrate', 20)).toBe('ok');
    expect(classifyVital('nitrate', 100)).toBe('alert');
  });

  it('keeps pH and temperature quiet regardless of value', () => {
    expect(classifyVital('ph', 6.0)).toBe('neutral');
    expect(classifyVital('ph', 8.5)).toBe('neutral');
    expect(classifyVital('temperature', 18)).toBe('neutral');
    expect(classifyVital('temperature', 30)).toBe('neutral');
  });

  it('grades oxygen: warns when starved, neutral when marginal, ok when comfortable', () => {
    expect(classifyVital('oxygen', 3)).toBe('warn');
    expect(classifyVital('oxygen', 5)).toBe('neutral');
    expect(classifyVital('oxygen', 8)).toBe('ok');
  });

  it('alerts on CO₂ only past the harmful threshold, quiet otherwise', () => {
    expect(classifyVital('co2', 19)).toBe('neutral');
    expect(classifyVital('co2', 35)).toBe('alert');
  });

  it('warns on water below the critical level', () => {
    expect(classifyVital('water', 10)).toBe('warn');
    expect(classifyVital('water', 99)).toBe('ok');
  });
});

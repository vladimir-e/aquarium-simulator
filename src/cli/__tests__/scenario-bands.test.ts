import { describe, it, expect } from 'vitest';
import { READINGS, classify, gradeReading, type Band, type Reading } from '../scenarios/readings.js';

const band: Band = { green: [0, 40], amber: [0, 80], why: '' };
const reading = (id: string): Reading => READINGS.find((r) => r.id === id)!;

describe('band classification', () => {
  it('grades inside green, inside amber only, and outside both', () => {
    expect(classify(20, band)).toBe('G');
    expect(classify(60, band)).toBe('A');
    expect(classify(90, band)).toBe('R');
  });

  it('counts the edges as inside', () => {
    expect(classify(40, band)).toBe('G');
    expect(classify(80, band)).toBe('A');
  });

  it('reads a two-sided band from below as well', () => {
    const temp = reading('temp').band;
    expect(classify(72, temp)).toBe('A');
    expect(classify(60, temp)).toBe('R');
  });

  it('leaves a missing value unbanded', () => {
    expect(gradeReading(reading('fish_health'), null, { day: 7, cycled: true, start: null })).toBeNull();
  });

  it('holds cycle readings of an uncycled start until its grace month is out', () => {
    const no2 = reading('no2');
    expect(gradeReading(no2, 3, { day: 7, cycled: false, start: 0 })).toBeNull();
    expect(gradeReading(no2, 3, { day: 30, cycled: false, start: 0 })).toBe('R');
    expect(gradeReading(no2, 3, { day: 7, cycled: true, start: 0 })).toBe('R');
    expect(gradeReading(reading('no3'), 100, { day: 7, cycled: false, start: 0 })).toBe('R');
  });

  it('bands a count as a share of its start', () => {
    const fish = reading('fish');
    expect(gradeReading(fish, 10, { day: 90, cycled: true, start: 10 })).toBe('G');
    expect(gradeReading(fish, 8, { day: 90, cycled: true, start: 10 })).toBe('A');
    expect(gradeReading(fish, 5, { day: 90, cycled: true, start: 10 })).toBe('R');
    expect(gradeReading(fish, 0, { day: 90, cycled: true, start: 0 })).toBeNull();
  });

  it('lets a setup override a band', () => {
    const overrides = { temp: { green: [62, 76], amber: [56, 80], why: '' } } as const;
    expect(gradeReading(reading('temp'), 68, { day: 1, cycled: true, start: 68 })).toBe('R');
    expect(gradeReading(reading('temp'), 68, { day: 1, cycled: true, start: 68, overrides })).toBe('G');
  });
});

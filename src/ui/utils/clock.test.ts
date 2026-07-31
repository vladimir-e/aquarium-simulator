import { describe, it, expect } from 'vitest';
import { dayNumber, hourOfDay, formatDayClock, formatElapsed } from './clock';

describe('dayNumber / hourOfDay', () => {
  it('starts the run on day 1 at midnight', () => {
    expect(dayNumber(0)).toBe(1);
    expect(hourOfDay(0)).toBe(0);
  });

  it('rolls the day over on the 24th hour, not the 23rd', () => {
    expect(dayNumber(23)).toBe(1);
    expect(hourOfDay(23)).toBe(23);
    expect(dayNumber(24)).toBe(2);
    expect(hourOfDay(24)).toBe(0);
  });
});

describe('formatDayClock', () => {
  it('reads a mid-run tick as a wall clock', () => {
    expect(formatDayClock(1622)).toBe('Day 68 · 14:00');
  });

  it('pads single-digit hours', () => {
    expect(formatDayClock(1609)).toBe('Day 68 · 01:00');
    expect(formatDayClock(1608)).toBe('Day 68 · 00:00');
  });
});

describe('formatElapsed', () => {
  it('drops the empty half of the reading', () => {
    expect(formatElapsed(14)).toBe('14h');
    expect(formatElapsed(48)).toBe('2d');
    expect(formatElapsed(1622)).toBe('67d 14h');
  });

  it('reads zero as no hours elapsed', () => {
    expect(formatElapsed(0)).toBe('0h');
  });
});

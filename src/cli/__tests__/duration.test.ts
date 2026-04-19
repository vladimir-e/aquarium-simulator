import { describe, it, expect } from 'vitest';
import { parseDuration, formatDuration } from '../duration.js';

describe('parseDuration', () => {
  it('parses days', () => {
    expect(parseDuration('5d')).toBe(120);
    expect(parseDuration('1d')).toBe(24);
    expect(parseDuration('0d')).toBe(0);
  });

  it('parses hours', () => {
    expect(parseDuration('48h')).toBe(48);
    expect(parseDuration('1h')).toBe(1);
  });

  it('treats bare integers as hours', () => {
    expect(parseDuration('72')).toBe(72);
    expect(parseDuration('1')).toBe(1);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(parseDuration(' 3D ')).toBe(72);
    expect(parseDuration('12H')).toBe(12);
  });

  it('rejects malformed input', () => {
    expect(() => parseDuration('1.5d')).toThrow(/Invalid duration/);
    expect(() => parseDuration('abc')).toThrow(/Invalid duration/);
    expect(() => parseDuration('-3h')).toThrow(/Invalid duration/);
    expect(() => parseDuration('')).toThrow(/Invalid duration/);
  });
});

describe('formatDuration', () => {
  it('prefers day unit when exact multiple of 24', () => {
    expect(formatDuration(48)).toBe('2d');
    expect(formatDuration(24)).toBe('1d');
  });

  it('falls back to hours', () => {
    expect(formatDuration(1)).toBe('1h');
    expect(formatDuration(25)).toBe('25h');
    expect(formatDuration(0)).toBe('0h');
  });
});

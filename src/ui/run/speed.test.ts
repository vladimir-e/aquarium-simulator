import { describe, it, expect } from 'vitest';
import {
  normalizeSpeed,
  DEFAULT_SPEED,
  SPEED_PRESETS,
  SPEED_TICKS_PER_SECOND,
  SPEED_LABELS,
  STEP_LABELS,
  type SpeedPreset,
} from './speed';

describe('speed presets', () => {
  it('exposes the three current tiers', () => {
    expect(SPEED_PRESETS).toEqual(['1h', '6h', '1d']);
  });

  it('maps each preset to its tick multiplier', () => {
    expect(SPEED_TICKS_PER_SECOND).toEqual({ '1h': 1, '6h': 6, '1d': 24 });
  });

  it('labels every preset for the speed and step controls', () => {
    for (const preset of SPEED_PRESETS) {
      expect(SPEED_LABELS[preset]).toBeTruthy();
      expect(STEP_LABELS[preset]).toBeTruthy();
    }
  });

  it('defaults to the slowest tier', () => {
    expect(DEFAULT_SPEED).toBe('1h');
  });
});

describe('normalizeSpeed', () => {
  it('passes current keys through unchanged', () => {
    for (const preset of SPEED_PRESETS) {
      expect(normalizeSpeed(preset)).toBe(preset);
    }
  });

  it('migrates retired legacy keys', () => {
    expect(normalizeSpeed('1hr')).toBe('1h');
    expect(normalizeSpeed('6hr')).toBe('6h');
    expect(normalizeSpeed('1day')).toBe('1d');
  });

  it('migrates raw tick multipliers', () => {
    expect(normalizeSpeed(1)).toBe('1h');
    expect(normalizeSpeed(6)).toBe('6h');
    expect(normalizeSpeed(24)).toBe('1d');
  });

  it('resolves the dropped 12 tier to the nearest slower speed', () => {
    expect(normalizeSpeed('12hr')).toBe('6h');
    expect(normalizeSpeed(12)).toBe('6h');
  });

  it('falls back to the default for unknown input', () => {
    expect(normalizeSpeed('nonsense')).toBe(DEFAULT_SPEED);
    expect(normalizeSpeed(999)).toBe(DEFAULT_SPEED);
    expect(normalizeSpeed(undefined)).toBe(DEFAULT_SPEED);
    expect(normalizeSpeed(null)).toBe(DEFAULT_SPEED);
    expect(normalizeSpeed({})).toBe(DEFAULT_SPEED);
  });

  it('returns a value that is always a valid preset', () => {
    const result: SpeedPreset = normalizeSpeed('whatever');
    expect(SPEED_PRESETS).toContain(result);
  });
});

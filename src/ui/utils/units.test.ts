import { describe, it, expect, afterEach } from 'vitest';
import {
  formatTemperature,
  formatVolume,
  getTemperatureUnit,
  getVolumeUnit,
  toInternalTemperature,
  toDisplayTemperature,
  toInternalVolume,
  toDisplayVolume,
  detectUnitSystem,
} from './units';

describe('formatTemperature', () => {
  it('formats Celsius in metric system', () => {
    expect(formatTemperature(25, 'metric')).toBe('25.0°C');
  });

  it('formats Fahrenheit in imperial system', () => {
    expect(formatTemperature(25, 'imperial')).toBe('77.0°F');
  });

  it('respects precision parameter', () => {
    expect(formatTemperature(25.456, 'metric', 2)).toBe('25.46°C');
    expect(formatTemperature(25.456, 'imperial', 0)).toBe('78°F');
  });
});

describe('formatVolume', () => {
  it('formats liters in metric system', () => {
    expect(formatVolume(10, 'metric')).toBe('10.0 L');
  });

  it('formats gallons in imperial system', () => {
    expect(formatVolume(10, 'imperial')).toBe('2.6 gal');
  });

  it('respects precision parameter', () => {
    expect(formatVolume(37.854, 'metric', 2)).toBe('37.85 L');
    expect(formatVolume(37.854, 'imperial', 2)).toBe('10.00 gal');
  });
});

describe('getTemperatureUnit', () => {
  it('returns °C for metric', () => {
    expect(getTemperatureUnit('metric')).toBe('°C');
  });

  it('returns °F for imperial', () => {
    expect(getTemperatureUnit('imperial')).toBe('°F');
  });
});

describe('getVolumeUnit', () => {
  it('returns L for metric', () => {
    expect(getVolumeUnit('metric')).toBe('L');
  });

  it('returns gal for imperial', () => {
    expect(getVolumeUnit('imperial')).toBe('gal');
  });
});

describe('toInternalTemperature', () => {
  it('passes through value in metric system', () => {
    expect(toInternalTemperature(25, 'metric')).toBe(25);
  });

  it('converts Fahrenheit to Celsius in imperial system', () => {
    expect(toInternalTemperature(77, 'imperial')).toBe(25);
  });
});

describe('toDisplayTemperature', () => {
  it('passes through value in metric system', () => {
    expect(toDisplayTemperature(25, 'metric')).toBe(25);
  });

  it('converts Celsius to Fahrenheit in imperial system', () => {
    expect(toDisplayTemperature(0, 'imperial')).toBe(32);
    expect(toDisplayTemperature(25, 'imperial')).toBe(77);
    expect(toDisplayTemperature(100, 'imperial')).toBe(212);
    expect(toDisplayTemperature(-40, 'imperial')).toBe(-40);
  });

  it('inverts toInternalTemperature', () => {
    for (const celsius of [25, 0, -10]) {
      expect(toInternalTemperature(toDisplayTemperature(celsius, 'imperial'), 'imperial')).toBeCloseTo(celsius);
    }
  });
});

describe('toInternalVolume', () => {
  it('passes through value in metric system', () => {
    expect(toInternalVolume(10, 'metric')).toBe(10);
  });

  it('converts gallons to liters in imperial system', () => {
    expect(toInternalVolume(1, 'imperial')).toBeCloseTo(3.785, 3);
  });
});

describe('toDisplayVolume', () => {
  it('passes through value in metric system', () => {
    expect(toDisplayVolume(10, 'metric')).toBe(10);
  });

  it('converts liters to gallons in imperial system', () => {
    expect(toDisplayVolume(3.785411784, 'imperial')).toBeCloseTo(1, 5);
    expect(toDisplayVolume(10, 'imperial')).toBeCloseTo(2.6417, 4);
    expect(toDisplayVolume(0, 'imperial')).toBe(0);
  });

  it('inverts toInternalVolume', () => {
    for (const liters of [100, 37.5]) {
      expect(toInternalVolume(toDisplayVolume(liters, 'imperial'), 'imperial')).toBeCloseTo(liters);
    }
  });
});

describe('detectUnitSystem', () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
    });
  });

  it('returns imperial for en-US locale', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'en-US' },
      writable: true,
    });
    expect(detectUnitSystem()).toBe('imperial');
  });

  it('returns metric for en-GB locale', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'en-GB' },
      writable: true,
    });
    expect(detectUnitSystem()).toBe('metric');
  });

  it('returns metric for de-DE locale', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'de-DE' },
      writable: true,
    });
    expect(detectUnitSystem()).toBe('metric');
  });

  it('returns metric for locale without country code', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'en' },
      writable: true,
    });
    expect(detectUnitSystem()).toBe('metric');
  });

  it('returns imperial for Liberia (en-LR)', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'en-LR' },
      writable: true,
    });
    expect(detectUnitSystem()).toBe('imperial');
  });

  it('returns imperial for Myanmar (my-MM)', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'my-MM' },
      writable: true,
    });
    expect(detectUnitSystem()).toBe('imperial');
  });
});

import { describe, it, expect, afterEach } from 'vitest';
import {
  formatTemperature,
  formatTemperatureRange,
  formatVolume,
  getTemperatureUnit,
  getVolumeUnit,
  toInternalTemperature,
  toDisplayTemperature,
  toInternalVolume,
  toDisplayVolume,
  detectUnitSystem,
  getTankSizeOptions,
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

describe('formatTemperatureRange', () => {
  it('carries one unit for the span, in the reader’s own scale', () => {
    expect(formatTemperatureRange([22, 28], 'metric')).toBe('22–28°C');
    expect(formatTemperatureRange([22, 28], 'imperial')).toBe('72–82°F');
  });

  it('states both ends at the precision it is asked for', () => {
    expect(formatTemperatureRange([22.35, 27.84], 'metric', 1)).toBe('22.4–27.8°C');
    expect(formatTemperatureRange([22, 28], 'imperial', 1)).toBe('71.6–82.4°F');
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

describe('getTankSizeOptions', () => {
  it('offers round sizes in the reader’s own system', () => {
    expect(getTankSizeOptions('metric').map((size) => size.display)).toEqual([
      '20 L',
      '40 L',
      '75 L',
      '150 L',
      '200 L',
      '300 L',
      '400 L',
    ]);
    expect(getTankSizeOptions('imperial').map((size) => size.display)).toEqual([
      '5 gal',
      '10 gal',
      '20 gal',
      '40 gal',
      '55 gal',
      '75 gal',
      '100 gal',
    ]);
  });

  it('carries a capacity that is round in the other system, in its place', () => {
    const options = getTankSizeOptions('imperial', 40);
    const displays = options.map((size) => size.display);

    expect(displays).toContain('10.6 gal');
    expect(displays.indexOf('10.6 gal')).toBe(displays.indexOf('10 gal') + 1);
    expect(options.map((size) => size.liters)).toEqual(
      [...options].sort((a, b) => a.liters - b.liters).map((size) => size.liters)
    );
  });

  it('adds nothing when the capacity is already one of them', () => {
    expect(getTankSizeOptions('metric', 75)).toEqual(getTankSizeOptions('metric'));
    expect(getTankSizeOptions('imperial', toInternalVolume(20, 'imperial'))).toEqual(
      getTankSizeOptions('imperial')
    );
  });
});

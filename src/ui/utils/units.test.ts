/* eslint-disable no-undef */
// Browser globals (localStorage, navigator) are available in test environment
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  litersToGallons,
  gallonsToLiters,
  formatTemperature,
  formatVolume,
  getTemperatureUnit,
  getVolumeUnit,
  toInternalTemperature,
  toDisplayTemperature,
  toInternalVolume,
  toDisplayVolume,
  saveUnitPreference,
  loadUnitPreference,
  detectUnitSystem,
} from './units';

describe('celsiusToFahrenheit', () => {
  it('converts 0°C to 32°F', () => {
    expect(celsiusToFahrenheit(0)).toBe(32);
  });

  it('converts 100°C to 212°F', () => {
    expect(celsiusToFahrenheit(100)).toBe(212);
  });

  it('converts 25°C to 77°F', () => {
    expect(celsiusToFahrenheit(25)).toBe(77);
  });

  it('converts negative temperatures', () => {
    expect(celsiusToFahrenheit(-40)).toBe(-40);
  });
});

describe('fahrenheitToCelsius', () => {
  it('converts 32°F to 0°C', () => {
    expect(fahrenheitToCelsius(32)).toBe(0);
  });

  it('converts 212°F to 100°C', () => {
    expect(fahrenheitToCelsius(212)).toBe(100);
  });

  it('converts 77°F to 25°C', () => {
    expect(fahrenheitToCelsius(77)).toBe(25);
  });

  it('is inverse of celsiusToFahrenheit', () => {
    expect(fahrenheitToCelsius(celsiusToFahrenheit(25))).toBeCloseTo(25);
    expect(fahrenheitToCelsius(celsiusToFahrenheit(0))).toBeCloseTo(0);
    expect(fahrenheitToCelsius(celsiusToFahrenheit(-10))).toBeCloseTo(-10);
  });
});

describe('litersToGallons', () => {
  it('converts 3.785 liters to approximately 1 gallon', () => {
    expect(litersToGallons(3.785411784)).toBeCloseTo(1, 5);
  });

  it('converts 10 liters to approximately 2.64 gallons', () => {
    expect(litersToGallons(10)).toBeCloseTo(2.6417, 4);
  });

  it('converts 0 liters to 0 gallons', () => {
    expect(litersToGallons(0)).toBe(0);
  });
});

describe('gallonsToLiters', () => {
  it('converts 1 gallon to approximately 3.785 liters', () => {
    expect(gallonsToLiters(1)).toBeCloseTo(3.785411784, 5);
  });

  it('converts 10 gallons to approximately 37.85 liters', () => {
    expect(gallonsToLiters(10)).toBeCloseTo(37.85, 2);
  });

  it('is inverse of litersToGallons', () => {
    expect(gallonsToLiters(litersToGallons(100))).toBeCloseTo(100);
    expect(gallonsToLiters(litersToGallons(37.5))).toBeCloseTo(37.5);
  });
});

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
    expect(toDisplayTemperature(25, 'imperial')).toBe(77);
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
  });
});

describe('localStorage persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('saveUnitPreference', () => {
    it('saves metric to localStorage', () => {
      saveUnitPreference('metric');
      expect(localStorage.getItem('aquarium-units')).toBe('metric');
    });

    it('saves imperial to localStorage', () => {
      saveUnitPreference('imperial');
      expect(localStorage.getItem('aquarium-units')).toBe('imperial');
    });
  });

  describe('loadUnitPreference', () => {
    it('returns null when no preference stored', () => {
      expect(loadUnitPreference()).toBeNull();
    });

    it('returns metric when stored', () => {
      localStorage.setItem('aquarium-units', 'metric');
      expect(loadUnitPreference()).toBe('metric');
    });

    it('returns imperial when stored', () => {
      localStorage.setItem('aquarium-units', 'imperial');
      expect(loadUnitPreference()).toBe('imperial');
    });

    it('returns null for invalid values', () => {
      localStorage.setItem('aquarium-units', 'invalid');
      expect(loadUnitPreference()).toBeNull();
    });
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

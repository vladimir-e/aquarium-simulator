/**
 * Unit system utilities for temperature and volume conversion.
 *
 * Metric: Celsius & Liters
 * Imperial: Fahrenheit & Gallons
 */

/* eslint-disable no-undef */
// Browser globals are available in the UI runtime environment

export type UnitSystem = 'metric' | 'imperial';

const LITERS_PER_GALLON = 3.785411784;

/**
 * Convert Celsius to Fahrenheit.
 */
export function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

/**
 * Convert Fahrenheit to Celsius.
 */
export function fahrenheitToCelsius(fahrenheit: number): number {
  return ((fahrenheit - 32) * 5) / 9;
}

/**
 * Convert liters to gallons.
 */
export function litersToGallons(liters: number): number {
  return liters / LITERS_PER_GALLON;
}

/**
 * Convert gallons to liters.
 */
export function gallonsToLiters(gallons: number): number {
  return gallons * LITERS_PER_GALLON;
}

/**
 * Format temperature for display based on unit system.
 */
export function formatTemperature(celsius: number, system: UnitSystem, precision = 1): string {
  if (system === 'imperial') {
    const fahrenheit = celsiusToFahrenheit(celsius);
    return `${fahrenheit.toFixed(precision)}°F`;
  }
  return `${celsius.toFixed(precision)}°C`;
}

/**
 * Format volume for display based on unit system.
 */
export function formatVolume(liters: number, system: UnitSystem, precision = 1): string {
  if (system === 'imperial') {
    const gallons = litersToGallons(liters);
    return `${gallons.toFixed(precision)} gal`;
  }
  return `${liters.toFixed(precision)} L`;
}

/**
 * Get temperature unit label based on unit system.
 */
export function getTemperatureUnit(system: UnitSystem): string {
  return system === 'imperial' ? '°F' : '°C';
}

/**
 * Get volume unit label based on unit system.
 */
export function getVolumeUnit(system: UnitSystem): string {
  return system === 'imperial' ? 'gal' : 'L';
}

/**
 * Convert displayed temperature to internal Celsius value.
 */
export function toInternalTemperature(value: number, system: UnitSystem): number {
  return system === 'imperial' ? fahrenheitToCelsius(value) : value;
}

/**
 * Convert internal Celsius to display value.
 */
export function toDisplayTemperature(celsius: number, system: UnitSystem): number {
  return system === 'imperial' ? celsiusToFahrenheit(celsius) : celsius;
}

/**
 * Convert displayed volume to internal liters value.
 */
export function toInternalVolume(value: number, system: UnitSystem): number {
  return system === 'imperial' ? gallonsToLiters(value) : value;
}

/**
 * Convert internal liters to display value.
 */
export function toDisplayVolume(liters: number, system: UnitSystem): number {
  return system === 'imperial' ? litersToGallons(liters) : liters;
}

const STORAGE_KEY = 'aquarium-units';

/**
 * Save unit preference to localStorage.
 */
export function saveUnitPreference(system: UnitSystem): void {
  try {
    localStorage.setItem(STORAGE_KEY, system);
  } catch {
    // localStorage may not be available (e.g., private browsing)
  }
}

/**
 * Load unit preference from localStorage.
 */
export function loadUnitPreference(): UnitSystem | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'metric' || stored === 'imperial') {
      return stored;
    }
  } catch {
    // localStorage may not be available
  }
  return null;
}

/**
 * Detect preferred unit system from browser locale.
 * Countries using imperial: US, Liberia, Myanmar (Burma).
 */
export function detectUnitSystem(): UnitSystem {
  try {
    // Get user's locale
    const locale = navigator.language || (navigator as { userLanguage?: string }).userLanguage || 'en';

    // Extract country code (e.g., 'en-US' -> 'US')
    const parts = locale.split('-');
    const country = parts.length > 1 ? parts[1].toUpperCase() : '';

    // Countries that primarily use imperial units for everyday measurements
    const imperialCountries = ['US', 'LR', 'MM'];

    if (imperialCountries.includes(country)) {
      return 'imperial';
    }
  } catch {
    // navigator may not be available in some environments
  }

  return 'metric';
}

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

// ============================================================================
// Tank Size Presets
// ============================================================================

export interface TankSizeOption {
  /** Internal value in liters (used by simulation) */
  liters: number;
  /** Display value (liters for metric, gallons for imperial) */
  displayValue: number;
  /** Formatted display string */
  display: string;
}

/** Metric tank sizes - round liter values */
const METRIC_TANK_SIZES = [20, 40, 75, 150, 200, 300, 400];

/** Imperial tank sizes - round gallon values */
const IMPERIAL_TANK_SIZES = [5, 10, 20, 40, 55, 75, 100];

/**
 * Get tank size options based on unit system.
 * Returns options with internal liter values and formatted display strings.
 */
export function getTankSizeOptions(system: UnitSystem): TankSizeOption[] {
  if (system === 'imperial') {
    return IMPERIAL_TANK_SIZES.map((gallons) => ({
      liters: gallonsToLiters(gallons),
      displayValue: gallons,
      display: `${gallons} gal`,
    }));
  }
  return METRIC_TANK_SIZES.map((liters) => ({
    liters,
    displayValue: liters,
    display: `${liters} L`,
  }));
}

/**
 * Find the closest tank size option for a given liter value.
 * Useful when switching unit systems to snap to nearest "nice" value.
 */
export function findClosestTankSize(liters: number, system: UnitSystem): TankSizeOption {
  const options = getTankSizeOptions(system);
  let closest = options[0];
  let minDiff = Math.abs(liters - closest.liters);

  for (const option of options) {
    const diff = Math.abs(liters - option.liters);
    if (diff < minDiff) {
      minDiff = diff;
      closest = option;
    }
  }

  return closest;
}

// ============================================================================
// Temperature Presets (for heater target, etc.)
// ============================================================================

export interface TemperatureOption {
  /** Internal value in Celsius (used by simulation) */
  celsius: number;
  /** Display value (Celsius for metric, Fahrenheit for imperial) */
  displayValue: number;
  /** Formatted display string */
  display: string;
}

/** Common aquarium temperatures in Celsius */
const METRIC_TEMPERATURES = [18, 20, 22, 24, 25, 26, 28, 30, 32];

/** Common aquarium temperatures in Fahrenheit (round numbers) */
const IMPERIAL_TEMPERATURES = [65, 68, 72, 75, 77, 78, 80, 82, 85, 90];

/**
 * Get temperature options for heater target based on unit system.
 */
export function getTemperatureOptions(system: UnitSystem): TemperatureOption[] {
  if (system === 'imperial') {
    return IMPERIAL_TEMPERATURES.map((fahrenheit) => ({
      celsius: fahrenheitToCelsius(fahrenheit),
      displayValue: fahrenheit,
      display: `${fahrenheit}°F`,
    }));
  }
  return METRIC_TEMPERATURES.map((celsius) => ({
    celsius,
    displayValue: celsius,
    display: `${celsius}°C`,
  }));
}

/**
 * Find the closest temperature option for a given Celsius value.
 */
export function findClosestTemperature(celsius: number, system: UnitSystem): TemperatureOption {
  const options = getTemperatureOptions(system);
  let closest = options[0];
  let minDiff = Math.abs(celsius - closest.celsius);

  for (const option of options) {
    const diff = Math.abs(celsius - option.celsius);
    if (diff < minDiff) {
      minDiff = diff;
      closest = option;
    }
  }

  return closest;
}

/**
 * Round a temperature to a "nice" display value based on unit system.
 * For imperial, rounds to nearest whole Fahrenheit.
 * For metric, rounds to nearest 0.5°C.
 */
export function roundTemperature(celsius: number, system: UnitSystem): number {
  if (system === 'imperial') {
    const fahrenheit = Math.round(celsiusToFahrenheit(celsius));
    return fahrenheitToCelsius(fahrenheit);
  }
  return Math.round(celsius * 2) / 2; // Round to nearest 0.5
}

// ============================================================================
// Flow Rate Utilities (GPH / L/h)
// ============================================================================

const LITERS_PER_HOUR_PER_GPH = 3.785411784;

/**
 * Convert GPH to L/h.
 */
export function gphToLph(gph: number): number {
  return gph * LITERS_PER_HOUR_PER_GPH;
}

/**
 * Convert L/h to GPH.
 */
export function lphToGph(lph: number): number {
  return lph / LITERS_PER_HOUR_PER_GPH;
}

/**
 * Format flow rate based on unit system.
 * GPH is standard in imperial, L/h in metric.
 */
export function formatFlowRate(gph: number, system: UnitSystem): string {
  if (system === 'imperial') {
    return `${gph} GPH`;
  }
  const lph = Math.round(gphToLph(gph));
  return `${lph} L/h`;
}

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
function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

/**
 * Convert Fahrenheit to Celsius.
 */
function fahrenheitToCelsius(fahrenheit: number): number {
  return ((fahrenheit - 32) * 5) / 9;
}

/**
 * Convert liters to gallons.
 */
function litersToGallons(liters: number): number {
  return liters / LITERS_PER_GALLON;
}

/**
 * Convert gallons to liters.
 */
function gallonsToLiters(gallons: number): number {
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
 * Format a temperature tolerance band for display — one unit label for the pair.
 */
export function formatTemperatureRange(
  [low, high]: [number, number],
  system: UnitSystem,
  precision = 0
): string {
  const lo = toDisplayTemperature(low, system).toFixed(precision);
  const hi = toDisplayTemperature(high, system).toFixed(precision);
  return `${lo}–${hi}${getTemperatureUnit(system)}`;
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
// Flow Rate Utilities (GPH / L/h)
// ============================================================================

const LITERS_PER_HOUR_PER_GPH = 3.785411784;

/**
 * Convert L/h to GPH.
 */
function lphToGph(lph: number): number {
  return lph / LITERS_PER_HOUR_PER_GPH;
}

function formatFlow(lph: number, system: UnitSystem, round: (value: number) => number): string {
  if (system === 'imperial') {
    return `${round(lphToGph(lph))} GPH`;
  }
  return `${round(lph)} L/h`;
}

/**
 * Format a flow rate for display. Takes the engine's own unit (L/h) so every
 * caller passes an engine value and rounds once, in the reader's units.
 */
export function formatFlowRate(lph: number, system: UnitSystem): string {
  return formatFlow(lph, system, Math.round);
}

/**
 * The pair a shortfall is stated in: what a device moves, and what the tank
 * asks of it. They round apart so that a real deficit — however small, and in
 * whichever units the reader has chosen — never renders as one number twice.
 */
export function formatDeliveredFlow(lph: number, system: UnitSystem): string {
  return formatFlow(lph, system, Math.floor);
}

export function formatRequiredFlow(lph: number, system: UnitSystem): string {
  return formatFlow(lph, system, Math.ceil);
}

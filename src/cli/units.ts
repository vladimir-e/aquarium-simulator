export const LITERS_PER_GALLON = 3.785411784;

export const toCelsius = (f: number): number => ((f - 32) * 5) / 9;
export const toFahrenheit = (c: number): number => (c * 9) / 5 + 32;

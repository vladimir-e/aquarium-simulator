/**
 * Temperature drift system tunable configuration.
 */

export interface TemperatureConfig {
  /** Cooling coefficient: °C/hr per °C differential at reference volume */
  coolingCoefficient: number;
  /** Reference volume in liters for scaling calculations */
  referenceVolume: number;
  /** Volume scaling exponent (surface-area-to-volume ratio) */
  volumeExponent: number;
  /** How far the room runs above its mean in the late afternoon, and below it before dawn (°C) */
  roomDailySwing: number;
  /** Degrees a lit fixture raises the temperature the water settles toward, per PAR at the surface */
  lightWarmingPerPar: number;
}

export const temperatureDefaults: TemperatureConfig = {
  coolingCoefficient: 0.132,
  referenceVolume: 100,
  volumeExponent: 1 / 3,
  // A heated house drifts 3–5 °F between its warm afternoon and cold small
  // hours; ±1.25 °C is 4.5 °F end to end.
  roomDailySwing: 1.25,
  // Light heats the surface in proportion to its flux and the surface sheds
  // it in proportion to its area, so the warming a fixture holds is set by
  // PAR alone, whatever the tank. A 120 PAR high-tech fixture settles 1.2 °C
  // over the room; an LED at 40, under half a degree.
  lightWarmingPerPar: 0.01,
};

export interface TemperatureConfigMeta {
  key: keyof TemperatureConfig;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export const temperatureConfigMeta: TemperatureConfigMeta[] = [
  { key: 'coolingCoefficient', label: 'Cooling Coefficient', unit: '°C/hr/°C', min: 0.05, max: 0.3, step: 0.01 },
  { key: 'referenceVolume', label: 'Reference Volume', unit: 'L', min: 20, max: 500, step: 10 },
  { key: 'volumeExponent', label: 'Volume Exponent', unit: '', min: 0.1, max: 0.5, step: 0.05 },
  { key: 'roomDailySwing', label: 'Room Daily Swing', unit: '°C', min: 0, max: 5, step: 0.25 },
  { key: 'lightWarmingPerPar', label: 'Light Warming', unit: '°C/PAR', min: 0, max: 0.05, step: 0.0025 },
];

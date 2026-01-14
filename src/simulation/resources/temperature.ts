/**
 * Temperature resource - water temperature in degrees Celsius.
 */

import type { ResourceDefinition } from './types.js';

export const TemperatureResource: ResourceDefinition<'temperature'> = {
  key: 'temperature',
  unit: '°C',
  bounds: { min: 0, max: 50 },
  defaultValue: 25,
  precision: 1,
  format: (value: number) => `${value.toFixed(1)}°C`,
  safeRange: { min: 22, max: 28 },
  stressRange: { min: 18, max: 32 },
};

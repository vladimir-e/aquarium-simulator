/**
 * Temperature resource definition.
 */

import type { ResourceDefinition } from './types.js';

export const TemperatureResource: ResourceDefinition<'temperature'> = {
  key: 'temperature',
  location: 'resources',
  property: 'temperature',
  unit: '°C',
  bounds: {
    min: 0,
    max: 50,
  },
  defaultValue: 25,
  precision: 1,
  format: (value: number) => `${value.toFixed(1)}°C`,
  safeRange: {
    min: 18,
    max: 30,
  },
  stressRange: {
    min: 15,
    max: 33,
  },
};

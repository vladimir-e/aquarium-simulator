/**
 * Nitrate resource - NO3 concentration in ppm.
 * Less toxic than ammonia/nitrite but accumulates over time.
 * Removed by water changes or plants.
 */

import type { ResourceDefinition } from './types.js';

export const NitrateResource: ResourceDefinition<'nitrate'> = {
  key: 'nitrate',
  unit: 'ppm',
  bounds: { min: 0, max: 500 },
  defaultValue: 0,
  precision: 1,
  format: (value: number) => `${value.toFixed(1)} ppm`,
  safeRange: { min: 0, max: 20 },
  stressRange: { min: 20, max: 80 },
};

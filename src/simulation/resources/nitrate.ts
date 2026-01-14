/**
 * Nitrate resource - NO3 concentration in ppm.
 * Least toxic nitrogen compound. End product of nitrogen cycle,
 * accumulates over time and removed by plants/water changes.
 */

import type { ResourceDefinition } from './types.js';

export const NitrateResource: ResourceDefinition<'nitrate'> = {
  key: 'nitrate',
  unit: 'ppm',
  bounds: { min: 0, max: 200 },
  defaultValue: 0,
  precision: 1,
  format: (value: number) => `${value.toFixed(1)} ppm`,
  safeRange: { min: 0, max: 20 },
  stressRange: { min: 20, max: 40 },
};

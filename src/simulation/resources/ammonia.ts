/**
 * Ammonia resource - NH3 concentration in ppm.
 * Toxic to fish - primary product of waste decomposition.
 */

import type { ResourceDefinition } from './types.js';

export const AmmoniaResource: ResourceDefinition<'ammonia'> = {
  key: 'ammonia',
  unit: 'ppm',
  bounds: { min: 0, max: 100 },
  defaultValue: 0,
  precision: 3,
  format: (value: number) => `${value.toFixed(3)} ppm`,
  safeRange: { min: 0, max: 0.02 },
  stressRange: { min: 0.02, max: 0.1 },
};

/**
 * Ammonia resource - NH3 concentration in ppm.
 * Highly toxic to fish. Produced by waste decomposition,
 * consumed by AOB bacteria in the nitrogen cycle.
 */

import type { ResourceDefinition } from './types.js';

export const AmmoniaResource: ResourceDefinition<'ammonia'> = {
  key: 'ammonia',
  unit: 'ppm',
  bounds: { min: 0, max: 10 },
  defaultValue: 0,
  precision: 3,
  format: (value: number) => `${value.toFixed(3)} ppm`,
  safeRange: { min: 0, max: 0 },
  stressRange: { min: 0.02, max: 0.05 },
};

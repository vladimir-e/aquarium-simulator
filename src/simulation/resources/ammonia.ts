/**
 * Ammonia resource - NH3 stored as mass in mg.
 * Highly toxic to fish. Produced by waste decomposition,
 * consumed by AOB bacteria in the nitrogen cycle.
 *
 * Display shows derived ppm (mass/water), safe/stress ranges are in ppm.
 */

import type { ResourceDefinition } from './types.js';
import { getPpm } from './helpers.js';

export const AmmoniaResource: ResourceDefinition<'ammonia'> = {
  key: 'ammonia',
  unit: 'mg',
  bounds: { min: 0, max: 10000 },
  defaultValue: 0,
  precision: 3,
  format: (massInMg: number, waterLiters?: number) => {
    if (!waterLiters || waterLiters <= 0) return '0.000 ppm';
    const ppm = getPpm(massInMg, waterLiters);
    return `${ppm.toFixed(3)} ppm`;
  },
  // Safe/stress ranges expressed in ppm (for UI threshold coloring)
  safeRange: { min: 0, max: 0 },
  stressRange: { min: 0.02, max: 0.05 },
};

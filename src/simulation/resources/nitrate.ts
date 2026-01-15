/**
 * Nitrate resource - NO3 stored as mass in mg.
 * Least toxic nitrogen compound. End product of nitrogen cycle,
 * accumulates over time and removed by plants/water changes.
 *
 * Display shows derived ppm (mass/water), safe/stress ranges are in ppm.
 */

import type { ResourceDefinition } from './types.js';
import { getPpm } from './helpers.js';

export const NitrateResource: ResourceDefinition<'nitrate'> = {
  key: 'nitrate',
  unit: 'mg',
  bounds: { min: 0, max: 100000 },
  defaultValue: 0,
  precision: 1,
  format: (massInMg: number, waterLiters?: number) => {
    if (!waterLiters || waterLiters <= 0) return '0.0 ppm';
    const ppm = getPpm(massInMg, waterLiters);
    return `${ppm.toFixed(1)} ppm`;
  },
  // Safe/stress ranges expressed in ppm (for UI threshold coloring)
  safeRange: { min: 0, max: 20 },
  stressRange: { min: 20, max: 40 },
};

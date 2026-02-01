/**
 * Potassium resource - K stored as mass in mg.
 * Essential plant macronutrient. Only comes from fertilizer (not fish waste).
 *
 * Display shows derived ppm (mass/water), safe/stress ranges are in ppm.
 */

import type { ResourceDefinition } from './types.js';
import { getPpm } from './helpers.js';

export const PotassiumResource: ResourceDefinition<'potassium'> = {
  key: 'potassium',
  unit: 'mg',
  bounds: { min: 0, max: 50000 },
  defaultValue: 0,
  precision: 1,
  format: (massInMg: number, waterLiters?: number) => {
    if (!waterLiters || waterLiters <= 0) return '0.0 ppm';
    const ppm = getPpm(massInMg, waterLiters);
    return `${ppm.toFixed(1)} ppm`;
  },
  // Safe/stress ranges expressed in ppm (for UI threshold coloring)
  // Optimal: 5-20 ppm for planted tanks
  safeRange: { min: 0, max: 20 },
  stressRange: { min: 20, max: 40 },
};

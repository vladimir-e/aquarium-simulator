/**
 * Phosphate resource - PO4 stored as mass in mg.
 * Essential plant macronutrient. Comes from fish waste decay and fertilizer.
 *
 * Display shows derived ppm (mass/water), safe/stress ranges are in ppm.
 */

import type { ResourceDefinition } from './types.js';
import { getPpm } from './helpers.js';

export const PhosphateResource: ResourceDefinition<'phosphate'> = {
  key: 'phosphate',
  unit: 'mg',
  bounds: { min: 0, max: 10000 },
  defaultValue: 0,
  precision: 2,
  format: (massInMg: number, waterLiters?: number) => {
    if (!waterLiters || waterLiters <= 0) return '0.00 ppm';
    const ppm = getPpm(massInMg, waterLiters);
    return `${ppm.toFixed(2)} ppm`;
  },
  // Safe/stress ranges expressed in ppm (for UI threshold coloring)
  // Optimal: 0.5-2 ppm for planted tanks
  safeRange: { min: 0, max: 2 },
  stressRange: { min: 2, max: 5 },
};

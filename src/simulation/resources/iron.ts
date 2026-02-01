/**
 * Iron resource - Fe stored as mass in mg.
 * Essential plant micronutrient. Only comes from fertilizer (not fish waste).
 * Represents all micronutrients for simplified model.
 *
 * Display shows derived ppm (mass/water), safe/stress ranges are in ppm.
 */

import type { ResourceDefinition } from './types.js';
import { getPpm } from './helpers.js';

export const IronResource: ResourceDefinition<'iron'> = {
  key: 'iron',
  unit: 'mg',
  bounds: { min: 0, max: 1000 },
  defaultValue: 0,
  precision: 2,
  format: (massInMg: number, waterLiters?: number) => {
    if (!waterLiters || waterLiters <= 0) return '0.00 ppm';
    const ppm = getPpm(massInMg, waterLiters);
    return `${ppm.toFixed(2)} ppm`;
  },
  // Safe/stress ranges expressed in ppm (for UI threshold coloring)
  // Optimal: 0.1-0.5 ppm for planted tanks
  safeRange: { min: 0, max: 0.5 },
  stressRange: { min: 0.5, max: 1.0 },
};

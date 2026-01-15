/**
 * Nitrite resource - NO2 stored as mass in mg.
 * Toxic to fish (less than ammonia). Intermediate product
 * of nitrogen cycle, consumed by NOB bacteria.
 *
 * Display shows derived ppm (mass/water), safe/stress ranges are in ppm.
 */

import type { ResourceDefinition } from './types.js';
import { getPpm } from './helpers.js';

export const NitriteResource: ResourceDefinition<'nitrite'> = {
  key: 'nitrite',
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
  stressRange: { min: 0.1, max: 0.5 },
};

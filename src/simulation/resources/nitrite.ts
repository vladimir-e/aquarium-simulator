/**
 * Nitrite resource - NO2 concentration in ppm.
 * Toxic to fish - intermediate product in nitrogen cycle.
 */

import type { ResourceDefinition } from './types.js';

export const NitriteResource: ResourceDefinition<'nitrite'> = {
  key: 'nitrite',
  unit: 'ppm',
  bounds: { min: 0, max: 100 },
  defaultValue: 0,
  precision: 3,
  format: (value: number) => `${value.toFixed(3)} ppm`,
  safeRange: { min: 0, max: 0.1 },
  stressRange: { min: 0.1, max: 1 },
};

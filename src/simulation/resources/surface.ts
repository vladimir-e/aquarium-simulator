/**
 * Surface resource - bacteria colonization surface area in cm².
 * Calculated from tank glass + equipment each tick.
 */

import type { ResourceDefinition } from './types.js';

export const SurfaceResource: ResourceDefinition<'surface'> = {
  key: 'surface',
  unit: 'cm²',
  bounds: { min: 0, max: Infinity },
  defaultValue: 0, // Calculated from equipment
  precision: 0,
  format: (value: number) => `${Math.round(value).toLocaleString()} cm²`,
};

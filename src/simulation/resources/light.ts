/**
 * Light resource - illumination power in watts.
 * Calculated from light fixture + schedule each tick.
 */

import type { ResourceDefinition } from './types.js';

export const LightResource: ResourceDefinition<'light'> = {
  key: 'light',
  unit: 'W',
  bounds: { min: 0, max: Infinity },
  defaultValue: 0, // Based on schedule
  precision: 0,
  format: (value: number) => `${Math.round(value)}W`,
};

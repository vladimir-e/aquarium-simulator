/**
 * Light resource - PAR reaching the substrate (µmol/m²/s, 400-700 nm).
 * The fixture's rated surface PAR attenuated through the water column,
 * recalculated from fixture + schedule each tick.
 */

import type { ResourceDefinition } from './types.js';

export const LightResource: ResourceDefinition<'light'> = {
  key: 'light',
  unit: 'PAR',
  bounds: { min: 0, max: Infinity },
  defaultValue: 0, // Based on schedule
  precision: 0,
  format: (value: number) => `${Math.round(value)} PAR`,
};

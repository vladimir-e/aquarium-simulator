/**
 * NOB resource - Nitrite-Oxidizing Bacteria population.
 * Lives on surfaces, converts nitrite to nitrate.
 * Population limited by available surface area.
 */

import type { ResourceDefinition } from './types.js';

export const NobResource: ResourceDefinition<'nob'> = {
  key: 'nob',
  unit: 'units',
  bounds: { min: 0, max: Infinity },
  defaultValue: 0,
  precision: 0,
  format: (value: number) => `${Math.round(value)} units`,
};

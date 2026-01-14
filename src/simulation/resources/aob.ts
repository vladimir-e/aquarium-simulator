/**
 * AOB resource - Ammonia-Oxidizing Bacteria population.
 * Lives on surfaces, converts ammonia to nitrite.
 * Population limited by available surface area.
 */

import type { ResourceDefinition } from './types.js';

export const AobResource: ResourceDefinition<'aob'> = {
  key: 'aob',
  unit: 'units',
  bounds: { min: 0, max: Infinity },
  defaultValue: 0,
  precision: 0,
  format: (value: number) => `${Math.round(value)} units`,
};

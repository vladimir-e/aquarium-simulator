/**
 * AOB resource - Ammonia-Oxidizing Bacteria population.
 * Abstract units representing colony size.
 * Converts ammonia to nitrite.
 */

import type { ResourceDefinition } from './types.js';

export const AOBResource: ResourceDefinition<'aob'> = {
  key: 'aob',
  unit: 'units',
  bounds: { min: 0, max: 1000000 },
  defaultValue: 0,
  precision: 2,
  format: (value: number) => {
    if (value < 1) return value.toFixed(3);
    if (value < 100) return value.toFixed(2);
    if (value < 10000) return value.toFixed(0);
    return `${(value / 1000).toFixed(1)}k`;
  },
};

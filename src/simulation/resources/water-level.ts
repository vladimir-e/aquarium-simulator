/**
 * Water level resource definition.
 */

import type { ResourceDefinition } from './types.js';

export const WaterLevelResource: ResourceDefinition<'waterLevel'> = {
  key: 'waterLevel',
  location: 'tank',
  property: 'waterLevel',
  unit: 'L',
  bounds: {
    min: 0,
    max: Infinity, // Max is tank.capacity, checked dynamically
  },
  defaultValue: 0, // Set to tank capacity on initialization
  precision: 1,
  format: (value: number) => `${value.toFixed(1)}L`,
};

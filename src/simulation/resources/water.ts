/**
 * Water resource - water volume in liters.
 * Max bound is dynamic (tank.capacity), not from this definition.
 */

import type { ResourceDefinition } from './types.js';

export const WaterResource: ResourceDefinition<'water'> = {
  key: 'water',
  unit: 'L',
  bounds: { min: 0, max: Infinity },
  defaultValue: 0, // Set to tank.capacity on init
  precision: 1,
  format: (value: number) => `${value.toFixed(1)}L`,
};

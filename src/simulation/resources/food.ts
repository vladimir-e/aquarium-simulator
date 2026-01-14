/**
 * Food resource - available food in grams.
 */

import type { ResourceDefinition } from './types.js';

export const FoodResource: ResourceDefinition<'food'> = {
  key: 'food',
  unit: 'g',
  bounds: { min: 0, max: 1000 },
  defaultValue: 0,
  precision: 2,
  format: (value: number) => `${value.toFixed(2)}g`,
};

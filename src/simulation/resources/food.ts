/**
 * Food resource - available food in grams.
 */

import type { ResourceDefinition } from './types.js';

export const FoodResource: Pick<ResourceDefinition<'food'>, 'key' | 'unit' | 'precision'> = {
  key: 'food',
  unit: 'g',
  precision: 2,
};

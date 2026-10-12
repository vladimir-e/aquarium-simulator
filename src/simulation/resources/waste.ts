/**
 * Waste resource - organic waste accumulation in grams.
 */

import type { ResourceDefinition } from './types.js';

export const WasteResource: Pick<ResourceDefinition<'waste'>, 'key' | 'unit' | 'precision'> = {
  key: 'waste',
  unit: 'g',
  precision: 2,
};

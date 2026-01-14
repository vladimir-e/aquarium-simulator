/**
 * Waste resource definition.
 */

import type { ResourceDefinition } from './types.js';

export const WasteResource: ResourceDefinition<'waste'> = {
  key: 'waste',
  location: 'resources',
  property: 'waste',
  unit: 'g',
  bounds: {
    min: 0,
    max: 1000,
  },
  defaultValue: 0,
  precision: 2,
  format: (value: number) => `${value.toFixed(2)}g`,
};

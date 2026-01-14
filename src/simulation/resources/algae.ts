/**
 * Algae resource definition.
 */

import type { ResourceDefinition } from './types.js';

export const AlgaeResource: ResourceDefinition<'algae'> = {
  key: 'algae',
  location: 'resources',
  property: 'algae',
  unit: '',
  bounds: {
    min: 0,
    max: 100,
  },
  defaultValue: 0,
  precision: 0,
  format: (value: number) => `${value.toFixed(0)}`,
  safeRange: {
    min: 0,
    max: 50,
  },
  stressRange: {
    min: 50,
    max: 80,
  },
};

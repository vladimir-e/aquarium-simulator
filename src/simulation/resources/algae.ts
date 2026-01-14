/**
 * Algae resource - relative algae coverage (0-100 scale).
 */

import type { ResourceDefinition } from './types.js';

export const AlgaeResource: ResourceDefinition<'algae'> = {
  key: 'algae',
  unit: '',
  bounds: { min: 0, max: 100 },
  defaultValue: 0,
  precision: 0,
  format: (value: number) => `${Math.round(value)}`,
};

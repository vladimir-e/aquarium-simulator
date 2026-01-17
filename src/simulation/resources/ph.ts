/**
 * pH resource - water acidity/alkalinity stored as pH value (0-14 scale).
 *
 * Typical aquarium range is 6.0-8.0. Affected by hardscape (calcite raises,
 * driftwood lowers) and dissolved CO2 (more CO2 = lower pH via carbonic acid).
 * pH blending uses H+ concentration math rather than simple averaging.
 */

import type { ResourceDefinition } from './types.js';

export const PhResource: ResourceDefinition<'ph'> = {
  key: 'ph',
  unit: '',
  bounds: { min: 0, max: 14 },
  defaultValue: 6.5,
  precision: 2,
  format: (value: number) => `${value.toFixed(2)} pH`,
  // Safe range: typical aquarium pH
  safeRange: { min: 6.5, max: 7.5 },
  // Stress range: survivable but outside ideal
  stressRange: { min: 6.0, max: 8.0 },
};

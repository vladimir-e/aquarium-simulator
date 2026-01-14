/**
 * Flow resource - water circulation rate in liters per hour.
 * Calculated from filter + powerhead each tick.
 */

import type { ResourceDefinition } from './types.js';

export const FlowResource: ResourceDefinition<'flow'> = {
  key: 'flow',
  unit: 'L/h',
  bounds: { min: 0, max: Infinity },
  defaultValue: 0, // Calculated from equipment
  precision: 0,
  format: (value: number) => `${Math.round(value)} L/h`,
};

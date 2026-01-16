/**
 * Oxygen resource - dissolved O2 stored as concentration (mg/L).
 *
 * Essential for fish and beneficial bacteria. Healthy levels > 6 mg/L,
 * critical levels < 4 mg/L. Equilibrates toward temperature-dependent
 * saturation via gas exchange.
 */

import type { ResourceDefinition } from './types.js';

export const OxygenResource: ResourceDefinition<'oxygen'> = {
  key: 'oxygen',
  unit: 'mg/L',
  bounds: { min: 0, max: 20 },
  defaultValue: 8.0,
  precision: 1,
  format: (value: number) => `${value.toFixed(1)} mg/L`,
  // Safe range: healthy oxygen levels
  safeRange: { min: 6, max: 14 },
  // Stress range: fish survive but stressed
  stressRange: { min: 4, max: 6 },
};

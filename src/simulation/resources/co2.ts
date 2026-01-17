/**
 * CO2 resource - dissolved carbon dioxide stored as concentration (mg/L).
 *
 * Plants use CO2 for photosynthesis. Atmospheric equilibrium ~3-5 mg/L.
 * Levels > 30 mg/L are harmful to fish. Equilibrates toward atmospheric
 * levels via gas exchange (off-gassing).
 */

import type { ResourceDefinition } from './types.js';

export const Co2Resource: ResourceDefinition<'co2'> = {
  key: 'co2',
  unit: 'mg/L',
  bounds: { min: 0, max: 100 },
  defaultValue: 4.0,
  precision: 1,
  format: (value: number) => `${value.toFixed(1)} mg/L`,
  // Safe range: optimal for planted tanks without harming fish
  safeRange: { min: 10, max: 30 },
  // Stress range: low CO2 (plants struggle) or high (fish stress)
  stressRange: { min: 5, max: 10 },
};

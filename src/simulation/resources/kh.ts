/**
 * Carbonate hardness — alkalinity stored as mass in mg of CaCO3, so a water
 * change dilutes it and evaporation concentrates it. Read as dKH.
 */

import type { ResourceDefinition } from './types.js';
import { getDkh } from './helpers.js';

export const KhResource: ResourceDefinition<'kh'> = {
  key: 'kh',
  unit: 'mg',
  bounds: { min: 0, max: 1000000 },
  defaultValue: 0,
  precision: 0,
  format: (massInMg: number, waterLiters?: number) =>
    `${getDkh(massInMg, waterLiters ?? 0).toFixed(1)} dKH`,
};

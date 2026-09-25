/**
 * General hardness — calcium and magnesium stored as mass in mg of CaCO3, the
 * same convention as KH, so a water change dilutes it and evaporation
 * concentrates it. Read as dGH.
 */

import type { ResourceDefinition } from './types.js';
import { getDgh } from './helpers.js';

export const GhResource: ResourceDefinition<'gh'> = {
  key: 'gh',
  unit: 'mg',
  bounds: { min: 0, max: 1000000 },
  defaultValue: 0,
  precision: 0,
  format: (massInMg: number, waterLiters?: number) =>
    `${getDgh(massInMg, waterLiters ?? 0).toFixed(1)} dGH`,
};

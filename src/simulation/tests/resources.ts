import type { Resources } from '../state.js';
import { carbonateKh } from '../core/carbonate.js';
import { getKhMass } from '../resources/helpers.js';

/** Resource overrides that may name a pH, which lands as the KH that holds it at the fixture's CO₂. */
export type ResourceOverrides = Partial<Resources> & { ph?: number };

export function withPh(base: Resources, { ph, ...overrides }: ResourceOverrides): Resources {
  const resources = { ...base, ...overrides };
  if (ph === undefined) return resources;
  return { ...resources, kh: getKhMass(carbonateKh(resources.co2, ph), resources.water) };
}

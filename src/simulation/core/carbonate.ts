/**
 * pH as the carbonate buffer sets it: the hobby CO₂/KH/pH relation,
 * `CO₂ = 3 × KH × 10^(7 − pH)` — Henderson–Hasselbalch on the bicarbonate
 * pair, read in hobby units.
 */

import type { Resources } from '../state.js';
import { getDkh } from '../resources/helpers.js';

/**
 * Buffering the water carries beyond its carbonate — phosphate, humics — as
 * dKH. What keeps soft water at pH ~5.9 rather than falling without limit.
 */
const BACKGROUND_BUFFER_DKH = 0.1;

/** CO₂ the bicarbonate pool always holds, mg/L: caps pH near 9 when plants strip the free gas. */
const RESIDUAL_CO2 = 0.1;

export function carbonatePh(co2: number, dkh: number): number {
  const acid = Math.max(0, co2) + RESIDUAL_CO2;
  const base = 3 * (Math.max(0, dkh) + BACKGROUND_BUFFER_DKH);
  return 7 - Math.log10(acid / base);
}

/** The tank's pH, derived from the CO₂ and alkalinity it holds right now. */
export function getPh(resources: Pick<Resources, 'co2' | 'kh' | 'water'>): number {
  return carbonatePh(resources.co2, getDkh(resources.kh, resources.water));
}

/** The same relation read the other way: the dKH that holds `ph` at this CO₂, zero where no KH is low enough. */
export function carbonateKh(co2: number, ph: number): number {
  const acid = Math.max(0, co2) + RESIDUAL_CO2;
  return Math.max(0, acid / (3 * Math.pow(10, 7 - ph)) - BACKGROUND_BUFFER_DKH);
}

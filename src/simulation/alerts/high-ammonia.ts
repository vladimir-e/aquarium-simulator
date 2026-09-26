/**
 * High ammonia alert — fires once when free NH₃ crosses `FREE_AMMONIA_EDGE`,
 * resets below it.
 *
 * Free and not total: only the unionized fraction crosses gills, and it moves
 * with pH and temperature, so the same test-kit reading is harmless in soft
 * acidic water and toxic in hard alkaline water.
 */

import type { Alert, AlertResult } from './types.js';
import type { Resources, SimulationState } from '../state.js';
import { getPh } from '../core/carbonate.js';
import { freeAmmoniaPpm, unionizedAmmoniaFraction } from '../systems/nitrogen-cycle.js';
import { FREE_AMMONIA_EDGE } from '../livestock/tolerance.js';
import { ceiled, latch } from './latch.js';

/** The total ammonia (ppm) at which free NH₃ reaches the alert line, at this pH and temperature. */
export function ammoniaAlertLine(
  resources: Pick<Resources, 'temperature' | 'co2' | 'kh' | 'water'>
): number {
  return FREE_AMMONIA_EDGE / unionizedAmmoniaFraction(getPh(resources), resources.temperature);
}

export const highAmmoniaAlert: Alert = {
  id: 'high-ammonia',

  check(state: SimulationState): AlertResult {
    const free = freeAmmoniaPpm(state.resources);
    return latch(
      state,
      'highAmmonia',
      free > FREE_AMMONIA_EDGE,
      'nitrogen-cycle',
      `High ammonia: ${ceiled(free, 3)} ppm free NH₃ - toxic to fish`
    );
  },
};

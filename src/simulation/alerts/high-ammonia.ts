/**
 * High ammonia alert — fires once when free NH₃ crosses its edge, ahead of
 * every fish's own, and resets below it.
 *
 * Free and not total: only the unionized fraction crosses gills, and it moves
 * with pH and temperature, so the same test-kit reading is harmless in soft
 * acidic water and toxic in hard alkaline water.
 */

import type { Alert, AlertResult } from './types.js';
import type { Resources, SimulationState } from '../state.js';
import { createLog } from '../core/logging.js';
import { getPh } from '../core/carbonate.js';
import { freeAmmoniaPpm, unionizedAmmoniaFraction } from '../systems/nitrogen-cycle.js';
import { FREE_AMMONIA_EDGE } from '../livestock/tolerance.js';

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

    if (free <= FREE_AMMONIA_EDGE) {
      return { log: null, alertState: { highAmmonia: false } };
    }
    if (state.alertState.highAmmonia) {
      return { log: null, alertState: { highAmmonia: true } };
    }
    return {
      log: createLog(
        state.tick,
        'nitrogen-cycle',
        'warning',
        `High ammonia: ${free.toFixed(3)} ppm free NH₃ - toxic to fish`
      ),
      alertState: { highAmmonia: true },
    };
  },
};

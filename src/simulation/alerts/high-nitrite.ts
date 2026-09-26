/**
 * High nitrite alert — fires once when nitrite crosses `NITRITE_EDGE`, resets
 * below it.
 */

import type { Alert, AlertResult } from './types.js';
import type { SimulationState } from '../state.js';
import { getPpm } from '../resources/index.js';
import { NITRITE_EDGE } from '../livestock/tolerance.js';
import { ceiled, latch } from './latch.js';

export const highNitriteAlert: Alert = {
  id: 'high-nitrite',

  check(state: SimulationState): AlertResult {
    const ppm = getPpm(state.resources.nitrite, state.resources.water);
    return latch(
      state,
      'highNitrite',
      ppm > NITRITE_EDGE,
      'nitrogen-cycle',
      `High nitrite level: ${ceiled(ppm, 3)} ppm - toxic to fish`
    );
  },
};

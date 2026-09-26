/**
 * High nitrate alert — fires once when nitrate crosses `NITRATE_EDGE`, resets
 * below it.
 */

import type { Alert, AlertResult } from './types.js';
import type { SimulationState } from '../state.js';
import { getPpm } from '../resources/index.js';
import { NITRATE_EDGE } from '../livestock/tolerance.js';
import { ceiled, latch } from './latch.js';

export const highNitrateAlert: Alert = {
  id: 'high-nitrate',

  check(state: SimulationState): AlertResult {
    const ppm = getPpm(state.resources.nitrate, state.resources.water);
    return latch(
      state,
      'highNitrate',
      ppm > NITRATE_EDGE,
      'nitrogen-cycle',
      `High nitrate level: ${ceiled(ppm, 1)} ppm - consider water change`
    );
  },
};

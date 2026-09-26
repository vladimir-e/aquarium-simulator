/**
 * Low oxygen alert — fires once when oxygen drops below `OXYGEN_EDGE`, resets
 * at or above it.
 */

import type { Alert, AlertResult } from './types.js';
import type { SimulationState } from '../state.js';
import { OXYGEN_EDGE } from '../livestock/tolerance.js';
import { floored, latch } from './latch.js';

export const lowOxygenAlert: Alert = {
  id: 'low-oxygen',

  check(state: SimulationState): AlertResult {
    const oxygen = state.resources.oxygen;
    return latch(
      state,
      'lowOxygen',
      oxygen < OXYGEN_EDGE,
      'gas-exchange',
      `Low oxygen level: ${floored(oxygen, 1)} mg/L - critical for fish`
    );
  },
};

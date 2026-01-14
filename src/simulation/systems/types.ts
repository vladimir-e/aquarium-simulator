/**
 * System interface for core simulation systems.
 */

import type { Effect, EffectTier } from '../core/effects.js';
import type { SimulationState } from '../state.js';

export interface System {
  /** Unique identifier for this system */
  id: string;
  /** Which tier this system runs in */
  tier: EffectTier;
  /** Generate effects based on current state */
  update(state: SimulationState): Effect[];
}

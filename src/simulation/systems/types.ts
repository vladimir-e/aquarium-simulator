/**
 * System interface for core simulation systems.
 */

import type { Effect, EffectTier } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import type { TunableConfig } from '../config/index.js';

export interface System {
  /** Unique identifier for this system */
  id: string;
  /** Which tier this system runs in */
  tier: EffectTier;
  /** Generate effects based on current state and config */
  update(state: SimulationState, config: TunableConfig): Effect[];
}

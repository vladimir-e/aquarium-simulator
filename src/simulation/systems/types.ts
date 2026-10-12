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
  /** mg of O2 it draws over the hour on water the hour leaves at `oxygen` mg/L. */
  oxygenDraw?: (state: SimulationState, oxygen: number, config: TunableConfig) => number;
  /** Generate effects based on current state and config, on the oxygen its tier's draws leave */
  update(state: SimulationState, config: TunableConfig, oxygen: number): Effect[];
}

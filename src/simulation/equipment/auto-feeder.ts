/**
 * Auto feeder — drops a set ration into the tank once a day, at its hour.
 */

import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';

export interface AutoFeeder {
  enabled: boolean;
  /** Grams of food each feeding drops. */
  amount: number;
  /** Hour of the day it feeds at, 0–23. */
  startHour: number;
}

export const DEFAULT_AUTO_FEEDER: AutoFeeder = {
  enabled: false,
  amount: 0.1,
  startHour: 9,
};

export const FEED_AMOUNT_OPTIONS = [0.05, 0.1, 0.2, 0.3, 0.5, 1.0, 2.0] as const;

export const MIN_FEED_G = 0.05;
export const MAX_FEED_G = 2.0;

/** The food effect of this hour's feeding, if the feeder is on and it is the hour. */
export function autoFeederUpdate(state: SimulationState): Effect[] {
  const { autoFeeder } = state.equipment;
  if (!autoFeeder.enabled || state.tick % 24 !== autoFeeder.startHour) return [];
  return [{ tier: 'active', resource: 'food', delta: autoFeeder.amount, source: 'auto-feeder' }];
}

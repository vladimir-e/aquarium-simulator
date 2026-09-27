/**
 * Auto feeder — drops a set ration into the tank once a day, at the hour its
 * schedule starts.
 */

import { produce } from 'immer';
import type { Effect } from '../core/effects.js';
import type { SimulationState } from '../state.js';
import type { DailySchedule } from '../core/schedule.js';

export interface AutoFeeder {
  enabled: boolean;
  /** Grams of food each feeding drops. */
  amount: number;
  /** Feeds at `startHour`; the duration is unused. */
  schedule: DailySchedule;
}

export const DEFAULT_AUTO_FEEDER: AutoFeeder = {
  enabled: false,
  amount: 0.1,
  schedule: { startHour: 9, duration: 1 },
};

export const FEED_AMOUNT_OPTIONS = [0.05, 0.1, 0.2, 0.3, 0.5, 1.0, 2.0] as const;

export const MIN_FEED_G = 0.05;
export const MAX_FEED_G = 2.0;

export function shouldFeed(hourOfDay: number, schedule: DailySchedule): boolean {
  return hourOfDay === schedule.startHour;
}

/** The food effect of this hour's feeding, if the feeder is on and it is the hour. */
export function autoFeederUpdate(state: SimulationState): Effect[] {
  const { autoFeeder } = state.equipment;
  if (!autoFeeder.enabled || !shouldFeed(state.tick % 24, autoFeeder.schedule)) return [];
  return [{ tier: 'active', resource: 'food', delta: autoFeeder.amount, source: 'auto-feeder' }];
}

export function applyAutoFeederSettings(
  state: SimulationState,
  updates: Partial<AutoFeeder>
): SimulationState {
  return produce(state, (draft) => {
    const feeder = draft.equipment.autoFeeder;
    if (updates.enabled !== undefined) feeder.enabled = updates.enabled;
    if (updates.amount !== undefined) feeder.amount = Math.max(MIN_FEED_G, Math.min(MAX_FEED_G, updates.amount));
    if (updates.schedule !== undefined) feeder.schedule = updates.schedule;
  });
}

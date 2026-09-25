import type { Action, SimulationState } from '../../simulation/index.js';

export interface Routine {
  /** Grams a day, or `'stock'` to feed a share of the fish mass in the tank that morning. */
  feed: number | 'stock';
  topOff: boolean;
  /** Fraction of the water swapped weekly; 0 skips it. */
  waterChange: number;
  /** ml of all-in-one fertilizer after the weekly change; 0 skips it. */
  dose: number;
  scrapeAlgae: boolean;
  /** Weekly trim target size, or null to never trim. */
  trimTo: number | null;
}

/** Hobby rule of thumb: 1–3 % of body mass a day. */
export const FEED_SHARE_OF_STOCK = 0.02;

const MORNING = 9;
const WEEKLY_HOUR = 11;
const WEEKLY_DAY = 6;

export function stockFeed(state: SimulationState): number {
  const mass = state.fish.reduce((sum, fish) => sum + fish.mass, 0);
  return Math.round(mass * FEED_SHARE_OF_STOCK * 100) / 100;
}

/** The chores due before the tick that starts at `state.tick`. */
export function chores(routine: Routine, state: SimulationState): Action[] {
  const hour = state.tick % 24;
  const day = Math.floor(state.tick / 24);
  const actions: Action[] = [];

  if (hour === MORNING) {
    if (routine.topOff) actions.push({ type: 'topOff' });
    const grams = routine.feed === 'stock' ? stockFeed(state) : routine.feed;
    if (grams > 0) actions.push({ type: 'feed', amount: grams });
  }

  if (hour === WEEKLY_HOUR && day % 7 === WEEKLY_DAY) {
    if (routine.waterChange > 0) actions.push({ type: 'waterChange', amount: routine.waterChange });
    if (routine.dose > 0 && state.plants.length > 0) actions.push({ type: 'dose', amountMl: routine.dose });
    if (routine.scrapeAlgae && state.algae.mass >= 5) actions.push({ type: 'scrubAlgae' });
    if (routine.trimTo !== null) actions.push({ type: 'trimPlants', targetSize: routine.trimTo });
  }

  return actions;
}

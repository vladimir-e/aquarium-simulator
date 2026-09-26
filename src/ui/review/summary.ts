/**
 * The run summary: what this run recorded, from the run aggregates alone —
 * nothing here re-counts the engine. The counts and the transcript are the same
 * run's: every path that rebaselines the aggregates replaces the log in the
 * same commit.
 */

import type { RunAggregates } from '../run/index.js';
import { formatVolume, type UnitSystem } from '../utils/units.js';
import { formatElapsed } from '../utils/clock.js';

export type TallyId = 'deaths' | 'births' | 'alerts' | 'water';

/** What the run cost, in the order History lays it out. */
export const TALLY_ORDER: readonly TallyId[] = ['deaths', 'births', 'alerts', 'water'];

export interface Tally {
  label: string;
  value: string;
}

export function runTallies(aggregates: RunAggregates, units: UnitSystem): Record<TallyId, Tally> {
  return {
    deaths: { label: 'deaths', value: String(aggregates.deaths) },
    births: { label: 'births', value: String(aggregates.births) },
    alerts: { label: 'alerts', value: String(aggregates.alerts) },
    water: { label: 'water changed', value: formatVolume(aggregates.waterChangedL, units, 0) },
  };
}

/**
 * How long this run is — what it recorded rather than the tank's age: a restored
 * save opens with an empty history buffer and has nothing to draw however old it
 * is.
 */
export function runLength(aggregates: RunAggregates): string {
  const { ticks } = aggregates;
  if (ticks === 0) return '0 ticks';
  return `${ticks} ${ticks === 1 ? 'tick' : 'ticks'} · ${formatElapsed(ticks)}`;
}

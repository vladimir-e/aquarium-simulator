/**
 * Run aggregates for the Review summary tiles. Counts are folded from log
 * entries as they're appended (deaths/births/fry-sold/alerts) plus water
 * changed, accumulated at action dispatch. Session-scoped; reset with the run.
 */

import type { LogEntry } from '../../simulation/index.js';

export interface RunAggregates {
  /** Ticks (simulated hours) elapsed since the run began. */
  ticks: number;
  deaths: number;
  /** Fry added to the tank: live births plus hatched eggs. */
  births: number;
  frySold: number;
  alerts: number;
  waterChangedL: number;
}

export function emptyAggregates(): RunAggregates {
  return { ticks: 0, deaths: 0, births: 0, frySold: 0, alerts: 0, waterChangedL: 0 };
}

/** Organisms a lifecycle entry accounts for (defaults to one per entry). */
function entryCount(log: LogEntry): number {
  return log.count ?? 1;
}

/**
 * Fold newly appended log entries into the aggregates. Lifecycle events are
 * counted by their `event` discriminator; any other warning-severity entry
 * (e.g. a chemistry threshold crossing or a plant death) counts as an alert.
 */
export function accrueLogs(aggregates: RunAggregates, logs: LogEntry[]): RunAggregates {
  let { deaths, births, frySold, alerts } = aggregates;
  for (const log of logs) {
    if (log.event === 'fish-died') {
      deaths += entryCount(log);
    } else if (log.event === 'fish-spawned' || log.event === 'eggs-hatched') {
      births += entryCount(log);
    } else if (log.event === 'fry-sold') {
      frySold += entryCount(log);
    } else if (log.severity === 'warning') {
      alerts += 1;
    }
  }
  return { ...aggregates, deaths, births, frySold, alerts };
}

/** Advance the run length by the given number of ticks. */
export function accrueTicks(aggregates: RunAggregates, ticks: number): RunAggregates {
  if (ticks <= 0) return aggregates;
  return { ...aggregates, ticks: aggregates.ticks + ticks };
}

/** Record water replaced by a dispatched water-change action, in liters. */
export function accrueWaterChanged(aggregates: RunAggregates, liters: number): RunAggregates {
  if (liters <= 0) return aggregates;
  return { ...aggregates, waterChangedL: aggregates.waterChangedL + liters };
}

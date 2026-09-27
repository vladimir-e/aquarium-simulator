/**
 * Run aggregates for the History tallies. Counts are folded from log
 * entries as they're appended (deaths/births/alerts) plus water changed,
 * accumulated at action dispatch. Session-scoped; reset with the run.
 */

import type { LogEntry } from '../../simulation/index.js';
import { isReported } from './flora.js';

export interface RunAggregates {
  /** Ticks (simulated hours) elapsed since the run began. */
  ticks: number;
  /** What the tank lost: fish, plant units, and blooms there was any of to see. */
  deaths: number;
  /** What the tank added to itself: fry born live or hatched, and plant offshoots. */
  births: number;
  alerts: number;
  waterChangedL: number;
}

export function emptyAggregates(): RunAggregates {
  return { ticks: 0, deaths: 0, births: 0, alerts: 0, waterChangedL: 0 };
}

/** Organisms a lifecycle entry accounts for (defaults to one per entry). */
function entryCount(log: LogEntry): number {
  return log.count ?? 1;
}

/**
 * Fold newly appended log entries into the aggregates, as the console reports
 * them. Lifecycle events are counted by their `event` discriminator; any other
 * warning-severity entry (a chemistry threshold crossing) counts as an alert.
 */
export function accrueLogs(aggregates: RunAggregates, logs: LogEntry[]): RunAggregates {
  let { deaths, births, alerts } = aggregates;
  for (const log of logs.filter(isReported)) {
    if (log.event === 'fish-died' || log.event === 'plant-died' || log.event === 'algae-died') {
      deaths += entryCount(log);
    } else if (
      log.event === 'fish-spawned' ||
      log.event === 'eggs-hatched' ||
      log.event === 'plant-propagated'
    ) {
      births += entryCount(log);
    } else if (log.event === undefined && log.severity === 'warning') {
      alerts += 1;
    }
  }
  return { ...aggregates, deaths, births, alerts };
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

/**
 * The run summary, derived once. The Analytics tiles render these and the index
 * rail's Analytics row reads the same list, so the rail and the stage cannot
 * quote different run lengths. Every figure is a run aggregate or a tick read
 * off the log that produced it — nothing here re-counts the engine.
 */

import type { LogEntry } from '../../simulation/index.js';
import type { RunAggregates } from '../run/index.js';
import { formatVolume, type UnitSystem } from '../utils/units.js';
import { formatElapsed } from '../utils/clock.js';
import { type AlertKind, latestAlert } from './category.js';

export type SummaryTileId = 'run' | 'deaths' | 'births' | 'alerts' | 'water';

/** Left-to-right on the stage, top-to-bottom in the mobile pill row. */
export const SUMMARY_ORDER: readonly SummaryTileId[] = [
  'run',
  'deaths',
  'births',
  'alerts',
  'water',
];

export interface SummaryTile {
  label: string;
  value: string;
  unit?: string;
  /** Sub-line under the figure. */
  meta?: string;
  /** The tick the meta names, when there is one to scrub to. */
  metaTick?: number;
  /** Alert kind chip beside the figure. */
  alert?: AlertKind;
  /** Unit word for the rail and the mobile pill: `39 ticks`, `1 death`. */
  descriptor: string;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** Tick of the last entry carrying this lifecycle event, or null. */
function lastEventTick(logs: LogEntry[], event: LogEntry['event']): number | null {
  for (let i = logs.length - 1; i >= 0; i--) {
    if (logs[i].event === event) return logs[i].tick;
  }
  return null;
}

export function runSummary(
  aggregates: RunAggregates,
  logs: LogEntry[],
  units: UnitSystem
): Record<SummaryTileId, SummaryTile> {
  const alert = aggregates.alerts > 0 ? latestAlert(logs) : null;
  const lastDeath = aggregates.deaths > 0 ? lastEventTick(logs, 'fish-died') : null;

  return {
    run: {
      label: 'run length',
      value: String(aggregates.ticks),
      unit: 'ticks',
      meta: formatElapsed(aggregates.ticks),
      descriptor: plural(aggregates.ticks, 'tick', 'ticks'),
    },
    deaths: {
      label: 'deaths',
      value: String(aggregates.deaths),
      meta: lastDeath === null ? undefined : `last T${lastDeath}`,
      metaTick: lastDeath ?? undefined,
      descriptor: plural(aggregates.deaths, 'death', 'deaths'),
    },
    births: {
      label: 'births',
      value: String(aggregates.births),
      unit: 'fry',
      meta: aggregates.frySold > 0 ? `${aggregates.frySold} sold` : undefined,
      descriptor: 'fry',
    },
    alerts: {
      label: 'alerts',
      value: String(aggregates.alerts),
      alert: alert?.kind,
      meta: alert === null ? undefined : `latest T${alert.tick}`,
      metaTick: alert?.tick,
      descriptor: plural(aggregates.alerts, 'alert', 'alerts'),
    },
    water: {
      label: 'water changed',
      value: formatVolume(aggregates.waterChangedL, units, 0),
      descriptor: 'changed',
    },
  };
}

function phrase(tile: SummaryTile): string {
  return `${tile.value} ${tile.descriptor}`;
}

/**
 * The run in two lines — how long it is, then what it cost. The rail's row and
 * the Analytics header both read these, so they cannot quote different runs.
 * Both count what this run recorded rather than the tank's age: a restored save
 * opens with an empty history buffer and has nothing to draw however old it is.
 */
export function summaryLines(
  aggregates: RunAggregates,
  logs: LogEntry[],
  units: UnitSystem
): string[] {
  if (aggregates.ticks === 0) return ['0 ticks', 'no history yet'];
  const tiles = runSummary(aggregates, logs, units);
  return [
    `${phrase(tiles.run)} · ${tiles.run.meta}`,
    [tiles.alerts, tiles.deaths, tiles.births].map(phrase).join(' · '),
  ];
}

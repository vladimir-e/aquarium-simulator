import { useMemo } from 'react';
import type { LogEntry } from '../../simulation/index.js';
import {
  alertMarkers,
  categorizeLog,
  photoperiodSpans,
  sliceHistory,
  sliceLogs,
  snapshotAtTick,
  trackLines,
  windowRange,
  type AlertMark,
  type ReviewWindow,
  type TickRange,
  type TickSpan,
  type TrackDef,
  type TrackLine,
} from '../review';
import type { RunSnapshot } from '../run';
import { useScrub, type Scrub } from './useScrub';

export interface Timeline {
  /** The span every surface measures itself against, or null on an empty buffer. */
  range: TickRange | null;
  /** Tick of each sample, sharing its index with every line's values. */
  ticks: number[];
  /**
   * The lines of the tracks asked for, by track id — derived on the first ask
   * and held for as long as the window holds. A collapsed spine never asks,
   * and a pair of tracks pays for two.
   */
  lines: (defs: TrackDef[]) => Record<string, TrackLine[]>;
  lit: TickSpan[];
  /** Ticks the keeper acted on. */
  actions: number[];
  alerts: AlertMark[];
  /** The log lines the window holds. */
  logs: LogEntry[];
  /** The snapshot the playhead stands on, where the window holds one. */
  snapshot: RunSnapshot | null;
  scrub: Scrub;
}

/**
 * One derivation of the timeline, so the spine and History cannot draw the same
 * run two ways. The window decides the span — the buffer's last snapshot is the
 * live edge everywhere, and an empty buffer claims nothing — and everything the
 * tracks, the axis and the transcript read comes off it.
 *
 * The axis costs a tick; a track costs a pass over the whole window, and the
 * spine is mounted under every route whether or not it is drawn. So `lines` is
 * the one thing this does not compute up front: the surface names the tracks it
 * draws, and pays for those.
 */
export function useTimeline(
  history: RunSnapshot[],
  logs: LogEntry[],
  window: ReviewWindow
): Timeline {
  const slice = useMemo(() => sliceHistory(history, window), [history, window]);
  const range = useMemo(() => windowRange(history, window), [history, window]);
  const scrub = useScrub(range);

  const ticks = useMemo(() => slice.map((snapshot) => snapshot.tick), [slice]);
  const lines = useMemo(() => {
    const derived = new Map<string, TrackLine[]>();
    return (defs: TrackDef[]): Record<string, TrackLine[]> =>
      Object.fromEntries(
        defs.map((def) => {
          const held = derived.get(def.id) ?? trackLines(slice, def);
          derived.set(def.id, held);
          return [def.id, held];
        })
      );
  }, [slice]);
  const lit = useMemo(() => photoperiodSpans(slice), [slice]);

  const windowLogs = useMemo(() => sliceLogs(logs, range), [logs, range]);
  const actions = useMemo(
    () => [
      ...new Set(windowLogs.filter((log) => categorizeLog(log) === 'user').map((log) => log.tick)),
    ],
    [windowLogs]
  );
  const alerts = useMemo(() => alertMarkers(windowLogs, range), [windowLogs, range]);

  return {
    range,
    ticks,
    lines,
    lit,
    actions,
    alerts,
    logs: windowLogs,
    snapshot: snapshotAtTick(slice, scrub.at),
    scrub,
  };
}

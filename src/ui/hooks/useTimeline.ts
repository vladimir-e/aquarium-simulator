import { useMemo } from 'react';
import type { DailySchedule, LogEntry } from '../../simulation/index.js';
import {
  alertMarkers,
  categorizeLog,
  photoperiodSpans,
  sliceHistory,
  sliceLogs,
  snapshotAtTick,
  trackLines,
  windowRange,
  TRACKS,
  type AlertMark,
  type ReviewWindow,
  type TickRange,
  type TickSpan,
  type TrackLine,
} from '../review';
import type { RunSnapshot } from '../run';
import { useScrub, type Scrub } from './useScrub';

export interface Timeline {
  /** The span every surface measures itself against, or null on an empty buffer. */
  range: TickRange | null;
  /** Tick of each sample, sharing its index with every line's values. */
  ticks: number[];
  /** The window's lines, by track id. */
  lines: Record<string, TrackLine[]>;
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
 */
export function useTimeline(
  history: RunSnapshot[],
  logs: LogEntry[],
  window: ReviewWindow,
  schedule: DailySchedule | null
): Timeline {
  const slice = useMemo(() => sliceHistory(history, window), [history, window]);
  const range = useMemo(() => windowRange(history, window), [history, window]);
  const scrub = useScrub(range);

  const ticks = useMemo(() => slice.map((snapshot) => snapshot.tick), [slice]);
  const lines = useMemo(
    () => Object.fromEntries(TRACKS.map((def) => [def.id, trackLines(slice, def)])),
    [slice]
  );
  const lit = useMemo(() => photoperiodSpans(range, schedule), [range, schedule]);

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

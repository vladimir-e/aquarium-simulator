import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import type { DailySchedule, LogEntry } from '../../../simulation/index.js';
import {
  alertMarkers,
  categorizeLog,
  photoperiodSpans,
  snapshotAtTick,
  trackLines,
  TRACKS,
  TRACK_PAIRS,
  type TickRange,
  type TrackDef,
} from '../../review';
import type { RunSnapshot } from '../../run';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { useScrub } from '../../hooks/useScrub';
import { useSpineOpen } from '../../hooks/useSpineOpen';
import { useUnits } from '../../hooks/useUnits';
import { Track, TrackCaption, TimeAxis } from '../review/Track';
import { Segmented } from '../ui/Segmented';
import { dayNumber } from '../../utils/clock';

const PAIR_OPTIONS = TRACK_PAIRS.map((pair) => ({ value: pair.id, label: pair.label }));

interface SpineProps {
  history: RunSnapshot[];
  logs: LogEntry[];
  /** The live edge. */
  tick: number;
  /** The fixture's hours, where one is running — the band behind the tracks. */
  schedule: DailySchedule | null;
}

/**
 * Where the run is, along the whole run. Collapsed it is an axis: day ticks,
 * the alerts the tank hit, the actions taken on it, and the playhead. Expanded
 * it grows the four tracks above that axis, so the same drag that says *when*
 * also says *what the tank was doing then*. The playhead is the review layer's
 * `?tick=`, so wherever the reader is standing the spine and History are
 * parked on the same tick, and back walks out of a scrub.
 */
export function Spine({ history, logs, tick, schedule }: SpineProps): React.JSX.Element {
  const [open, toggle] = useSpineOpen();
  const isMobile = useIsMobile();
  const { displayTemp } = useUnits();
  const [pairId, setPairId] = useState(TRACK_PAIRS[0].id);
  const [params] = useSearchParams();

  const range: TickRange = { minTick: history[0]?.tick ?? 0, maxTick: tick };
  const axis = useScrub(range, 'Run timeline');
  const tracks = useScrub(range, 'Timeline charts');

  const actions = useMemo(
    () => [...new Set(logs.filter((log) => categorizeLog(log) === 'user').map((log) => log.tick))],
    [logs]
  );
  const alerts = useMemo(() => alertMarkers(logs, range), [logs, range.minTick, range.maxTick]);
  const lit = useMemo(() => photoperiodSpans(range, schedule), [range.minTick, range.maxTick, schedule]);

  const shown: TrackDef[] = isMobile
    ? (TRACK_PAIRS.find((pair) => pair.id === pairId) ?? TRACK_PAIRS[0]).tracks
    : TRACKS;
  const ticks = history.map((snapshot) => snapshot.tick);
  const snapshot = snapshotAtTick(history, axis.at);

  return (
    <div
      className={`flex flex-col border-t border-hairline ${open ? 'h-40 max-md:h-[120px]' : 'h-8 max-md:h-6'}`}
    >
      {open && (
        <div
          {...tracks.surface}
          className="flex min-h-0 flex-1 cursor-ew-resize touch-none flex-col gap-1.5 px-3 pt-1 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          {isMobile && (
            <Segmented
              ariaLabel="Tracks"
              options={PAIR_OPTIONS}
              value={pairId}
              onChange={setPairId}
              className="shrink-0 self-start"
            />
          )}
          {shown.map((def) => {
            const lines = trackLines(history, def);
            return (
              <div key={def.id} className="flex min-h-0 flex-1 flex-col gap-0.5">
                <TrackCaption
                  def={def}
                  lines={lines}
                  snapshot={snapshot}
                  displayTemp={displayTemp}
                  className="shrink-0"
                />
                <Track
                  lines={lines}
                  ticks={ticks}
                  range={range}
                  lit={lit}
                  at={axis.at}
                  label={def.title}
                  className="min-h-0 flex-1"
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="flex h-8 shrink-0 items-center gap-3 px-3 text-[11px] text-ink-3 max-md:h-6 max-md:gap-2">
        <span className="tabular-nums">Day {dayNumber(range.minTick)}</span>

        <div
          {...axis.surface}
          className="relative h-3.5 flex-1 cursor-ew-resize touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <TimeAxis
            range={range}
            actions={actions}
            alerts={alerts}
            at={axis.at}
            parked={axis.parked !== null}
          />
        </div>

        <span className="tabular-nums">Day {dayNumber(range.maxTick)}</span>

        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex shrink-0 items-center gap-1 text-ink-2 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          charts
        </button>

        <Link
          to={{ pathname: '/history', search: params.toString() }}
          className="shrink-0 text-ink-2 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-md:hidden"
        >
          history
        </Link>
      </div>
    </div>
  );
}

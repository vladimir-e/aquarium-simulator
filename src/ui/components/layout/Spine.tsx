import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import type { DailySchedule, LogEntry } from '../../../simulation/index.js';
import { DEFAULT_WINDOW, TRACKS, TRACK_PAIRS, type TrackDef } from '../../review';
import type { RunSnapshot } from '../../run';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { useSpineOpen } from '../../hooks/useSpineOpen';
import { useTimeline } from '../../hooks/useTimeline';
import { useUnits } from '../../hooks/useUnits';
import { Track, TrackCaption, TimeAxis } from '../review/Track';
import { Segmented } from '../ui/Segmented';
import { dayNumber } from '../../utils/clock';
import { CONTROL_FOCUS, INSET_FOCUS } from '../ui/focus';

const PAIR_OPTIONS = TRACK_PAIRS.map((pair) => ({ value: pair.id, label: pair.label }));

const HISTORY_PATH = '/history';

interface SpineProps {
  history: RunSnapshot[];
  logs: LogEntry[];
  /** The fixture's hours, where one is running — the band behind the tracks. */
  schedule: DailySchedule | null;
}

/**
 * Where the run is, along the whole run. Collapsed it is an axis: day ticks,
 * the alerts the tank hit, the actions taken on it, and the playhead. Expanded
 * it grows the four tracks above that axis, so the same drag that says *when*
 * also says *what the tank was doing then* — except on History, which is
 * already those tracks at full height. The playhead is the review layer's
 * `?tick=`, so wherever the reader is standing the spine and History are
 * parked on the same tick, and back walks out of a scrub.
 */
export function Spine({ history, logs, schedule }: SpineProps): React.JSX.Element {
  const [open, toggle] = useSpineOpen();
  const isMobile = useIsMobile();
  const { displayTemp } = useUnits();
  const [pairId, setPairId] = useState(TRACK_PAIRS[0].id);
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const expanded = open && pathname !== HISTORY_PATH;

  const { range, ticks, lines, lit, actions, alerts, snapshot, scrub } = useTimeline(
    history,
    logs,
    DEFAULT_WINDOW,
    schedule
  );

  const shown: TrackDef[] = isMobile
    ? (TRACK_PAIRS.find((pair) => pair.id === pairId) ?? TRACK_PAIRS[0]).tracks
    : TRACKS;

  return (
    <div
      className={`flex flex-col gap-0.5 border-t border-hairline px-3 py-0.5 ${expanded ? 'h-40 max-md:h-[120px]' : 'h-8 max-md:h-7'}`}
    >
      {expanded && isMobile && (
        <Segmented
          ariaLabel="Tracks"
          options={PAIR_OPTIONS}
          value={pairId}
          onChange={setPairId}
          className="shrink-0 self-start"
        />
      )}

      {expanded && (
        <div
          {...scrub.surface('Timeline charts')}
          className={`flex min-h-0 flex-1 cursor-ew-resize touch-none flex-col gap-1.5 ${INSET_FOCUS}`}
        >
          {shown.map((def) => (
            <div key={def.id} className="flex min-h-0 flex-1 flex-col gap-0.5">
              <TrackCaption
                def={def}
                lines={lines[def.id]}
                snapshot={snapshot}
                displayTemp={displayTemp}
                className="shrink-0"
              />
              <Track
                lines={lines[def.id]}
                ticks={ticks}
                range={range}
                lit={lit}
                at={scrub.at}
                label={def.title}
                className="min-h-0 flex-1"
              />
            </div>
          ))}
        </div>
      )}

      {/* The axis spans the same width as the tracks, so one tick is one x. */}
      <div
        {...scrub.surface('Run timeline')}
        className={`shrink-0 cursor-ew-resize touch-none ${CONTROL_FOCUS}`}
      >
        <TimeAxis
          range={range}
          actions={actions}
          alerts={alerts}
          at={scrub.at}
          parked={scrub.parked !== null}
        />
      </div>

      <div className="flex shrink-0 items-center gap-3 text-[11px] leading-[14px] text-ink-3">
        {range && (
          <>
            <span className="tabular-nums max-md:hidden">Day {dayNumber(range.minTick)}</span>
            <span className="flex-1" />
            <span className="tabular-nums max-md:hidden">Day {dayNumber(range.maxTick)}</span>
          </>
        )}
        {!range && <span className="flex-1" />}

        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={`flex shrink-0 items-center gap-1 text-ink-2 transition-colors hover:text-ink ${CONTROL_FOCUS}`}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          charts
        </button>

        <Link
          to={{ pathname: HISTORY_PATH, search: params.toString() }}
          aria-label="History module"
          className={`shrink-0 text-ink-2 transition-colors hover:text-ink ${CONTROL_FOCUS} max-md:hidden`}
        >
          history
        </Link>
      </div>
    </div>
  );
}

import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { ModulePage } from '../components/layout/ModulePage';
import { LogLane } from '../components/review/LogLane';
import { TimeAxis, TrackStack } from '../components/review/Track';
import { Segmented } from '../components/ui/Segmented';
import { useIsMobile } from '../hooks/useMediaQuery';
import type { useSimulation } from '../hooks/useSimulation';
import { useTimeline } from '../hooks/useTimeline';
import { useUnits } from '../hooks/useUnits';
import { dayNumber } from '../utils/clock';
import { CONTROL_FOCUS } from '../components/ui/focus';
import {
  nextScrubPosition,
  readFilter,
  readTick,
  readWindow,
  runSummary,
  summaryLines,
  windowRange,
  DEFAULT_FILTER,
  DEFAULT_WINDOW,
  LOG_PARAM,
  REVIEW_WINDOWS,
  TICK_PARAM,
  TRACKS,
  WINDOW_LABEL,
  WINDOW_PARAM,
  type ReviewWindow,
  type SummaryTileId,
} from '../review';

const WINDOW_OPTIONS = REVIEW_WINDOWS.map((value) => ({ value, label: WINDOW_LABEL[value] }));

/** What the run cost, beside the transcript that recorded it. */
const TALLIES: SummaryTileId[] = ['deaths', 'births', 'alerts', 'water'];

/**
 * The spine at full height. The four tracks are the stage, the transcript reads
 * beside them, and both stand on the one parked tick — dragging a track, or
 * tapping a line in the log, moves the same `?tick=` the spine writes, so the
 * page and the strip at the foot of every other screen are never apart.
 */
export function HistorySection({
  sim,
}: {
  sim: ReturnType<typeof useSimulation>;
}): React.JSX.Element {
  const { displayTemp, unitSystem } = useUnits();
  const isMobile = useIsMobile();
  const [params] = useSearchParams();

  const reviewWindow = readWindow(params.get(WINDOW_PARAM));
  const filter = readFilter(params.get(LOG_PARAM));

  const timeline = useTimeline(sim.history, sim.state.logs, reviewWindow);
  const { range, actions, alerts, logs, scrub } = timeline;

  const tallies = runSummary(sim.aggregates, sim.state.logs, unitSystem);

  /**
   * Resolve the cursor against the window it is about to land in, so the URL
   * and the playhead agree in the same render — a tick that predates a
   * narrower window clamps to its oldest snapshot rather than lingering.
   */
  const changeWindow = (next: ReviewWindow): void => {
    const landing =
      scrub.parked === null
        ? null
        : readTick(String(scrub.parked), windowRange(sim.history, next));
    scrub.write(
      {
        [WINDOW_PARAM]: next === DEFAULT_WINDOW ? null : next,
        [TICK_PARAM]: landing === null ? null : String(landing),
      },
      'commit'
    );
  };

  return (
    <ModulePage
      title="History"
      meta={summaryLines(sim.aggregates, sim.state.logs, unitSystem)[0]}
      fills={!isMobile}
      actions={
        <Segmented
          ariaLabel="Time window"
          options={WINDOW_OPTIONS}
          value={reviewWindow}
          onChange={changeWindow}
        />
      }
    >
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:h-full md:min-h-0 md:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-2 md:min-h-0">
          <TrackStack
            timeline={timeline}
            defs={TRACKS}
            label="History timeline"
            displayTemp={displayTemp}
            extents={!isMobile}
            layout="page"
          />

          {/* The axis spans the same width as the tracks, so one tick is one x. */}
          <div
            {...scrub.surface('History axis')}
            className={`shrink-0 cursor-ew-resize touch-none ${CONTROL_FOCUS}`}
          >
            <TimeAxis
              range={range}
              actions={actions}
              alerts={alerts}
              at={scrub.at}
              parked={scrub.parked !== null}
            />
            {range && (
              <div className="flex justify-between text-[11px] leading-[14px] text-ink-3">
                <span className="tabular-nums">Day {dayNumber(range.minTick)}</span>
                <span className="tabular-nums">Day {dayNumber(range.maxTick)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 md:min-h-0 md:border-l md:border-hairline md:pl-4">
          <div className="flex shrink-0 flex-wrap items-baseline gap-x-5 gap-y-1">
            {TALLIES.map((id) => (
              <span key={id} className="inline-flex items-baseline gap-1.5">
                <span className="text-[16px] font-medium leading-5 tabular-nums text-ink">
                  {tallies[id].value}
                </span>
                {tallies[id].unit && (
                  <span className="text-[11px] text-ink-3">{tallies[id].unit}</span>
                )}
                <span className="text-[13px] text-ink-2">{tallies[id].label}</span>
              </span>
            ))}
          </div>

          <LogLane
            logs={logs}
            filter={filter}
            onFilter={(next) =>
              scrub.write({ [LOG_PARAM]: next === DEFAULT_FILTER ? null : next }, 'commit')
            }
            at={scrub.at}
            onPark={(tick) => scrub.park(nextScrubPosition(tick, range), 'commit')}
            className="max-md:h-[360px] md:min-h-0 md:flex-1"
          />
        </div>
      </div>
    </ModulePage>
  );
}

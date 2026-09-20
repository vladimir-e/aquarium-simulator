import React, { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ModulePage } from '../components/layout/ModulePage';
import { LogLane } from '../components/review/LogLane';
import { Track, TrackCaption, TimeAxis } from '../components/review/Track';
import { Segmented } from '../components/ui/Segmented';
import { useIsMobile } from '../hooks/useMediaQuery';
import { useScrub } from '../hooks/useScrub';
import type { useSimulation } from '../hooks/useSimulation';
import { useUnits } from '../hooks/useUnits';
import { dayNumber } from '../utils/clock';
import {
  alertMarkers,
  categorizeLog,
  nextScrubPosition,
  photoperiodSpans,
  readFilter,
  readTick,
  readWindow,
  runSummary,
  sliceHistory,
  sliceLogs,
  snapshotAtTick,
  summaryLines,
  trackLines,
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

  const logs = sim.state.logs;
  const history = useMemo(
    () => sliceHistory(sim.history, reviewWindow),
    [sim.history, reviewWindow]
  );
  const range = useMemo(() => windowRange(sim.history, reviewWindow), [sim.history, reviewWindow]);
  const scrub = useScrub(range, 'History timeline');

  const windowLogs = useMemo(() => sliceLogs(logs, range), [logs, range]);
  const alerts = useMemo(() => alertMarkers(logs, range), [logs, range]);
  const actions = useMemo(
    () => [
      ...new Set(windowLogs.filter((log) => categorizeLog(log) === 'user').map((log) => log.tick)),
    ],
    [windowLogs]
  );

  const light = sim.state.equipment.light;
  const lit = useMemo(
    () => photoperiodSpans(range, light.enabled ? light.schedule : null),
    [range, light.enabled, light.schedule]
  );

  const ticks = history.map((snapshot) => snapshot.tick);
  const snapshot = snapshotAtTick(history, scrub.at);
  const tallies = runSummary(sim.aggregates, logs, unitSystem);

  /**
   * A `?tick=` the window cannot honour resolves to something else — its oldest
   * snapshot, or the live edge — and the address has to follow, or a cold deep
   * link leaves the URL naming a tick the playhead is not on.
   */
  const raw = params.get(TICK_PARAM);
  useEffect(() => {
    const resolved = scrub.parked === null ? null : String(scrub.parked);
    if (raw !== resolved) scrub.park(scrub.parked, 'resolve');
  }, [raw, scrub]);

  /**
   * Resolve the cursor against the window it is about to land in, so the URL
   * and the playhead agree in the same render — a tick that predates a
   * narrower window clamps to its oldest snapshot rather than lingering.
   */
  const changeWindow = (next: ReviewWindow): void => {
    const landing = scrub.parked === null ? null : readTick(String(scrub.parked), windowRange(sim.history, next));
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
      meta={summaryLines(sim.aggregates, logs, unitSystem)[0]}
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
          <div
            {...scrub.surface}
            className="flex cursor-ew-resize touch-none flex-col gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:min-h-0 md:flex-1"
          >
            {TRACKS.map((def) => {
              const lines = trackLines(history, def);
              return (
                <div key={def.id} className="flex flex-col gap-1 max-md:h-24 md:min-h-0 md:flex-1">
                  <TrackCaption
                    def={def}
                    lines={lines}
                    snapshot={snapshot}
                    displayTemp={displayTemp}
                    extents
                    className="shrink-0"
                  />
                  <Track
                    lines={lines}
                    ticks={ticks}
                    range={range}
                    lit={lit}
                    at={scrub.at}
                    label={def.title}
                    className="min-h-0 flex-1"
                  />
                </div>
              );
            })}
          </div>

          <div className="flex shrink-0 items-center gap-3 text-[11px] text-ink-3">
            <span className="tabular-nums">Day {range ? dayNumber(range.minTick) : 1}</span>
            <div className="relative h-3.5 flex-1">
              <TimeAxis
                range={range}
                actions={actions}
                alerts={alerts}
                at={scrub.at}
                parked={scrub.parked !== null}
              />
            </div>
            <span className="tabular-nums">Day {range ? dayNumber(range.maxTick) : 1}</span>
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
            logs={windowLogs}
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

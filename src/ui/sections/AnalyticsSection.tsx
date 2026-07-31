import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { useSimulation } from '../hooks/useSimulation';
import { useTheme } from '../hooks/useTheme';
import { useUnits } from '../hooks/useUnits';
import { useIsMobile } from '../hooks/useMediaQuery';
import { Stage } from '../components/layout/Stage';
import { Segmented } from '../components/ui/Segmented';
import { SummaryTiles } from '../components/review/SummaryTiles';
import { ReviewLogPanel } from '../components/review/ReviewLogPanel';
import { Chart } from '../components/review/Chart';
import { TickScrubber } from '../components/review/TickScrubber';
import {
  type AnalyticsView,
  type ChartDef,
  type ReviewWindow,
  type ScrubIntent,
  CHART_PARAM,
  LOG_PARAM,
  REVIEW_CHARTS,
  REVIEW_WINDOWS,
  TICK_PARAM,
  WINDOW_LABEL,
  WINDOW_PARAM,
  alertMarkers,
  nextScrubPosition,
  readChart,
  readFilter,
  readTick,
  readWindow,
  sliceHistory,
  sliceLogs,
  summaryLines,
  viewParams,
  windowRange,
} from '../review/index.js';

const WINDOW_OPTIONS = REVIEW_WINDOWS.map((value) => ({ value, label: WINDOW_LABEL[value] }));
const CHART_CHIP_OPTIONS = REVIEW_CHARTS.map((chart) => ({ value: chart.id, label: chart.shortLabel }));

function queryOf(view: AnalyticsView): string {
  return new globalThis.URLSearchParams(viewParams(view)).toString();
}

/**
 * Charts, the log, and the scrubber share one tick cursor, and that cursor is
 * the URL — every parked tick is a link, and back walks out of a scrub rather
 * than out of the app. Only history is read here, so scrubbing never touches
 * the sim, which may still be running (the transport stays live in the rail).
 */
export function AnalyticsSection({
  sim,
}: {
  sim: ReturnType<typeof useSimulation>;
}): React.JSX.Element {
  const { resolvedTheme } = useTheme();
  const { displayTemp, unitSystem } = useUnits();
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();

  const reviewWindow = readWindow(params.get(WINDOW_PARAM));
  const filter = readFilter(params.get(LOG_PARAM));
  const activeChart = readChart(params.get(CHART_PARAM));

  const logs = sim.runLogs;
  const windowHistory = useMemo(
    () => sliceHistory(sim.history, reviewWindow),
    [sim.history, reviewWindow]
  );
  const range = useMemo(() => windowRange(sim.history, reviewWindow), [sim.history, reviewWindow]);
  const runRange = useMemo(() => windowRange(sim.history, 'run'), [sim.history]);
  const windowLogs = useMemo(() => sliceLogs(logs, range), [logs, range]);
  const marks = useMemo(() => alertMarkers(logs, range), [logs, range]);

  const rawTick = params.get(TICK_PARAM);
  const scrubTick = readTick(rawTick, range);
  const currentTick = range ? (scrubTick ?? range.maxTick) : 0;

  /**
   * Whether the cursor was parked as of the last write rather than the last
   * render: a drag issues several scrubs per frame, and reading that off
   * `scrubTick` would let every one of them push its own back entry.
   */
  const parkedRef = useRef(false);
  parkedRef.current = scrubTick !== null;

  const setView = useCallback(
    (patch: Partial<AnalyticsView>, intent: ScrubIntent): void => {
      const view: AnalyticsView = {
        window: reviewWindow,
        filter,
        tick: scrubTick,
        chart: activeChart.id,
      };
      const next = { ...view, ...patch };
      if (queryOf(next) === queryOf(view)) return;
      const replace = intent === 'adjust' && parkedRef.current;
      parkedRef.current = next.tick !== null;
      setParams(queryOf(next), { replace });
    },
    [reviewWindow, filter, scrubTick, activeChart, setParams]
  );

  /**
   * A `?tick=` the window cannot honour resolves to something else — its oldest
   * snapshot, or the live edge — and the address has to follow, or a cold deep
   * link leaves the URL naming a tick the handle is not on.
   */
  useEffect(() => {
    if (rawTick === (scrubTick === null ? null : String(scrubTick))) return;
    setParams(queryOf({ window: reviewWindow, filter, tick: scrubTick, chart: activeChart.id }), {
      replace: true,
    });
  }, [rawTick, scrubTick, reviewWindow, filter, activeChart, setParams]);

  const scrub = useCallback(
    (tick: number, intent: ScrubIntent): void => {
      setView({ tick: nextScrubPosition(tick, range) }, intent);
    },
    [range, setView]
  );

  /**
   * Resolve the cursor against the window it is about to land in, so the URL
   * and the handle agree in the same render — a tick that predates a narrower
   * window clamps to its oldest snapshot rather than lingering in the address.
   */
  const changeWindow = useCallback(
    (next: ReviewWindow): void => {
      const nextRange = windowRange(sim.history, next);
      const tick = scrubTick === null ? null : readTick(String(scrubTick), nextRange);
      setView({ window: next, tick }, 'commit');
    },
    [sim.history, scrubTick, setView]
  );

  /**
   * The tiles count the whole run, so the tick they name can predate a bounded
   * window — widen back to the buffer rather than land somewhere else. A tick
   * older than the buffer never reaches here: the tile stops offering it.
   */
  const scrubToRunTick = useCallback(
    (tick: number): void => {
      if (range !== null && tick >= range.minTick) {
        setView({ tick: nextScrubPosition(tick, range) }, 'commit');
        return;
      }
      setView({ window: 'run', tick: nextScrubPosition(tick, runRange) }, 'commit');
    },
    [range, runRange, setView]
  );

  const renderChart = (chart: ChartDef): React.JSX.Element => (
    <Chart
      key={chart.id}
      def={chart}
      history={windowHistory}
      range={range}
      currentTick={currentTick}
      theme={resolvedTheme}
      markers={marks.filter((m) => chart.alertKinds.includes(m.kind))}
      onScrubToTick={(tick) => scrub(tick, 'adjust')}
      displayTemp={displayTemp}
    />
  );

  const logPanel = (
    <ReviewLogPanel
      windowLogs={windowLogs}
      filter={filter}
      onFilterChange={(next) => setView({ filter: next }, 'commit')}
      currentTick={currentTick}
      onScrubToTick={(tick) => scrub(tick, 'commit')}
    />
  );

  return (
    <Stage
      title="Analytics"
      meta={summaryLines(sim.aggregates, logs, unitSystem).join(' · ')}
      actions={
        <Segmented
          ariaLabel="Time window"
          options={WINDOW_OPTIONS}
          value={reviewWindow}
          onChange={changeWindow}
        />
      }
      fills
      footer={
        <TickScrubber
          range={range}
          currentTick={currentTick}
          following={scrubTick === null}
          markers={marks}
          onScrub={scrub}
        />
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-2.5">
        <SummaryTiles
          aggregates={sim.aggregates}
          logs={logs}
          reachable={runRange}
          onScrubToTick={scrubToRunTick}
        />

        {isMobile ? (
          <>
            <Segmented
              ariaLabel="Chart"
              options={CHART_CHIP_OPTIONS}
              value={activeChart.id}
              onChange={(id) => setView({ chart: id }, 'commit')}
              fill
            />
            <div className="h-[190px] shrink-0">{renderChart(activeChart)}</div>
          </>
        ) : (
          <div className="grid shrink-0 grid-cols-2 grid-rows-[repeat(2,154px)] gap-2.5">
            {REVIEW_CHARTS.map(renderChart)}
          </div>
        )}

        <div className="min-h-0 flex-1">{logPanel}</div>
      </div>
    </Stage>
  );
}

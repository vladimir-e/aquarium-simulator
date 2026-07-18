import React, { useCallback, useMemo, useState } from 'react';
import type { useSimulation } from '../hooks/useSimulation';
import { useTheme } from '../hooks/useTheme';
import { useUnits } from '../hooks/useUnits';
import { useIsMobile } from '../hooks/useMediaQuery';
import { Segmented } from '../components/ui/Segmented';
import { SummaryTiles } from '../components/review/SummaryTiles';
import { ReviewLogPanel } from '../components/review/ReviewLogPanel';
import { Chart } from '../components/review/Chart';
import { TickScrubber } from '../components/review/TickScrubber';
import {
  type ReviewWindow,
  type LogFilter,
  type ChartDef,
  REVIEW_WINDOWS,
  REVIEW_CHARTS,
  sliceHistory,
  windowRange,
  sliceLogs,
  clampTick,
  nextScrubPosition,
  alertMarkers,
} from '../review/index.js';

const WINDOW_LABEL: Record<ReviewWindow, string> = {
  run: 'this run',
  '24h': '24h',
  '7d': '7d',
};
const WINDOW_OPTIONS = REVIEW_WINDOWS.map((value) => ({ value, label: WINDOW_LABEL[value] }));
const CHART_CHIP_OPTIONS = REVIEW_CHARTS.map((chart) => ({ value: chart.id, label: chart.shortLabel }));

interface ReviewModeProps {
  sim: ReturnType<typeof useSimulation>;
}

/**
 * Review closes the loop: fast-forward in Run, then scrub the whole run here.
 * Charts, the log, and the scrubber share one tick timeline — click a log line
 * or an alert marker and the handle jumps; drag the handle and both follow. The
 * scrubber only reads history, so scrubbing never mutates the sim (which may
 * still be running — the transport stays live in the header).
 */
export function ReviewMode({ sim }: ReviewModeProps): React.JSX.Element {
  const { resolvedTheme } = useTheme();
  const { displayTemp } = useUnits();
  const isMobile = useIsMobile();
  const [window, setWindow] = useState<ReviewWindow>('run');
  const [filter, setFilter] = useState<LogFilter>('all');
  const [chartId, setChartId] = useState<string>(REVIEW_CHARTS[0].id);
  // null follows the live edge; a number parks the scrubber at that tick.
  const [scrubTick, setScrubTick] = useState<number | null>(null);

  const logs = sim.state.logs;
  const windowHistory = useMemo(() => sliceHistory(sim.history, window), [sim.history, window]);
  const range = useMemo(() => windowRange(sim.history, window), [sim.history, window]);
  const windowLogs = useMemo(() => sliceLogs(logs, range), [logs, range]);
  const marks = useMemo(() => alertMarkers(logs, range), [logs, range]);

  const currentTick = range ? clampTick(scrubTick ?? range.maxTick, range.minTick, range.maxTick) : 0;

  const handleScrub = useCallback(
    (tick: number): void => {
      setScrubTick(nextScrubPosition(tick, range));
    },
    [range]
  );

  const handleWindowChange = useCallback((next: ReviewWindow): void => {
    setWindow(next);
    setScrubTick(null);
  }, []);

  const renderChart = (chart: ChartDef): React.JSX.Element => (
    <Chart
      key={chart.id}
      def={chart}
      history={windowHistory}
      range={range}
      currentTick={currentTick}
      theme={resolvedTheme}
      markers={marks.filter((m) => chart.alertKinds.includes(m.kind))}
      onScrubToTick={handleScrub}
      displayTemp={displayTemp}
    />
  );

  const activeChart = REVIEW_CHARTS.find((c) => c.id === chartId) ?? REVIEW_CHARTS[0];

  const logPanel = (
    <ReviewLogPanel
      windowLogs={windowLogs}
      allLogs={logs}
      filter={filter}
      onFilterChange={setFilter}
      currentTick={currentTick}
      onScrubToTick={handleScrub}
    />
  );

  return (
    <div>
      <div className="space-y-4 px-4 pt-4 pb-4">
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="min-w-0 sm:flex-1">
            <SummaryTiles aggregates={sim.aggregates} logs={logs} />
          </div>
          <Segmented
            ariaLabel="Time window"
            options={WINDOW_OPTIONS}
            value={window}
            onChange={handleWindowChange}
          />
        </div>

        {isMobile ? (
          <div className="space-y-4">
            <Segmented
              ariaLabel="Chart"
              options={CHART_CHIP_OPTIONS}
              value={chartId}
              onChange={setChartId}
            />
            {renderChart(activeChart)}
            {logPanel}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            {logPanel}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{REVIEW_CHARTS.map(renderChart)}</div>
          </div>
        )}
      </div>

      <TickScrubber range={range} currentTick={currentTick} onScrubToTick={handleScrub} />
    </div>
  );
}

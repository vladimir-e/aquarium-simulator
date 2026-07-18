import React, { useCallback, useMemo, useState } from 'react';
import type { useSimulation } from '../hooks/useSimulation';
import { useTheme } from '../hooks/useTheme';
import { Segmented } from '../components/ui/Segmented';
import { SummaryTiles } from '../components/review/SummaryTiles';
import { ReviewLogPanel } from '../components/review/ReviewLogPanel';
import { Chart } from '../components/review/Chart';
import { TickScrubber } from '../components/review/TickScrubber';
import {
  type ReviewWindow,
  type LogFilter,
  REVIEW_WINDOWS,
  REVIEW_CHARTS,
  sliceHistory,
  windowRange,
  sliceLogs,
  clampTick,
  alertMarkers,
} from '../review/index.js';

const WINDOW_LABEL: Record<ReviewWindow, string> = {
  run: 'this run',
  '24h': '24h',
  '7d': '7d',
};
const WINDOW_OPTIONS = REVIEW_WINDOWS.map((value) => ({ value, label: WINDOW_LABEL[value] }));

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
  const [window, setWindow] = useState<ReviewWindow>('run');
  const [filter, setFilter] = useState<LogFilter>('all');
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
      // Landing on the live edge re-engages follow, so the run keeps growing under the handle.
      setScrubTick(range && tick >= range.maxTick ? null : tick);
    },
    [range]
  );

  const handleWindowChange = useCallback((next: ReviewWindow): void => {
    setWindow(next);
    setScrubTick(null);
  }, []);

  return (
    <div>
      <div className="space-y-4 px-4 pt-4 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <SummaryTiles aggregates={sim.aggregates} logs={logs} />
          </div>
          <Segmented
            ariaLabel="Time window"
            options={WINDOW_OPTIONS}
            value={window}
            onChange={handleWindowChange}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <ReviewLogPanel
            windowLogs={windowLogs}
            allLogs={logs}
            filter={filter}
            onFilterChange={setFilter}
            currentTick={currentTick}
            onScrubToTick={handleScrub}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {REVIEW_CHARTS.map((chart) => (
              <Chart
                key={chart.id}
                def={chart}
                history={windowHistory}
                range={range}
                currentTick={currentTick}
                theme={resolvedTheme}
                markers={marks.filter((m) => chart.alertKinds.includes(m.kind))}
                onScrubToTick={handleScrub}
              />
            ))}
          </div>
        </div>
      </div>

      <TickScrubber range={range} currentTick={currentTick} onScrubToTick={handleScrub} />
    </div>
  );
}

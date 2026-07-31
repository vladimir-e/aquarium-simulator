import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SummaryTiles } from './SummaryTiles';
import { UnitsProvider, useUnits, type UnitSystem } from '../../hooks/useUnits';
import { PersistenceProvider } from '../../persistence/index.js';
import type { RunAggregates } from '../../run/index.js';
import { createLog, type LogEntry } from '../../../simulation/index.js';
import { formatVolume } from '../../utils/units';

afterEach(cleanup);

function renderTiles(
  aggregates: RunAggregates,
  logs: LogEntry[],
  onScrubToTick = vi.fn()
): ReturnType<typeof vi.fn> {
  render(
    <PersistenceProvider>
      <UnitsProvider>
        <SummaryTiles aggregates={aggregates} logs={logs} onScrubToTick={onScrubToTick} />
      </UnitsProvider>
    </PersistenceProvider>
  );
  return onScrubToTick;
}

const base: RunAggregates = { ticks: 36, deaths: 0, births: 100, frySold: 0, alerts: 1, waterChangedL: 0 };

const ammoniaWarning = (tick: number): LogEntry =>
  createLog(tick, 'nitrogen-cycle', 'warning', 'High ammonia level: 0.109 ppm - toxic to fish');

describe('SummaryTiles', () => {
  // The desktop tiles and the mobile pill row both render (CSS hides one per
  // viewport), so a stat's text can appear in both — assert presence, not count.
  it('shows the five headline stats with an honest deaths label', () => {
    renderTiles(base, []);
    for (const label of ['run length', 'deaths', 'births', 'alerts', 'water changed']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText('36').length).toBeGreaterThan(0);
    expect(screen.getAllByText('100').length).toBeGreaterThan(0);
    expect(screen.getAllByText('fry').length).toBeGreaterThan(0);
  });

  it('renders run length as a compact d/h reading', () => {
    renderTiles(base, []);
    expect(screen.getByText('1d 12h')).toBeTruthy();
  });

  it('drops the empty part of the duration reading', () => {
    renderTiles({ ...base, ticks: 12 }, []);
    expect(screen.getByText('12h')).toBeTruthy();
    cleanup();
    renderTiles({ ...base, ticks: 48 }, []);
    expect(screen.getByText('2d')).toBeTruthy();
  });

  it('chips the latest alert type next to the alert count', () => {
    renderTiles(base, [ammoniaWarning(36)]);
    expect(screen.getAllByText('NH₃').length).toBeGreaterThan(0);
  });

  it('omits the alert chip when nothing has fired', () => {
    renderTiles({ ...base, alerts: 0 }, []);
    expect(screen.queryByText('NH₃')).toBeNull();
  });

  it('suppresses a stale alert chip after a preset switch zeroes the count', () => {
    // loadPreset resets aggregates but retains logs; a pre-run warning must not
    // chip next to "alerts 0".
    renderTiles({ ...base, alerts: 0 }, [ammoniaWarning(36)]);
    expect(screen.queryByText('NH₃')).toBeNull();
  });

  it('parks the cursor on the tick the latest alert names', () => {
    const onScrubToTick = renderTiles(base, [ammoniaWarning(21), ammoniaWarning(29)]);
    fireEvent.click(screen.getByRole('button', { name: 'latest T29' }));
    expect(onScrubToTick).toHaveBeenCalledWith(29);
  });

  it('names the tick of the last death, not of the last log', () => {
    const logs = [
      createLog(8, 'livestock', 'warning', 'Neon Tetra died', 'fish-died'),
      createLog(19, 'livestock', 'warning', 'Neon Tetra died', 'fish-died'),
      createLog(30, 'user', 'info', 'Fed 0.5 g'),
    ];
    const onScrubToTick = renderTiles({ ...base, deaths: 2 }, logs);
    fireEvent.click(screen.getByRole('button', { name: 'last T19' }));
    expect(onScrubToTick).toHaveBeenCalledWith(19);
  });

  it('states the water changed in the reader’s own units', () => {
    let system: UnitSystem = 'metric';
    function Probe(): null {
      system = useUnits().unitSystem;
      return null;
    }
    render(
      <PersistenceProvider>
        <UnitsProvider>
          <Probe />
          <SummaryTiles
            aggregates={{ ...base, waterChangedL: 340 }}
            logs={[]}
            onScrubToTick={vi.fn()}
          />
        </UnitsProvider>
      </PersistenceProvider>
    );
    // Whichever system the app is on, the tile must speak it — not a constant.
    expect(screen.getAllByText(formatVolume(340, system, 0)).length).toBeGreaterThan(0);
  });
});

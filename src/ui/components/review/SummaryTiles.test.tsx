import { useEffect } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SummaryTiles } from './SummaryTiles';
import { UnitsProvider, useUnits, type UnitSystem } from '../../hooks/useUnits';
import { PersistenceProvider } from '../../persistence/index.js';
import type { TickRange } from '../../review/index.js';
import type { RunAggregates } from '../../run/index.js';
import { createLog, type LogEntry } from '../../../simulation/index.js';

afterEach(() => {
  globalThis.localStorage.clear();
  cleanup();
});

/** The whole run is still in the buffer unless a test says otherwise. */
const ALL: TickRange = { minTick: 0, maxTick: 40 };

function ForceUnits({ system }: { system: UnitSystem }): null {
  const { setUnitSystem } = useUnits();
  useEffect(() => setUnitSystem(system), [system, setUnitSystem]);
  return null;
}

function renderTiles(
  aggregates: RunAggregates,
  logs: LogEntry[],
  options: { reachable?: TickRange | null; units?: UnitSystem } = {}
): ReturnType<typeof vi.fn> {
  const onScrubToTick = vi.fn();
  render(
    <PersistenceProvider>
      <UnitsProvider>
        {options.units && <ForceUnits system={options.units} />}
        <SummaryTiles
          aggregates={aggregates}
          logs={logs}
          reachable={options.reachable === undefined ? ALL : options.reachable}
          onScrubToTick={onScrubToTick}
        />
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

  it('states a tick the buffer has dropped without offering to scrub to it', () => {
    renderTiles(base, [ammoniaWarning(29)], { reachable: { minTick: 100, maxTick: 820 } });
    expect(screen.getByText('latest T29')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'latest T29' })).toBeNull();
  });

  it('offers nothing to scrub to before the run has any history', () => {
    renderTiles(base, [ammoniaWarning(29)], { reachable: null });
    expect(screen.getByText('latest T29')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'latest T29' })).toBeNull();
  });

  it('states the water changed in the reader’s own units', () => {
    renderTiles({ ...base, waterChangedL: 340 }, [], { units: 'imperial' });
    expect(screen.getAllByText('90 gal').length).toBeGreaterThan(0);
    expect(screen.queryByText('340 L')).toBeNull();
  });
});

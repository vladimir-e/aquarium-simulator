import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SummaryTiles } from './SummaryTiles';
import { UnitsProvider } from '../../hooks/useUnits';
import { PersistenceProvider } from '../../persistence/index.js';
import type { RunAggregates } from '../../run/index.js';
import { createLog, type LogEntry } from '../../../simulation/index.js';

afterEach(cleanup);

function renderTiles(aggregates: RunAggregates, logs: LogEntry[]): void {
  render(
    <PersistenceProvider>
      <UnitsProvider>
        <SummaryTiles aggregates={aggregates} logs={logs} />
      </UnitsProvider>
    </PersistenceProvider>
  );
}

const base: RunAggregates = { ticks: 36, deaths: 0, births: 100, frySold: 0, alerts: 1, waterChangedL: 0 };

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
    const logs = [createLog(36, 'nitrogen-cycle', 'warning', 'High ammonia level: 0.109 ppm - toxic to fish')];
    renderTiles(base, logs);
    expect(screen.getAllByText('NH₃').length).toBeGreaterThan(0);
  });

  it('omits the alert chip when nothing has fired', () => {
    renderTiles({ ...base, alerts: 0 }, []);
    expect(screen.queryByText('NH₃')).toBeNull();
  });

  it('suppresses a stale alert chip after a preset switch zeroes the count', () => {
    // loadPreset resets aggregates but retains logs; a pre-run warning must not
    // chip next to "alerts 0".
    const logs = [createLog(36, 'nitrogen-cycle', 'warning', 'High ammonia level: 0.109 ppm - toxic to fish')];
    renderTiles({ ...base, alerts: 0 }, logs);
    expect(screen.queryByText('NH₃')).toBeNull();
  });
});

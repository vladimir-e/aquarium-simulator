import React from 'react';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { AnalyticsSection } from './AnalyticsSection';
import { ThemeProvider } from '../hooks/useTheme';
import { UnitsProvider } from '../hooks/useUnits';
import { PersistenceProvider } from '../persistence/index.js';
import { snapshotFromState } from '../run/index.js';
import { createSimulation, createLog, type SimulationState } from '../../simulation/index.js';
import type { useSimulation } from '../hooks/useSimulation';
import { stubMatchMedia, viewport, type MatchMediaStub } from '../test/matchMedia';
import { bandsOf, isRigid, pinnedPx } from '../test/layout';

function fakeSim(): ReturnType<typeof useSimulation> {
  const base: SimulationState = createSimulation({ tankCapacity: 40 });
  const history = Array.from({ length: 40 }, (_, tick) => snapshotFromState({ ...base, tick }));
  const logs = [
    createLog(0, 'simulation', 'info', 'created'),
    createLog(36, 'nitrogen-cycle', 'warning', 'High ammonia level: 0.109 ppm'),
  ];
  const state: SimulationState = { ...base, tick: 39, logs };
  return {
    state,
    history,
    aggregates: { ticks: 39, deaths: 0, births: 100, frySold: 0, alerts: 1, waterChangedL: 0 },
    runLogs: logs,
  } as unknown as ReturnType<typeof useSimulation>;
}

/** Reports the query string, and drives history the way the back gesture does. */
function Address(): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <span data-testid="search">{location.search}</span>
      <button type="button" onClick={() => navigate(-1)}>
        test-back
      </button>
    </>
  );
}

function renderAnalytics(path = '/analytics'): void {
  render(
    <ThemeProvider>
      <PersistenceProvider>
        <UnitsProvider>
          <MemoryRouter initialEntries={[path]}>
            <AnalyticsSection sim={fakeSim()} />
            <Address />
          </MemoryRouter>
        </UnitsProvider>
      </PersistenceProvider>
    </ThemeProvider>
  );
}

function search(): string {
  return screen.getByTestId('search').textContent ?? '';
}

let media: MatchMediaStub;

beforeEach(() => {
  media = stubMatchMedia(viewport(390));
});

afterEach(() => {
  media.restore();
  cleanup();
});

describe('AnalyticsSection (mobile)', () => {
  it('shows one chart at a time and swaps it via the chart chips', () => {
    renderAnalytics();
    // Default chip: the nitrogen-cycle chart.
    expect(screen.getByText('Nitrogen cycle')).toBeTruthy();
    expect(screen.queryByText('pH & CO₂')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'pH·CO₂' }));
    expect(screen.getByText('pH & CO₂')).toBeTruthy();
    expect(screen.queryByText('Nitrogen cycle')).toBeNull();
  });

  it('keeps the scrubber pinned in the mobile layout', () => {
    renderAnalytics();
    expect(screen.getByRole('slider')).toBeTruthy();
  });

  /**
   * On a phone the chip is the only thing choosing what you are looking at, so
   * it is a view like the window and the cursor: addressable, and back walks
   * out of it rather than out of the app.
   */
  it('parks the chosen chart in the URL, and back returns to the last one', () => {
    renderAnalytics();
    expect(search()).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'pH·CO₂' }));
    expect(search()).toBe('?chart=ph-co2');

    fireEvent.click(screen.getByRole('button', { name: 'test-back' }));
    expect(search()).toBe('');
    expect(screen.getByText('Nitrogen cycle')).toBeTruthy();
  });

  it('opens on the chart a deep link names', () => {
    renderAnalytics('/analytics?chart=o2-temp');
    expect(screen.getByText('O₂, temp & level')).toBeTruthy();
    expect(screen.queryByText('Nitrogen cycle')).toBeNull();
  });

  /**
   * A phone has less height than the bands' floors add up to, so the section
   * scrolls — but the log arrives at a readable size rather than crushed to a
   * row, and the chart above it is the band that yields on the way there.
   */
  it('floors the log here too, and keeps the chart above it yielding', () => {
    renderAnalytics();
    const log = screen.getByText('Log').closest('section')!.parentElement as HTMLElement;
    const chart = screen.getByText('Nitrogen cycle').closest('section')!
      .parentElement as HTMLElement;
    const column = log.parentElement as HTMLElement;

    expect(pinnedPx(log, 'min-h')).toBeGreaterThanOrEqual(200);
    expect(pinnedPx(chart, 'basis')!).toBeGreaterThan(pinnedPx(chart, 'min-h')!);
    for (const band of bandsOf(column).slice(0, -1)) expect(isRigid(band)).toBe(false);
    expect(column.parentElement!.className).toContain('overflow-y-auto');
  });
});

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
import { stubMatchMedia, type MatchMediaStub } from '../test/matchMedia';

let media: MatchMediaStub;

afterEach(() => {
  media.restore();
  cleanup();
});

function fakeSim(): ReturnType<typeof useSimulation> {
  const base: SimulationState = createSimulation({ tankCapacity: 40 });
  const history = Array.from({ length: 40 }, (_, tick) => snapshotFromState({ ...base, tick }));
  const logs = [
    createLog(0, 'simulation', 'info', 'created'),
    createLog(5, 'livestock', 'warning', 'Neon Tetra died', 'fish-died'),
    createLog(31, 'user', 'info', 'added Neon Tetra'),
    createLog(36, 'nitrogen-cycle', 'warning', 'High ammonia level: 0.109 ppm'),
  ];
  const state: SimulationState = { ...base, tick: 39, logs };
  return {
    state,
    history,
    aggregates: { ticks: 39, deaths: 1, births: 100, frySold: 0, alerts: 1, waterChangedL: 0 },
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

function back(): void {
  fireEvent.click(screen.getByRole('button', { name: 'test-back' }));
}

function slider(): HTMLElement {
  return screen.getByRole('slider');
}

function cursor(): string {
  return slider().getAttribute('aria-valuenow') ?? '';
}

// Pin the desktop layout (not mobile) so the four-chart grid is deterministic.
beforeEach(() => {
  media = stubMatchMedia(false);
});

describe('AnalyticsSection', () => {
  it('mounts the summary, all four charts, the log, and the scrubber', () => {
    renderAnalytics();
    expect(screen.getAllByText('run length').length).toBeGreaterThan(0);
    for (const title of ['Nitrogen cycle', 'pH & CO₂', 'O₂ / temp', 'Population & growth']) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(screen.getByText('Log')).toBeTruthy();
    expect(slider()).toBeTruthy();
  });

  it('scopes the scrubber domain to the selected window', () => {
    renderAnalytics();
    expect(slider().getAttribute('aria-valuemin')).toBe('0');

    fireEvent.click(screen.getByRole('button', { name: '24h' }));
    // 40 snapshots (ticks 0..39), trailing 24 ⇒ minTick 16.
    expect(slider().getAttribute('aria-valuemin')).toBe('16');
  });
});

describe('AnalyticsSection — the view is the URL', () => {
  it('opens clean at the live edge, with no params to spell out', () => {
    renderAnalytics();
    expect(search()).toBe('');
    expect(cursor()).toBe('39');
  });

  it('parks the cursor where a deep link names', () => {
    renderAnalytics('/analytics?tick=20&window=24h&log=user');
    expect(cursor()).toBe('20');
    expect(slider().getAttribute('aria-valuemin')).toBe('16');
    expect(screen.getByRole('button', { name: 'user' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('ignores a tick the run cannot honour', () => {
    renderAnalytics('/analytics?tick=chapter-two');
    expect(cursor()).toBe('39');
    expect(screen.getByRole('button', { name: /Live edge/ }).hasAttribute('disabled')).toBe(true);
  });

  it('writes the parked tick to the query string, and drops it at the live edge', () => {
    renderAnalytics();
    fireEvent.click(screen.getByRole('button', { name: '−1' }));
    expect(search()).toBe('?tick=38');

    fireEvent.click(screen.getByRole('button', { name: /Live edge/ }));
    expect(search()).toBe('');
    expect(cursor()).toBe('39');
  });

  it('keeps the window and the log filter in the URL', () => {
    renderAnalytics();
    fireEvent.click(screen.getByRole('button', { name: '7d' }));
    expect(search()).toBe('?window=7d');
    fireEvent.click(screen.getByRole('button', { name: 'life' }));
    expect(search()).toBe('?window=7d&log=life');
  });

  it('holds the cursor across a window change, clamped into the new span', () => {
    renderAnalytics('/analytics?tick=4');
    expect(cursor()).toBe('4');

    fireEvent.click(screen.getByRole('button', { name: '24h' }));
    // Tick 4 predates the 24h window, so the cursor lands on its oldest
    // snapshot — and the URL says what the cursor actually shows.
    expect(cursor()).toBe('16');
    expect(search()).toBe('?tick=16&window=24h');
  });

  it('widens the window when a summary tile names a tick outside it', () => {
    renderAnalytics('/analytics?window=24h');
    // The run's only death is at tick 5; the 24h window starts at 16.
    fireEvent.click(screen.getByRole('button', { name: 'last T5' }));
    expect(search()).toBe('?tick=5');
    expect(cursor()).toBe('5');
  });
});

describe('AnalyticsSection — what back walks through', () => {
  it('leaves the live edge in one step, however many ticks the drag crosses', () => {
    renderAnalytics();
    const track = slider();
    track.setPointerCapture = (): void => {};
    track.releasePointerCapture = (): void => {};
    track.getBoundingClientRect = (): ReturnType<typeof track.getBoundingClientRect> => ({
      left: 0,
      top: 0,
      right: 100,
      bottom: 44,
      width: 100,
      height: 44,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(track, { clientX: 50, pointerId: 1 });
    fireEvent.pointerMove(track, { clientX: 30, pointerId: 1 });
    fireEvent.pointerMove(track, { clientX: 10, pointerId: 1 });
    fireEvent.pointerUp(track, { clientX: 10, pointerId: 1 });
    expect(search()).toBe('?tick=4');

    back();
    expect(search()).toBe('');
  });

  it('collapses a run of ± nudges into the one step that left the live edge', () => {
    renderAnalytics();
    for (let press = 0; press < 3; press++) {
      fireEvent.click(screen.getByRole('button', { name: '−1' }));
    }
    expect(search()).toBe('?tick=36');

    back();
    expect(search()).toBe('');
  });

  it('walks back through the places the log was asked about', () => {
    renderAnalytics();
    fireEvent.click(screen.getByRole('button', { name: /added Neon Tetra/ }));
    expect(search()).toBe('?tick=31');
    fireEvent.click(screen.getByRole('button', { name: /created/ }));
    expect(search()).toBe('?tick=0');

    back();
    expect(search()).toBe('?tick=31');
    back();
    expect(search()).toBe('');
  });

  it('does not stack an entry for a tick it is already parked on', () => {
    renderAnalytics();
    fireEvent.click(screen.getByRole('button', { name: /added Neon Tetra/ }));
    fireEvent.click(screen.getByRole('button', { name: /added Neon Tetra/ }));
    expect(search()).toBe('?tick=31');

    back();
    expect(search()).toBe('');
  });
});

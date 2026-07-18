import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ReviewMode } from './ReviewMode';
import { ThemeProvider } from '../hooks/useTheme';
import { UnitsProvider } from '../hooks/useUnits';
import { PersistenceProvider } from '../persistence/index.js';
import { snapshotFromState } from '../run/index.js';
import { createSimulation, createLog, type SimulationState } from '../../simulation/index.js';
import type { useSimulation } from '../hooks/useSimulation';

let restoreMatchMedia: (() => void) | undefined;

afterEach(() => {
  restoreMatchMedia?.();
  cleanup();
});

function fakeSim(): ReturnType<typeof useSimulation> {
  const base: SimulationState = createSimulation({ tankCapacity: 40 });
  const history = Array.from({ length: 40 }, (_, tick) =>
    snapshotFromState({ ...base, tick })
  );
  const logs = [
    createLog(0, 'simulation', 'info', 'created'),
    createLog(31, 'user', 'info', 'added Neon Tetra'),
    createLog(36, 'nitrogen-cycle', 'warning', 'High ammonia level: 0.109 ppm'),
  ];
  const state: SimulationState = { ...base, tick: 39, logs };
  return {
    state,
    history,
    aggregates: { ticks: 39, deaths: 0, births: 100, frySold: 0, alerts: 1, waterChangedL: 0 },
  } as unknown as ReturnType<typeof useSimulation>;
}

function renderReview(): void {
  render(
    <ThemeProvider>
      <PersistenceProvider>
        <UnitsProvider>
          <ReviewMode sim={fakeSim()} />
        </UnitsProvider>
      </PersistenceProvider>
    </ThemeProvider>
  );
}

// Pin the desktop layout (not mobile) so the four-chart grid is deterministic.
beforeEach(() => {
  const noop = (): void => {};
  const original = globalThis.matchMedia;
  globalThis.matchMedia = ((): ReturnType<typeof globalThis.matchMedia> =>
    ({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: noop,
      removeEventListener: noop,
      addListener: noop,
      removeListener: noop,
      dispatchEvent: (): boolean => false,
    }) as unknown as ReturnType<typeof globalThis.matchMedia>) as unknown as typeof globalThis.matchMedia;
  restoreMatchMedia = (): void => {
    globalThis.matchMedia = original;
  };
});

describe('ReviewMode', () => {
  it('mounts the summary, all four charts, the log, and the scrubber', () => {
    renderReview();
    expect(screen.getByText('run length')).toBeTruthy();
    for (const title of ['Nitrogen cycle', 'pH & CO₂', 'O₂ / temp', 'Population & plant mass']) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(screen.getByText('Log')).toBeTruthy();
    expect(screen.getByRole('slider')).toBeTruthy();
  });

  it('scopes the scrubber domain to the selected window', () => {
    renderReview();
    expect(screen.getByRole('slider').getAttribute('aria-valuemin')).toBe('0');

    fireEvent.click(screen.getByRole('button', { name: '24h' }));
    // 40 snapshots (ticks 0..39), trailing 24 ⇒ minTick 16.
    expect(screen.getByRole('slider').getAttribute('aria-valuemin')).toBe('16');
  });
});

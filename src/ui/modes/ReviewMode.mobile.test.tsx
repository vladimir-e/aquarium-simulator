import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ReviewMode } from './ReviewMode';
import { ThemeProvider } from '../hooks/useTheme';
import { UnitsProvider } from '../hooks/useUnits';
import { PersistenceProvider } from '../persistence/index.js';
import { snapshotFromState } from '../run/index.js';
import { createSimulation, createLog, type SimulationState } from '../../simulation/index.js';
import type { useSimulation } from '../hooks/useSimulation';

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

function mobileMediaQueryList(query: string): ReturnType<typeof globalThis.matchMedia> {
  const noop = (): void => {};
  return {
    matches: true, // force the mobile layout
    media: query,
    onchange: null,
    addEventListener: noop,
    removeEventListener: noop,
    addListener: noop,
    removeListener: noop,
    dispatchEvent: (): boolean => false,
  } as unknown as ReturnType<typeof globalThis.matchMedia>;
}

let restoreMatchMedia: () => void;

beforeEach(() => {
  const original = globalThis.matchMedia;
  globalThis.matchMedia = mobileMediaQueryList;
  restoreMatchMedia = (): void => {
    globalThis.matchMedia = original;
  };
});

afterEach(() => {
  restoreMatchMedia();
  cleanup();
});

describe('ReviewMode (mobile)', () => {
  it('shows one chart at a time and swaps it via the chart chips', () => {
    renderReview();
    // Default chip: the nitrogen-cycle chart.
    expect(screen.getByText('Nitrogen cycle')).toBeTruthy();
    expect(screen.queryByText('pH & CO₂')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'pH·CO₂' }));
    expect(screen.getByText('pH & CO₂')).toBeTruthy();
    expect(screen.queryByText('Nitrogen cycle')).toBeNull();
  });

  it('keeps the scrubber pinned in the mobile layout', () => {
    renderReview();
    expect(screen.getByRole('slider')).toBeTruthy();
  });
});

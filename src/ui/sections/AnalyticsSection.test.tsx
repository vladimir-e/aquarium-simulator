import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { AnalyticsSection } from './AnalyticsSection';
import { ThemeProvider } from '../hooks/useTheme';
import { UnitsProvider } from '../hooks/useUnits';
import { ConfigProvider } from '../hooks/useConfig';
import { PersistenceProvider } from '../persistence/index.js';
import { PERSISTENCE_VERSION, STORAGE_KEY } from '../persistence/types.js';
import { RUN_HISTORY_CAP, snapshotFromState } from '../run/index.js';
import { createSimulation, createLog, type SimulationState } from '../../simulation/index.js';
import { useSimulation } from '../hooks/useSimulation';
import { getPresetById } from '../../simulation/presets';
import { navFigures } from '../nav/figures';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { stubMatchMedia, viewport, type MatchMediaStub } from '../test/matchMedia';
import { bandsOf, isRigid, pinnedPx } from '../test/layout';

let media: MatchMediaStub;

afterEach(() => {
  media.restore();
  cleanup();
});

const BASE: SimulationState = createSimulation({ tankCapacity: 40 });

/** Snapshots for ticks `from`..`to` inclusive, as the recorder would keep them. */
function snapshots(from: number, to: number): ReturnType<typeof snapshotFromState>[] {
  return Array.from({ length: to - from + 1 }, (_, i) => snapshotFromState({ ...BASE, tick: from + i }));
}

function fakeSim(
  history = snapshots(0, 39),
  logs: ReturnType<typeof createLog>[] = [
    createLog(0, 'simulation', 'info', 'created'),
    createLog(5, 'livestock', 'warning', 'Neon Tetra died', 'fish-died'),
    createLog(31, 'user', 'info', 'added Neon Tetra'),
    createLog(36, 'nitrogen-cycle', 'warning', 'High ammonia level: 0.109 ppm'),
  ],
  aggregates = { ticks: 39, deaths: 1, births: 100, frySold: 0, alerts: 1, waterChangedL: 0 }
): ReturnType<typeof useSimulation> {
  const state: SimulationState = { ...BASE, tick: history[history.length - 1].tick, logs };
  return { state, history, aggregates } as unknown as ReturnType<typeof useSimulation>;
}

/**
 * A run long enough for the ring buffer to have dropped its start: 1622 ticks
 * recorded, the trailing `RUN_HISTORY_CAP` kept. The early logs are still in the
 * transcript and the aggregates still count them — their ticks are simply gone.
 */
function cappedSim(): ReturnType<typeof useSimulation> {
  const last = 1621;
  return fakeSim(
    snapshots(last - RUN_HISTORY_CAP + 1, last),
    [
      createLog(5, 'livestock', 'warning', 'Neon Tetra died', 'fish-died'),
      createLog(1600, 'nitrogen-cycle', 'warning', 'High ammonia level: 0.109 ppm'),
    ],
    { ticks: 1622, deaths: 1, births: 0, frySold: 0, alerts: 1, waterChangedL: 0 }
  );
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

function renderAnalytics(
  path = '/analytics',
  sim = fakeSim()
): (next: ReturnType<typeof useSimulation>) => void {
  const tree = (s: ReturnType<typeof useSimulation>): React.JSX.Element => (
    <ThemeProvider>
      <PersistenceProvider>
        <UnitsProvider>
          <MemoryRouter initialEntries={[path]}>
            <AnalyticsSection sim={s} />
            <Address />
          </MemoryRouter>
        </UnitsProvider>
      </PersistenceProvider>
    </ThemeProvider>
  );
  const { rerender } = render(tree(sim));
  return (next) => rerender(tree(next));
}

function search(): string {
  return screen.getByTestId('search').textContent ?? '';
}

function back(): void {
  fireEvent.click(screen.getByRole('button', { name: 'test-back' }));
}

/** The stage header's meta line: the section's headline figure. */
function headline(): string {
  return screen.getByRole('heading', { level: 1 }).nextElementSibling?.textContent ?? '';
}

function slider(): HTMLElement {
  return screen.getByRole('slider');
}

function cursor(): string {
  return slider().getAttribute('aria-valuenow') ?? '';
}

/** The slot the section gives the log, and the one it gives the charts. */
function logBand(): HTMLElement {
  return screen.getByText('Log').closest('section')!.parentElement as HTMLElement;
}

function chartBand(): HTMLElement {
  return screen.getByText('Nitrogen cycle').closest('section')!.parentElement as HTMLElement;
}

/**
 * Every band sharing the column's height, read off the DOM rather than named
 * here — a band added to the section is a band the budget has to account for.
 */
function bands(): HTMLElement[] {
  return bandsOf(logBand().parentElement as HTMLElement);
}

// Pin the desktop layout (not mobile) so the four-chart grid is deterministic.
beforeEach(() => {
  media = stubMatchMedia(viewport(1280));
});

describe('AnalyticsSection', () => {
  it('mounts the summary, all four charts, the log, and the scrubber', () => {
    renderAnalytics();
    expect(screen.getAllByText('run length').length).toBeGreaterThan(0);
    for (const title of ['Nitrogen cycle', 'pH & CO₂', 'O₂, temp & level', 'Population & growth']) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(screen.getByText('Log')).toBeTruthy();
    expect(slider()).toBeTruthy();
  });

  /**
   * The rail exists so the reader need not open the section. Analytics is the
   * one row whose figures are the run itself, so the header quotes the rail's
   * own lines rather than a second count of the same run.
   */
  it('states the run in the stage header, in the rail’s own words', () => {
    const sim = fakeSim();
    renderAnalytics('/analytics', sim);

    const rail = navFigures({
      state: sim.state,
      config: DEFAULT_CONFIG,
      aggregates: sim.aggregates,
      logs: sim.state.logs,
      presetName: 'Planted Tank',
      presetModified: false,
      units: 'metric',
    }).analytics;

    expect(headline()).toBe(rail.lines.join(' · '));
    expect(headline()).toContain('39 ticks');
  });

  it('says there is no history rather than counting an empty run', () => {
    renderAnalytics(
      '/analytics',
      fakeSim(snapshots(0, 0), [], {
        ticks: 0,
        deaths: 0,
        births: 0,
        frySold: 0,
        alerts: 0,
        waterChangedL: 0,
      })
    );
    expect(headline()).toBe('0 ticks · no history yet');
  });

  it('scopes the scrubber domain to the selected window', () => {
    renderAnalytics();
    expect(slider().getAttribute('aria-valuemin')).toBe('0');

    fireEvent.click(screen.getByRole('button', { name: '24h' }));
    // 40 snapshots (ticks 0..39), trailing 24 ⇒ minTick 16.
    expect(slider().getAttribute('aria-valuemin')).toBe('16');
  });
});

/**
 * The bug this pins: every fixed band above the log passed its shortfall down
 * to the one flexible element in the column, so on a short stage the log was
 * left a single clipped row. It is invisible on a tall viewport, so the budget
 * here is the design target's — iPad landscape, where the stage body is ~510 px
 * once Safari's chrome, the stage header and the tick scrubber have taken
 * theirs. The tiles run ~90 and the gaps 20; the charts and the log divide the
 * rest, and a new fixed band above the log has to come out of that same 410.
 */
const FLEXIBLE_BAND_PX = 410;
/** A log worth scrolling: its header, and five lines under it. */
const LOG_FLOOR_PX = 200;

describe('AnalyticsSection — the log keeps its height on a short stage', () => {
  it('floors the log, and fits that floor in what the design target has to give', () => {
    renderAnalytics();
    const logFloor = pinnedPx(logBand(), 'min-h');
    const chartFloor = pinnedPx(chartBand(), 'min-h');

    expect(logFloor).toBeGreaterThanOrEqual(LOG_FLOOR_PX);
    expect(logFloor! + chartFloor!).toBeLessThanOrEqual(FLEXIBLE_BAND_PX);
  });

  it('spends the shortfall on the charts, which read at any height', () => {
    renderAnalytics();
    const charts = chartBand();

    // A preferred height above its floor is the room the charts give back.
    expect(pinnedPx(charts, 'basis')!).toBeGreaterThan(pinnedPx(charts, 'min-h')!);
    expect(isRigid(charts)).toBe(false);
  });

  it('scrolls the section once every band is down to its floor', () => {
    renderAnalytics();
    const column = logBand().parentElement!;

    for (const band of bands().slice(0, -1)) expect(isRigid(band)).toBe(false);
    expect(column.className).toContain('min-h-full');
    expect(column.parentElement!.className).toContain('overflow-y-auto');
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

  it('resolves a deep link the window cannot honour, and says so in the URL', () => {
    renderAnalytics('/analytics?tick=4&window=24h');
    // Tick 4 predates the 24h window, so the cursor lands on its oldest
    // snapshot — and the address stops naming a tick nothing is showing.
    expect(cursor()).toBe('16');
    expect(search()).toBe('?tick=16&window=24h');
  });

  it('drops a deep-linked tick the run has run past, rather than parking on it', () => {
    renderAnalytics('/analytics?tick=900');
    expect(cursor()).toBe('39');
    expect(search()).toBe('');
  });

  it('leaves a parked cursor where it is as the run grows under it', () => {
    const rerender = renderAnalytics('/analytics?tick=20');
    expect(cursor()).toBe('20');

    rerender(fakeSim(snapshots(0, 120)));
    expect(cursor()).toBe('20');
    expect(search()).toBe('?tick=20');
    expect(slider().getAttribute('aria-valuemax')).toBe('120');
  });
});

describe('AnalyticsSection — a run longer than the buffer', () => {
  it('scopes the widest window to what the buffer still holds', () => {
    renderAnalytics('/analytics', cappedSim());
    expect(slider().getAttribute('aria-valuemin')).toBe(String(1622 - RUN_HISTORY_CAP));
    expect(slider().getAttribute('aria-valuemax')).toBe('1621');
  });

  it('states a dropped tick without offering to scrub to it', () => {
    renderAnalytics('/analytics', cappedSim());
    // The run's only death is at tick 5, which the buffer dropped long ago.
    expect(screen.getByText('last T5')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'last T5' })).toBeNull();
    expect(search()).toBe('');
  });

  it('still offers a tick the buffer kept', () => {
    renderAnalytics('/analytics', cappedSim());
    fireEvent.click(screen.getByRole('button', { name: 'latest T1600' }));
    expect(search()).toBe('?tick=1600');
    expect(cursor()).toBe('1600');
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

/**
 * Seed a bare-tank session whose ammonia already sits above the alert threshold
 * (>0.1 ppm; 20 mg in 40 L is 0.5), so the very first tick fires the warning.
 */
function seedHighAmmonia(): void {
  const base = createSimulation(getPresetById('bare')!.config);
  globalThis.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: PERSISTENCE_VERSION,
      simulation: {
        tick: 0,
        tank: base.tank,
        resources: { ...base.resources, ammonia: 20 },
        environment: base.environment,
        equipment: base.equipment,
        plants: base.plants,
        fish: base.fish,
        clutches: base.clutches,
        algae: base.algae,
        rng: base.rng,
        alertState: base.alertState,
        currentPreset: 'bare',
      },
      tunableConfig: DEFAULT_CONFIG,
      ui: { units: 'metric', debugPanelOpen: false },
    })
  );
}

/**
 * The section on the real hook: what the charts and the tick-range selectors can
 * still see once a preset load has replaced the tank under them.
 */
describe('AnalyticsSection — a preset load starts a new run', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    seedHighAmmonia();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.localStorage.clear();
  });

  function Live(): React.JSX.Element {
    const sim = useSimulation();
    return (
      <>
        <AnalyticsSection sim={sim} />
        <button type="button" onClick={() => sim.togglePlayPause()}>
          test-transport
        </button>
        <button type="button" onClick={() => sim.loadPreset('community')}>
          test-switch
        </button>
      </>
    );
  }

  function press(name: string): void {
    fireEvent.click(screen.getByRole('button', { name }));
  }

  it('drops the run before it, transcript and charts alike', () => {
    render(
      <ThemeProvider>
        <PersistenceProvider>
          <ConfigProvider>
            <UnitsProvider>
              <MemoryRouter initialEntries={['/analytics']}>
                <Live />
              </MemoryRouter>
            </UnitsProvider>
          </ConfigProvider>
        </PersistenceProvider>
      </ThemeProvider>
    );

    // One tick of autoplay at 1h/s: the seeded ammonia crosses its threshold, so
    // the warning lands on the very tick the switch is about to rebaseline on.
    press('test-transport');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    press('test-transport');
    expect(screen.getByText(/High ammonia/)).toBeTruthy();
    expect(screen.getAllByTitle('NH₃ @1').length).toBeGreaterThan(0);

    press('test-switch');

    // The warning described a tank that no longer exists, so it goes with it.
    expect(screen.queryByText(/High ammonia/)).toBeNull();
    expect(screen.queryAllByTitle('NH₃ @1')).toHaveLength(0);
    expect(screen.getByText(/Loaded preset: Balanced Community/)).toBeTruthy();
  });
});

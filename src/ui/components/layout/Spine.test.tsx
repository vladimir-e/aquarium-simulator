import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { Spine } from './Spine';
import { createLog, type LogEntry } from '../../../simulation/index.js';
import { PersistenceProvider } from '../../persistence/index.js';
import { UnitsProvider } from '../../hooks/useUnits';
import { TRACKS, TRACK_PAIRS } from '../../review';
import type { RunSnapshot } from '../../run';
import { stubMatchMedia, viewport, type MatchMediaStub } from '../../test/matchMedia';
import { DEFAULT_SETTINGS } from '../../actions';
import { DEFAULT_CONFIG } from '../../../simulation/config/index.js';
import { PERSISTENCE_VERSION, STORAGE_KEY } from '../../persistence/types.js';

const TICKS = 72;

/** NO₃ carries the tick, so a caption's value names the tick it was read at. */
const history: RunSnapshot[] = Array.from({ length: TICKS + 1 }, (_, tick) => ({
  tick,
  ammonia: tick / 1000,
  nitrite: tick / 500,
  nitrate: tick,
  ph: 6.8,
  oxygen: 8,
  co2: 7,
  temperature: 25,
  waterPct: 99,
  fishCount: 4,
  fryCount: 0,
  plantAvgSize: 30,
  algaeMass: 12,
  food: 0,
}));

const logs: LogEntry[] = [
  createLog(12, 'user', 'info', 'Fed 0.5 g'),
  createLog(36, 'nitrogen-cycle', 'warning', 'Ammonia high: 0.42 ppm'),
];

let media: MatchMediaStub;

beforeEach(() => {
  media = stubMatchMedia(viewport(1180));
  globalThis.localStorage.clear();
});

afterEach(() => {
  media.restore();
  cleanup();
});

function Address(): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <>
      <span data-testid="search">{useLocation().search}</span>
      <button type="button" onClick={() => navigate(-1)}>
        back
      </button>
    </>
  );
}

function mount(path = '/', buffer: RunSnapshot[] = history): void {
  render(
    <PersistenceProvider>
      <UnitsProvider>
        <MemoryRouter initialEntries={[path]}>
          <Spine history={buffer} logs={logs} schedule={{ startHour: 8, duration: 8 }} />
          <Address />
        </MemoryRouter>
      </UnitsProvider>
    </PersistenceProvider>
  );
}

function back(): void {
  fireEvent.click(screen.getByRole('button', { name: 'back' }));
}

function marks(kind: string): HTMLElement[] {
  return Array.from(globalThis.document.querySelectorAll(`[data-mark="${kind}"]`));
}

/** One pointer gesture across a surface one pixel wide per tick. */
function drag(surface: HTMLElement, ...xs: number[]): void {
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    width: TICKS,
  } as DOMRect);
  fireEvent.pointerDown(surface, { pointerId: 1, clientX: xs[0] });
  for (const x of xs.slice(1)) fireEvent.pointerMove(surface, { pointerId: 1, clientX: x });
  fireEvent.pointerUp(surface, { pointerId: 1 });
}

function search(): string {
  return screen.getByTestId('search').textContent ?? '';
}

function slider(): HTMLElement {
  return screen.getByRole('slider', { name: 'Run timeline' });
}

function handle(): HTMLElement {
  return screen.getByRole('button', { name: /charts/ });
}

describe('the axis', () => {
  it('spans the whole run, and marks the days inside it', () => {
    mount();

    expect(screen.getByText('Day 1')).toBeTruthy();
    expect(screen.getByText('Day 4')).toBeTruthy();
    expect(slider().getAttribute('aria-valuemax')).toBe(String(TICKS));
  });

  it('marks what happened: the action the keeper took, the alert the tank hit', () => {
    mount();

    expect(marks('action').map((m) => m.dataset.tick)).toEqual(['12']);
    expect(marks('alert').map((m) => m.dataset.tick)).toEqual(['36']);
    expect(marks('action')[0].style.left).toBe(`${(12 / TICKS) * 100}%`);
  });

  it('parks the tick under a drag, and leaves one entry behind it', () => {
    mount();

    drag(slider(), 10, 20, 30);

    expect(search()).toBe('?tick=30');
    expect(marks('playhead')[0].dataset.parked).toBe('true');

    back();
    expect(search()).toBe('');
    expect(marks('playhead')[0].dataset.parked).toBe('false');
  });

  it('takes Home to the oldest tick it holds, and End back to the live edge', () => {
    mount();

    fireEvent.keyDown(slider(), { key: 'Home' });
    expect(search()).toBe('?tick=0');

    fireEvent.keyDown(slider(), { key: 'End' });
    expect(search()).toBe('');
  });

  it('clamps a tick the buffer has already dropped, and says so in the address', () => {
    mount('/?tick=10', history.slice(30));

    expect(search()).toBe('?tick=30');
    expect(slider().getAttribute('aria-valuenow')).toBe('30');
  });

  it('parks the playhead in the address, and re-follows on the way back', () => {
    mount();

    fireEvent.keyDown(slider(), { key: 'ArrowLeft' });
    expect(slider().getAttribute('aria-valuenow')).toBe(String(TICKS - 1));
    expect(search()).toBe(`?tick=${TICKS - 1}`);
    expect(screen.getByRole('link', { name: 'History module' }).getAttribute('href')).toBe(
      `/history?tick=${TICKS - 1}`
    );

    fireEvent.keyDown(slider(), { key: 'ArrowRight' });
    expect(slider().getAttribute('aria-valuenow')).toBe(String(TICKS));
    expect(search()).toBe('');
  });

  it('reads the tick the review layer parked, whatever else is in the address', () => {
    mount('/history?window=24h&tick=24');

    expect(slider().getAttribute('aria-valuenow')).toBe('24');
    expect(screen.getByRole('link', { name: 'History module' }).getAttribute('href')).toBe(
      '/history?window=24h&tick=24'
    );
  });
});

describe('the tracks', () => {
  it('opens on the handle and closes on it again', () => {
    mount();
    expect(handle().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('slider', { name: 'Timeline charts' })).toBeNull();

    fireEvent.click(handle());
    expect(handle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('slider', { name: 'Timeline charts' })).toBeTruthy();

    fireEvent.click(handle());
    expect(screen.queryByRole('slider', { name: 'Timeline charts' })).toBeNull();
  });

  it('draws all four groups over the run', () => {
    mount();
    fireEvent.click(handle());

    const charts = screen.getByRole('slider', { name: 'Timeline charts' });
    expect(
      TRACKS.map((def) => within(charts).getByRole('img', { name: def.title })).length
    ).toBe(4);
  });

  it('reads its values at the parked tick', () => {
    mount('/?tick=24');
    fireEvent.click(handle());

    const charts = screen.getByRole('slider', { name: 'Timeline charts' });
    // NO₃ is the tick number in this fixture, so the caption names the tick.
    expect(within(charts).getAllByText('24.0').length).toBeGreaterThan(0);
  });

  it('opens on the tracks when the session was left on them', () => {
    globalThis.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: PERSISTENCE_VERSION,
        tunableConfig: DEFAULT_CONFIG,
        ui: {
          units: 'metric',
          debugPanelOpen: false,
          spineOpen: true,
          acts: { settings: DEFAULT_SETTINGS, promoted: null },
        },
      })
    );
    mount();

    expect(handle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('slider', { name: 'Timeline charts' })).toBeTruthy();
  });

  it('leaves them to History, which is already the tracks at full height', () => {
    mount('/history');
    fireEvent.click(handle());

    expect(handle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByRole('slider', { name: 'Timeline charts' })).toBeNull();
    expect(screen.getByRole('slider', { name: 'Run timeline' })).toBeTruthy();
  });

  it('shows two of the four on a phone, and the rest behind the chips', () => {
    media.set(viewport(390));
    mount();
    fireEvent.click(handle());

    const charts = screen.getByRole('slider', { name: 'Timeline charts' });
    const drawn = (): string[] =>
      within(charts)
        .getAllByRole('img')
        .map((img) => img.getAttribute('aria-label') ?? '');

    expect(drawn()).toEqual(TRACK_PAIRS[0].tracks.map((def) => def.title));
    // The chips are a row above the scrub surface, not buttons inside a slider.
    expect(within(charts).queryByRole('button', { name: TRACK_PAIRS[1].label })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: TRACK_PAIRS[1].label }));
    expect(drawn()).toEqual(TRACK_PAIRS[1].tracks.map((def) => def.title));
  });
});

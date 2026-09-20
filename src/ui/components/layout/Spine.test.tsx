import React from 'react';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
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
  return <span data-testid="search">{useLocation().search}</span>;
}

function mount(path = '/'): void {
  render(
    <PersistenceProvider>
      <UnitsProvider>
        <MemoryRouter initialEntries={[path]}>
          <Spine history={history} logs={logs} tick={TICKS} schedule={{ startHour: 8, duration: 8 }} />
          <Address />
        </MemoryRouter>
      </UnitsProvider>
    </PersistenceProvider>
  );
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

  it('marks what happened: actions in accent, alerts in alert', () => {
    mount();
    const marks = Array.from(slider().firstElementChild!.children) as HTMLElement[];

    const action = marks.find((m) => m.className.includes('bg-accent'))!;
    const alert = marks.find((m) => m.className.includes('bg-alert'))!;
    expect(action.style.left).toBe(`${(12 / TICKS) * 100}%`);
    expect(alert.style.left).toBe(`${(36 / TICKS) * 100}%`);
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

  it('grows the strip to its expanded height', () => {
    mount();
    const strip = handle().closest('div')!.parentElement!;
    expect(strip.className).toContain('h-8');

    fireEvent.click(handle());
    expect(strip.className).toContain('h-40');
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

    fireEvent.click(screen.getByRole('button', { name: TRACK_PAIRS[1].label }));
    expect(drawn()).toEqual(TRACK_PAIRS[1].tracks.map((def) => def.title));
  });
});

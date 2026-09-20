import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { HistorySection } from './HistorySection';
import { TRACKS } from '../review';
import { query, renderStage } from '../test/stage';
import { stocked } from '../test/run';
import { stubSim } from '../test/stubSim';
import { stubMatchMedia, viewport, type MatchMediaStub } from '../test/matchMedia';

let media: MatchMediaStub;

beforeEach(() => {
  media = stubMatchMedia(viewport(1180));
});

afterEach(() => {
  media.restore();
  cleanup();
});

const run = stocked();

function mount(path = '/history'): void {
  renderStage(<HistorySection sim={stubSim(run.state, run.history)} />, {
    path,
    state: run.state,
  });
}

function tracks(): HTMLElement {
  return screen.getByRole('slider', { name: 'History timeline' });
}

describe('History', () => {
  it('stacks the four tracks over one axis', () => {
    mount();
    for (const def of TRACKS) {
      expect(within(tracks()).getByRole('img', { name: def.title })).toBeTruthy();
    }
  });

  it('scrubs the shared tick, and the tracks follow it', () => {
    mount();
    const live = run.state.tick;

    fireEvent.keyDown(tracks(), { key: 'ArrowLeft' });

    expect(query().get('tick')).toBe(String(live - 1));
    expect(tracks().getAttribute('aria-valuenow')).toBe(String(live - 1));
  });

  it('parks the playhead on the tick a log line names', () => {
    mount();
    const entry = screen.getAllByRole('button', { name: /Fed/ })[0];

    fireEvent.click(entry);

    const parked = Number(query().get('tick'));
    expect(parked).toBeGreaterThanOrEqual(0);
    expect(parked).toBeLessThan(run.state.tick);
    expect(tracks().getAttribute('aria-valuenow')).toBe(String(parked));
  });

  it('narrows to a window, and leaves the widest one out of the address', () => {
    mount();

    fireEvent.click(screen.getByRole('button', { name: '24h' }));
    expect(query().get('window')).toBe('24h');
    expect(Number(tracks().getAttribute('aria-valuemin'))).toBe(run.state.tick - 23);

    fireEvent.click(screen.getByRole('button', { name: '30d' }));
    expect(query().get('window')).toBeNull();
  });

  it('filters the transcript by category', () => {
    mount();
    const before = screen.getAllByRole('button', { name: /Fed/ }).length;

    fireEvent.click(screen.getByRole('button', { name: 'life' }));

    expect(query().get('log')).toBe('life');
    expect(screen.queryAllByRole('button', { name: /Fed/ })).toHaveLength(0);
    expect(before).toBeGreaterThan(0);
  });

  it('exports the transcript as text', () => {
    const createObjectURL = vi.fn(() => 'blob:log');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...globalThis.URL, createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(globalThis.HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Export log' }));

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect((createObjectURL.mock.calls[0][0] as { type: string }).type).toBe('text/plain');

    click.mockRestore();
    vi.unstubAllGlobals();
  });

  it('resolves a tick the window cannot honour, and says so in the address', () => {
    mount('/history?tick=999999');

    expect(query().get('tick')).toBeNull();
  });
});

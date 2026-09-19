import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Spine } from './Spine';
import { createLog, type LogEntry } from '../../../simulation/index.js';
import type { RunSnapshot } from '../../run';

afterEach(cleanup);

const TICKS = 72;

const history: RunSnapshot[] = Array.from(
  { length: TICKS + 1 },
  (_, tick) => ({ tick }) as RunSnapshot
);

const logs: LogEntry[] = [
  createLog(12, 'user', 'info', 'Fed 0.5 g'),
  createLog(36, 'nitrogen-cycle', 'warning', 'Ammonia high: 0.42 ppm'),
];

function Address(): React.JSX.Element {
  return <span data-testid="search">{useLocation().search}</span>;
}

function Harness(): React.JSX.Element {
  return (
    <MemoryRouter>
      <Spine history={history} logs={logs} tick={TICKS} />
      <Address />
    </MemoryRouter>
  );
}

function search(): string {
  return screen.getByTestId('search').textContent ?? '';
}

function slider(): HTMLElement {
  return screen.getByRole('slider', { name: 'Run timeline' });
}

describe('Spine', () => {
  it('spans the whole run, and marks the days inside it', () => {
    render(<Harness />);

    expect(screen.getByText('Day 1')).toBeTruthy();
    expect(screen.getByText('Day 4')).toBeTruthy();
    expect(slider().getAttribute('aria-valuemax')).toBe(String(TICKS));
  });

  it('marks what happened: actions in accent, alerts in alert', () => {
    render(<Harness />);
    const marks = Array.from(slider().children) as HTMLElement[];

    const action = marks.find((m) => m.className.includes('bg-accent'))!;
    const alert = marks.find((m) => m.className.includes('bg-alert'))!;
    expect(action.style.left).toBe(`${(12 / TICKS) * 100}%`);
    expect(alert.style.left).toBe(`${(36 / TICKS) * 100}%`);
  });

  it('parks the playhead in the address, and re-follows on the way back', () => {
    render(<Harness />);

    fireEvent.keyDown(slider(), { key: 'ArrowLeft' });
    expect(slider().getAttribute('aria-valuenow')).toBe(String(TICKS - 1));
    expect(search()).toBe(`?tick=${TICKS - 1}`);
    expect(screen.getByRole('link', { name: /charts/ }).getAttribute('href')).toBe(
      `/history?tick=${TICKS - 1}`
    );

    fireEvent.keyDown(slider(), { key: 'ArrowRight' });
    expect(slider().getAttribute('aria-valuenow')).toBe(String(TICKS));
    expect(search()).toBe('');
    expect(screen.getByRole('link', { name: /charts/ }).getAttribute('href')).toBe('/history');
  });

  it('reads the tick the review layer parked, whatever else is in the address', () => {
    render(
      <MemoryRouter initialEntries={[`/history?window=24h&tick=24`]}>
        <Spine history={history} logs={logs} tick={TICKS} />
      </MemoryRouter>
    );

    expect(slider().getAttribute('aria-valuenow')).toBe('24');
    expect(screen.getByRole('link', { name: /charts/ }).getAttribute('href')).toBe(
      '/history?window=24h&tick=24'
    );
  });
});

import React, { useState } from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

function Harness(): React.JSX.Element {
  const [parked, setParked] = useState<number | null>(null);
  return (
    <MemoryRouter>
      <Spine history={history} logs={logs} tick={TICKS} parked={parked} onScrub={setParked} />
    </MemoryRouter>
  );
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

  it('parks the playhead off the live edge, and re-follows on the way back', () => {
    render(<Harness />);

    fireEvent.keyDown(slider(), { key: 'ArrowLeft' });
    expect(slider().getAttribute('aria-valuenow')).toBe(String(TICKS - 1));
    expect(screen.getByRole('link', { name: /charts/ }).getAttribute('href')).toBe(
      `/history?tick=${TICKS - 1}`
    );

    fireEvent.keyDown(slider(), { key: 'ArrowRight' });
    expect(slider().getAttribute('aria-valuenow')).toBe(String(TICKS));
    expect(screen.getByRole('link', { name: /charts/ }).getAttribute('href')).toBe('/history');
  });
});

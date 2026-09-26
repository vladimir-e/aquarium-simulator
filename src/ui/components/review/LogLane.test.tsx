import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LogLane } from './LogLane';
import { createLog, liters, measured, type LogEntry } from '../../../simulation/index.js';

afterEach(cleanup);

const logs: LogEntry[] = [
  createLog(4, 'user', 'info', 'Fed 0.5 g'),
  createLog(9, 'nitrogen-cycle', 'warning', 'Ammonia high: 0.42 ppm'),
];

function mount(
  entries: LogEntry[],
  filter: 'all' | 'cycle' = 'all',
  at = 12,
  units: 'metric' | 'imperial' = 'metric'
): void {
  render(
    <LogLane
      logs={entries}
      filter={filter}
      onFilter={vi.fn()}
      at={at}
      onPark={vi.fn()}
      units={units}
    />
  );
}

function current(): HTMLElement | null {
  return screen.queryByRole('button', { current: true });
}

describe('LogLane', () => {
  it('says so when the window caught nothing', () => {
    mount([]);

    expect(screen.getByText('Nothing logged in this window.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Fed/ })).toBeNull();
  });

  it('stands on the last line at or before the playhead', () => {
    mount(logs, 'all', 5);

    expect(current()!.textContent).toContain('Fed 0.5 g');
  });

  it('stands on nothing when the filter drops the line the playhead is on', () => {
    mount(logs, 'cycle', 5);

    expect(screen.queryByRole('button', { name: /Fed/ })).toBeNull();
    expect(current()).toBeNull();
  });

  it('reads a line’s volumes in the keeper’s units', () => {
    mount([createLog(4, 'user', 'info', measured`Topped off water: +${liters(37.854)}`)], 'all', 4, 'imperial');

    expect(current()!.textContent).toContain('Topped off water: +10.0 gal');
  });

  it('parks the playhead on the tick a line names', () => {
    const onPark = vi.fn();
    render(
      <LogLane logs={logs} filter="all" onFilter={vi.fn()} at={12} onPark={onPark} units="metric" />
    );

    fireEvent.click(screen.getByRole('button', { name: /Fed/ }));

    expect(onPark).toHaveBeenCalledWith(4);
  });
});

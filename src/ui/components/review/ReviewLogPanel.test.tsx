import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ReviewLogPanel } from './ReviewLogPanel';
import { createLog, type LogEntry } from '../../../simulation/index.js';

afterEach(cleanup);

const logs: LogEntry[] = [
  createLog(0, 'simulation', 'info', 'created'),
  createLog(10, 'user', 'info', 'added Neon Tetra'),
  createLog(30, 'nitrogen-cycle', 'warning', 'High ammonia level: 0.109 ppm'),
  createLog(36, 'simulation', 'info', 'eggs hatched', 'eggs-hatched', 4),
];

describe('ReviewLogPanel', () => {
  it('narrows to a category and reaches sim lines only through all', () => {
    const { rerender } = render(
      <ReviewLogPanel
        windowLogs={logs}
        allLogs={logs}
        filter="user"
        onFilterChange={() => {}}
        currentTick={36}
        onScrubToTick={() => {}}
      />
    );
    expect(screen.getByText('added Neon Tetra')).toBeTruthy();
    expect(screen.queryByText('created')).toBeNull();
    expect(screen.queryByText('High ammonia level: 0.109 ppm')).toBeNull();

    rerender(
      <ReviewLogPanel
        windowLogs={logs}
        allLogs={logs}
        filter="all"
        onFilterChange={() => {}}
        currentTick={36}
        onScrubToTick={() => {}}
      />
    );
    expect(screen.getByText('created')).toBeTruthy();
  });

  it('jumps the scrubber to a clicked line', () => {
    const onScrubToTick = vi.fn();
    render(
      <ReviewLogPanel
        windowLogs={logs}
        allLogs={logs}
        filter="all"
        onFilterChange={() => {}}
        currentTick={36}
        onScrubToTick={onScrubToTick}
      />
    );
    fireEvent.click(screen.getByText('High ammonia level: 0.109 ppm'));
    expect(onScrubToTick).toHaveBeenCalledWith(30);
  });

  it('offers an export control', () => {
    render(
      <ReviewLogPanel
        windowLogs={logs}
        allLogs={logs}
        filter="all"
        onFilterChange={() => {}}
        currentTick={36}
        onScrubToTick={() => {}}
      />
    );
    expect(screen.getByText('export')).toBeTruthy();
  });

  it('shows an empty state when the filter hides everything', () => {
    render(
      <ReviewLogPanel
        windowLogs={[logs[0]]}
        allLogs={logs}
        filter="life"
        onFilterChange={() => {}}
        currentTick={0}
        onScrubToTick={() => {}}
      />
    );
    expect(screen.getByText('No events in this view.')).toBeTruthy();
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ReviewLogPanel } from './ReviewLogPanel';
import { formatLogExport } from '../../review/index.js';
import { createLog, type LogEntry } from '../../../simulation/index.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

  it('exports the whole run transcript, not the windowed view', () => {
    const windowSubset = [logs[2], logs[3]]; // ticks 30, 36 only
    render(
      <ReviewLogPanel
        windowLogs={windowSubset}
        allLogs={logs}
        filter="all"
        onFilterChange={() => {}}
        currentTick={36}
        onScrubToTick={() => {}}
      />
    );

    const blobSpy = vi.spyOn(globalThis, 'Blob').mockImplementation(function () {
      return {} as unknown as never;
    });
    vi.spyOn(globalThis.URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(globalThis.URL, 'revokeObjectURL').mockImplementation(() => {});
    const anchor = { href: '', download: '', click: vi.fn() };
    vi.spyOn(globalThis.document, 'createElement').mockReturnValue(anchor as unknown as HTMLElement);

    fireEvent.click(screen.getByText('export'));

    expect(blobSpy).toHaveBeenCalledTimes(1);
    const content = (blobSpy.mock.calls[0][0] as string[])[0];
    expect(content).toBe(formatLogExport(logs));
    expect(content).toContain('added Neon Tetra'); // a tick-10 line absent from the window
    expect(anchor.download).toBe('aquarium-run-log.txt');
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

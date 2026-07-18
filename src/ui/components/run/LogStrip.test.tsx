import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LogStrip } from './LogStrip';
import type { LogEntry } from '../../../simulation/index.js';

afterEach(cleanup);

const logs: LogEntry[] = [
  { tick: 10, source: 'user', severity: 'info', message: 'Fed fish' },
  { tick: 36, source: 'nitrogen-cycle', severity: 'warning', message: 'high ammonia 0.109 ppm' },
];

describe('LogStrip', () => {
  it('pins the latest line and hides older entries until expanded', () => {
    render(<LogStrip logs={logs} />);
    expect(screen.getByText('high ammonia 0.109 ppm')).toBeTruthy();
    expect(screen.getByText('[nitrogen-cycle]')).toBeTruthy();
    expect(screen.queryByText('Fed fish')).toBeNull();

    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('Fed fish')).toBeTruthy();
  });

  it('shows an empty state when there are no events', () => {
    render(<LogStrip logs={[]} />);
    expect(screen.getByText('No events yet.')).toBeTruthy();
  });
});

import { describe, it, expect } from 'vitest';
import type { LogEntry } from '../../simulation/index.js';
import { latestLog, recentLogs } from './log';

function entry(tick: number): LogEntry {
  return { tick, source: 'sim', severity: 'info', message: `tick ${tick}` };
}

describe('latestLog', () => {
  it('returns the last entry, or null when empty', () => {
    expect(latestLog([])).toBeNull();
    expect(latestLog([entry(1), entry(2)])?.tick).toBe(2);
  });
});

describe('recentLogs', () => {
  it('returns the most recent entries newest-first', () => {
    const logs = [entry(1), entry(2), entry(3)];
    expect(recentLogs(logs).map((l) => l.tick)).toEqual([3, 2, 1]);
  });

  it('caps the window to the limit', () => {
    const logs = Array.from({ length: 10 }, (_, i) => entry(i));
    const result = recentLogs(logs, 3);
    expect(result.map((l) => l.tick)).toEqual([9, 8, 7]);
  });
});

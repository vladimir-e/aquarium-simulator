import { describe, it, expect } from 'vitest';
import type { LogEntry } from '../../simulation/index.js';
import { latestLog } from './log';

function entry(tick: number): LogEntry {
  return { tick, source: 'sim', severity: 'info', message: `tick ${tick}` };
}

describe('latestLog', () => {
  it('returns the last entry, or null when empty', () => {
    expect(latestLog([])).toBeNull();
    expect(latestLog([entry(1), entry(2)])?.tick).toBe(2);
  });
});

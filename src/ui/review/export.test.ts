import { describe, it, expect } from 'vitest';
import { formatLogExport, LOG_EXPORT_FILENAME } from './export';
import { createLog, type LogEntry } from '../../simulation/index.js';

describe('formatLogExport', () => {
  it('writes a tab-separated header and one row per line', () => {
    const logs: LogEntry[] = [
      createLog(0, 'simulation', 'info', 'Simulation created'),
      createLog(36, 'nitrogen-cycle', 'warning', 'High ammonia level: 0.109 ppm - toxic to fish'),
    ];
    expect(formatLogExport(logs)).toBe(
      [
        'tick\tsource\tseverity\tmessage',
        '0\tsimulation\tinfo\tSimulation created',
        '36\tnitrogen-cycle\twarning\tHigh ammonia level: 0.109 ppm - toxic to fish',
      ].join('\n')
    );
  });

  it('emits just the header for an empty log', () => {
    expect(formatLogExport([])).toBe('tick\tsource\tseverity\tmessage');
  });

  it('names the download file', () => {
    expect(LOG_EXPORT_FILENAME).toBe('aquarium-run-log.txt');
  });
});

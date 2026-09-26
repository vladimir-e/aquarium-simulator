import { describe, it, expect } from 'vitest';
import { formatLogExport, LOG_EXPORT_FILENAME } from './export';
import { celsius, createLog, liters, measured, type LogEntry } from '../../simulation/index.js';
import { logQuantityIn } from '../utils/units';

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

  it('writes each figure in the units it is handed', () => {
    const logs = [createLog(0, 'simulation', 'info', measured`Simulation created: ${liters(75.708)} tank, ${celsius(25)} room`)];
    expect(formatLogExport(logs, logQuantityIn('imperial'))).toContain('Simulation created: 20.0 gal tank, 77.0°F room');
    expect(formatLogExport(logs)).toContain('Simulation created: 75.7 L tank, 25.0°C room');
  });

  it('emits just the header for an empty log', () => {
    expect(formatLogExport([])).toBe('tick\tsource\tseverity\tmessage');
  });

  it('names the download file', () => {
    expect(LOG_EXPORT_FILENAME).toBe('aquarium-run-log.txt');
  });
});

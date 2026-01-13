import { describe, it, expect } from 'vitest';
import { createLog, type LogEntry, type LogSeverity } from './logging.js';

describe('createLog', () => {
  it('creates log entry with correct structure', () => {
    const log = createLog(5, 'user', 'info', 'Test message');

    expect(log).toEqual({
      tick: 5,
      source: 'user',
      severity: 'info',
      message: 'Test message',
    });
  });

  it('includes current tick in log entry', () => {
    const log = createLog(42, 'system', 'info', 'Some event');

    expect(log.tick).toBe(42);
  });

  it('sets correct severity level for info', () => {
    const log = createLog(0, 'test', 'info', 'Info message');

    expect(log.severity).toBe('info');
  });

  it('sets correct severity level for warning', () => {
    const log = createLog(0, 'test', 'warning', 'Warning message');

    expect(log.severity).toBe('warning');
  });

  it('preserves source string', () => {
    const log = createLog(0, 'evaporation', 'warning', 'Low water');

    expect(log.source).toBe('evaporation');
  });

  it('preserves message string', () => {
    const message = 'Water level critical: 15.5L (19.4% of capacity)';
    const log = createLog(100, 'evaporation', 'warning', message);

    expect(log.message).toBe(message);
  });
});

describe('LogEntry type', () => {
  it('allows creating valid LogEntry objects', () => {
    const entry: LogEntry = {
      tick: 10,
      source: 'heater',
      severity: 'info',
      message: 'Heater enabled',
    };

    expect(entry.tick).toBe(10);
    expect(entry.source).toBe('heater');
    expect(entry.severity).toBe('info');
    expect(entry.message).toBe('Heater enabled');
  });
});

describe('LogSeverity type', () => {
  it('accepts info severity', () => {
    const severity: LogSeverity = 'info';
    expect(severity).toBe('info');
  });

  it('accepts warning severity', () => {
    const severity: LogSeverity = 'warning';
    expect(severity).toBe('warning');
  });
});

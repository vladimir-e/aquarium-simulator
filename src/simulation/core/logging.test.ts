import { describe, it, expect } from 'vitest';
import { celsius, createLog, liters, logText, measured } from './logging.js';

describe('createLog', () => {
  it('builds an entry from its four parts', () => {
    expect(createLog(5, 'user', 'warning', 'Test message')).toEqual({
      tick: 5,
      source: 'user',
      severity: 'warning',
      message: 'Test message',
    });
  });
});

describe('measured', () => {
  it('keeps each figure a quantity and inlines everything else', () => {
    const text = measured`Water change: ${'50%'} (removed ${liters(12)}, added ${liters(12.5)}) at ${celsius(20)}`;
    expect(text.message).toBe('Water change: 50% (removed {0}, added {1}) at {2}');
    expect(text.quantities).toEqual([liters(12), liters(12.5), celsius(20)]);
  });
});

describe('logText', () => {
  it('reads a measured line in the units its format renders', () => {
    const entry = createLog(3, 'user', 'info', measured`Topped off water: +${liters(4.25)} at ${celsius(21)}`);
    expect(logText(entry)).toBe('Topped off water: +4.3 L at 21.0°C');
    expect(logText(entry, (q) => (q.kind === 'volume' ? `${q.liters * 1000} mL` : 'warm'))).toBe(
      'Topped off water: +4250 mL at warm'
    );
  });

  it('reads a plain line as written', () => {
    expect(logText(createLog(0, 'user', 'info', 'Fed {0} flakes'))).toBe('Fed {0} flakes');
  });
});

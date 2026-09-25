import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { READINGS } from '../scenarios/readings.js';
import { toJson } from '../scenarios/report.js';
import { runScenario, sampleDays } from '../scenarios/run.js';
import { findSetup } from '../scenarios/setups.js';

describe('sampleDays', () => {
  it('keeps the standard days up to the run and appends a non-standard last day', () => {
    expect(sampleDays(1)).toEqual([1]);
    expect(sampleDays(7)).toEqual([1, 7]);
    expect(sampleDays(10)).toEqual([1, 7, 10]);
    expect(sampleDays(300)).toEqual([1, 7, 30, 90, 300]);
    expect(sampleDays(365)).toEqual([1, 7, 30, 90, 300, 365]);
  });
});

describe('runScenario', () => {
  const result = runScenario(findSetup('nano'), { days: 2, config: DEFAULT_CONFIG, traceDay: 1 });

  it('samples each reading once per sample day', () => {
    expect(result.days).toEqual([1, 2]);
    for (const reading of READINGS) expect(result.cells[reading.id]).toHaveLength(2);
  });

  it('traces every hour of the traced day, starting at hour 0', () => {
    expect(result.trace.map((row) => row.hour)).toEqual(Array.from({ length: 24 }, (_, h) => h));
  });

  it('writes JSON that parses, keyed by label then reading', () => {
    const parsed = JSON.parse(toJson([{ label: 'nano', result }])) as Record<string, Record<string, unknown>>;
    expect(Object.keys(parsed.nano!)).toEqual(READINGS.map((r) => r.id));
  });
});

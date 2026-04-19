import { describe, it, expect } from 'vitest';
import { runSmokeScenario } from '../smoke.js';

describe('sim smoke', () => {
  it('exercises every command path without failure', () => {
    const report = runSmokeScenario();
    const failures = report.steps.filter((s) => !s.ok);
    expect(failures, JSON.stringify(failures, null, 2)).toHaveLength(0);
    expect(report.passed).toBe(true);
  });
});

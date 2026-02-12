/**
 * Smoke test — verifies calibration framework imports work.
 * Replace with real scenarios as you calibrate.
 */

import { describe, it, expect } from 'vitest';
import { runScenario } from './helpers.js';

describe('Calibration smoke test', () => {
  it('can run a basic scenario', () => {
    const state = runScenario({
      setup: { tankCapacity: 100 },
      ticks: 10,
    });

    expect(state.tick).toBe(10);
    expect(state.resources.water).toBeGreaterThan(0);
  });
});

import { describe, it, expect } from 'vitest';
import {
  scrubAlgae,
  canScrubAlgae,
  MIN_SCRUB_PERCENT,
  MAX_SCRUB_PERCENT,
  MIN_ALGAE_TO_SCRUB,
} from './scrub-algae.js';
import { createSimulation, type SimulationState } from '../state.js';
import { produce } from 'immer';

describe('canScrubAlgae', () => {
  function createStateWithAlgae(algae: number): SimulationState {
    const state = createSimulation({ tankCapacity: 100 });
    return produce(state, (draft) => {
      draft.resources.algae = algae;
    });
  }

  it('returns false when algae is 0', () => {
    const state = createStateWithAlgae(0);
    expect(canScrubAlgae(state)).toBe(false);
  });

  it('returns false when algae is below threshold (4)', () => {
    const state = createStateWithAlgae(4);
    expect(canScrubAlgae(state)).toBe(false);
  });

  it('returns true when algae equals threshold (5)', () => {
    const state = createStateWithAlgae(5);
    expect(canScrubAlgae(state)).toBe(true);
  });

  it('returns true when algae is above threshold (50)', () => {
    const state = createStateWithAlgae(50);
    expect(canScrubAlgae(state)).toBe(true);
  });

  it('returns true when algae is at maximum (100)', () => {
    const state = createStateWithAlgae(100);
    expect(canScrubAlgae(state)).toBe(true);
  });
});

describe('scrubAlgae', () => {
  function createStateWithAlgae(algae: number): SimulationState {
    const state = createSimulation({ tankCapacity: 100 });
    return produce(state, (draft) => {
      draft.resources.algae = algae;
    });
  }

  it('does not change state when algae is below threshold', () => {
    const state = createStateWithAlgae(4);
    const result = scrubAlgae(state, { type: 'scrubAlgae' });

    expect(result.state.resources.algae).toBe(4);
    expect(result.message).toContain('too low');
  });

  it('removes algae when above threshold', () => {
    const state = createStateWithAlgae(50);
    const result = scrubAlgae(state, { type: 'scrubAlgae', randomPercent: 0.2 });

    expect(result.state.resources.algae).toBe(40); // 50 - 50*0.2 = 40
  });

  it('respects provided randomPercent for deterministic testing', () => {
    const state = createStateWithAlgae(100);

    // Test with MIN percent
    const minResult = scrubAlgae(state, { type: 'scrubAlgae', randomPercent: MIN_SCRUB_PERCENT });
    expect(minResult.state.resources.algae).toBe(90); // 100 - 100*0.1 = 90

    // Test with MAX percent
    const maxResult = scrubAlgae(state, { type: 'scrubAlgae', randomPercent: MAX_SCRUB_PERCENT });
    expect(maxResult.state.resources.algae).toBe(70); // 100 - 100*0.3 = 70
  });

  it('removes 10% at minimum percent', () => {
    const state = createStateWithAlgae(80);
    const result = scrubAlgae(state, { type: 'scrubAlgae', randomPercent: 0.1 });

    expect(result.state.resources.algae).toBe(72); // 80 - 80*0.1 = 72
  });

  it('removes 30% at maximum percent', () => {
    const state = createStateWithAlgae(80);
    const result = scrubAlgae(state, { type: 'scrubAlgae', randomPercent: 0.3 });

    expect(result.state.resources.algae).toBe(56); // 80 - 80*0.3 = 56
  });

  it('removes 20% at middle percent', () => {
    const state = createStateWithAlgae(80);
    const result = scrubAlgae(state, { type: 'scrubAlgae', randomPercent: 0.2 });

    expect(result.state.resources.algae).toBe(64); // 80 - 80*0.2 = 64
  });

  it('returns message with amount removed and percentage', () => {
    const state = createStateWithAlgae(100);
    const result = scrubAlgae(state, { type: 'scrubAlgae', randomPercent: 0.2 });

    expect(result.message).toContain('20.0');
    expect(result.message).toContain('20%');
  });

  it('logs scrub action with correct details', () => {
    const state = createStateWithAlgae(100);
    const initialLogCount = state.logs.length;
    const result = scrubAlgae(state, { type: 'scrubAlgae', randomPercent: 0.2 });

    expect(result.state.logs.length).toBe(initialLogCount + 1);

    const scrubLog = result.state.logs[result.state.logs.length - 1];
    expect(scrubLog.source).toBe('scrub');
    expect(scrubLog.severity).toBe('info');
    expect(scrubLog.message).toContain('removed');
    expect(scrubLog.message).toContain('20.0');
    expect(scrubLog.message).toContain('remaining');
    expect(scrubLog.message).toContain('80.0');
  });

  it('is immutable - does not modify original state', () => {
    const state = createStateWithAlgae(100);
    const originalAlgae = state.resources.algae;
    scrubAlgae(state, { type: 'scrubAlgae', randomPercent: 0.2 });

    expect(state.resources.algae).toBe(originalAlgae);
  });

  it('works correctly at threshold boundary (exactly 5)', () => {
    const state = createStateWithAlgae(5);
    const result = scrubAlgae(state, { type: 'scrubAlgae', randomPercent: 0.2 });

    expect(result.state.resources.algae).toBe(4); // 5 - 5*0.2 = 4
  });

  it('can reduce algae below threshold', () => {
    const state = createStateWithAlgae(10);
    const result = scrubAlgae(state, { type: 'scrubAlgae', randomPercent: 0.3 });

    // 10 - 10*0.3 = 7 - still above threshold but next scrub at 30% would be 4.9
    expect(result.state.resources.algae).toBe(7);

    // Scrub again
    const result2 = scrubAlgae(result.state, { type: 'scrubAlgae', randomPercent: 0.3 });
    expect(result2.state.resources.algae).toBe(4.9);

    // Now below threshold, can't scrub anymore
    expect(canScrubAlgae(result2.state)).toBe(false);
  });

  it('multiple scrubs progressively reduce algae', () => {
    let state = createStateWithAlgae(100);

    // First scrub at 20%
    state = scrubAlgae(state, { type: 'scrubAlgae', randomPercent: 0.2 }).state;
    expect(state.resources.algae).toBe(80);

    // Second scrub at 20%
    state = scrubAlgae(state, { type: 'scrubAlgae', randomPercent: 0.2 }).state;
    expect(state.resources.algae).toBe(64);

    // Third scrub at 20%
    state = scrubAlgae(state, { type: 'scrubAlgae', randomPercent: 0.2 }).state;
    expect(state.resources.algae).toBeCloseTo(51.2, 1);
  });

  describe('random scrub (without deterministic override)', () => {
    it('removes amount within valid range', () => {
      const state = createStateWithAlgae(100);
      const result = scrubAlgae(state, { type: 'scrubAlgae' });

      // Should be between 70 and 90 (100 - 30% to 100 - 10%)
      expect(result.state.resources.algae).toBeGreaterThanOrEqual(70);
      expect(result.state.resources.algae).toBeLessThanOrEqual(90);
    });
  });
});

describe('constants', () => {
  it('MIN_SCRUB_PERCENT is 0.1 (10%)', () => {
    expect(MIN_SCRUB_PERCENT).toBe(0.1);
  });

  it('MAX_SCRUB_PERCENT is 0.3 (30%)', () => {
    expect(MAX_SCRUB_PERCENT).toBe(0.3);
  });

  it('MIN_ALGAE_TO_SCRUB is 5', () => {
    expect(MIN_ALGAE_TO_SCRUB).toBe(5);
  });
});

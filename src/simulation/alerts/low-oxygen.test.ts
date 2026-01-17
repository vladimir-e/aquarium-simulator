import { describe, it, expect } from 'vitest';
import { lowOxygenAlert, LOW_OXYGEN_THRESHOLD } from './low-oxygen.js';
import { createSimulation } from '../state.js';
import { produce } from 'immer';

describe('lowOxygenAlert', () => {
  it('has correct id', () => {
    expect(lowOxygenAlert.id).toBe('low-oxygen');
  });

  it('returns warning log when oxygen < 4 mg/L and not already triggered', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const lowOxygenState = produce(state, (draft) => {
      draft.resources.oxygen = 3.5;
      draft.tick = 50;
    });

    const result = lowOxygenAlert.check(lowOxygenState);

    expect(result.log).not.toBeNull();
    expect(result.log!.severity).toBe('warning');
    expect(result.log!.source).toBe('gas-exchange');
    expect(result.log!.tick).toBe(50);
    expect(result.alertState.lowOxygen).toBe(true);
  });

  it('returns null log when already triggered (threshold crossing detection)', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const alreadyTriggeredState = produce(state, (draft) => {
      draft.resources.oxygen = 3.0;
      draft.alertState.lowOxygen = true;
    });

    const result = lowOxygenAlert.check(alreadyTriggeredState);

    expect(result.log).toBeNull();
    expect(result.alertState.lowOxygen).toBe(true);
  });

  it('returns null log when oxygen >= 4 mg/L', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const normalOxygenState = produce(state, (draft) => {
      draft.resources.oxygen = 6.0;
    });

    const result = lowOxygenAlert.check(normalOxygenState);

    expect(result.log).toBeNull();
    expect(result.alertState.lowOxygen).toBe(false);
  });

  it('log message includes oxygen level', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const lowOxygenState = produce(state, (draft) => {
      draft.resources.oxygen = 3.2;
    });

    const result = lowOxygenAlert.check(lowOxygenState);

    expect(result.log).not.toBeNull();
    expect(result.log!.message).toContain('3.2');
    expect(result.log!.message).toMatch(/critical|fish/i);
  });

  it('does not trigger at exactly 4 mg/L (threshold is <, not <=)', () => {
    const state = createSimulation({ tankCapacity: 100 });

    // At exactly 4, should NOT trigger (threshold is <4)
    const atThreshold = produce(state, (draft) => {
      draft.resources.oxygen = 4.0;
    });
    const atResult = lowOxygenAlert.check(atThreshold);
    expect(atResult.log).toBeNull();
    expect(atResult.alertState.lowOxygen).toBe(false);

    // Just below 4, should trigger
    const belowThreshold = produce(state, (draft) => {
      draft.resources.oxygen = 3.99;
    });
    const belowResult = lowOxygenAlert.check(belowThreshold);
    expect(belowResult.log).not.toBeNull();
    expect(belowResult.alertState.lowOxygen).toBe(true);
  });

  it('triggers at very low oxygen (1 mg/L)', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const veryLowState = produce(state, (draft) => {
      draft.resources.oxygen = 1.0;
    });

    const result = lowOxygenAlert.check(veryLowState);

    expect(result.log).not.toBeNull();
    expect(result.alertState.lowOxygen).toBe(true);
  });

  it('clears alert state when oxygen rises above threshold', () => {
    const state = createSimulation({ tankCapacity: 100 });
    // Previously triggered, but oxygen is now above threshold
    const recoveredState = produce(state, (draft) => {
      draft.resources.oxygen = 6.0;
      draft.alertState.lowOxygen = true;
    });

    const result = lowOxygenAlert.check(recoveredState);

    expect(result.log).toBeNull();
    expect(result.alertState.lowOxygen).toBe(false);
  });

  it('fires again after clearing and re-crossing threshold', () => {
    const state = createSimulation({ tankCapacity: 100 });

    // First crossing - fires
    const firstCross = produce(state, (draft) => {
      draft.resources.oxygen = 3.0;
      draft.alertState.lowOxygen = false;
    });
    const firstResult = lowOxygenAlert.check(firstCross);
    expect(firstResult.log).not.toBeNull();

    // Recovery - clears
    const recovered = produce(state, (draft) => {
      draft.resources.oxygen = 7.0;
      draft.alertState.lowOxygen = true;
    });
    const recoveredResult = lowOxygenAlert.check(recovered);
    expect(recoveredResult.alertState.lowOxygen).toBe(false);

    // Second crossing - fires again
    const secondCross = produce(state, (draft) => {
      draft.resources.oxygen = 2.5;
      draft.alertState.lowOxygen = false;
    });
    const secondResult = lowOxygenAlert.check(secondCross);
    expect(secondResult.log).not.toBeNull();
  });

  it('does not trigger for healthy oxygen levels (6-8 mg/L)', () => {
    const state = createSimulation({ tankCapacity: 100 });

    const levels = [6, 7, 8];
    for (const level of levels) {
      const healthyState = produce(state, (draft) => {
        draft.resources.oxygen = level;
      });
      const result = lowOxygenAlert.check(healthyState);
      expect(result.log).toBeNull();
      expect(result.alertState.lowOxygen).toBe(false);
    }
  });
});

describe('LOW_OXYGEN_THRESHOLD', () => {
  it('is set to 4.0', () => {
    expect(LOW_OXYGEN_THRESHOLD).toBe(4.0);
  });
});

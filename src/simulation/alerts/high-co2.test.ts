import { describe, it, expect } from 'vitest';
import { highCo2Alert, HIGH_CO2_THRESHOLD } from './high-co2.js';
import { createSimulation } from '../state.js';
import { produce } from 'immer';

describe('highCo2Alert', () => {
  it('has correct id', () => {
    expect(highCo2Alert.id).toBe('high-co2');
  });

  it('returns warning log when CO2 > 30 mg/L and not already triggered', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const highCo2State = produce(state, (draft) => {
      draft.resources.co2 = 35;
      draft.tick = 50;
    });

    const result = highCo2Alert.check(highCo2State);

    expect(result.log).not.toBeNull();
    expect(result.log!.severity).toBe('warning');
    expect(result.log!.source).toBe('gas-exchange');
    expect(result.log!.tick).toBe(50);
    expect(result.alertState.highCo2).toBe(true);
  });

  it('returns null log when already triggered (threshold crossing detection)', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const alreadyTriggeredState = produce(state, (draft) => {
      draft.resources.co2 = 40;
      draft.alertState.highCo2 = true;
    });

    const result = highCo2Alert.check(alreadyTriggeredState);

    expect(result.log).toBeNull();
    expect(result.alertState.highCo2).toBe(true);
  });

  it('returns null log when CO2 <= 30 mg/L', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const normalCo2State = produce(state, (draft) => {
      draft.resources.co2 = 15;
    });

    const result = highCo2Alert.check(normalCo2State);

    expect(result.log).toBeNull();
    expect(result.alertState.highCo2).toBe(false);
  });

  it('log message includes CO2 level', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const highCo2State = produce(state, (draft) => {
      draft.resources.co2 = 35.5;
    });

    const result = highCo2Alert.check(highCo2State);

    expect(result.log).not.toBeNull();
    expect(result.log!.message).toContain('35.5');
    expect(result.log!.message).toMatch(/harmful|fish/i);
  });

  it('does not trigger at exactly 30 mg/L (threshold is >, not >=)', () => {
    const state = createSimulation({ tankCapacity: 100 });

    // At exactly 30, should NOT trigger (threshold is >30)
    const atThreshold = produce(state, (draft) => {
      draft.resources.co2 = 30;
    });
    const atResult = highCo2Alert.check(atThreshold);
    expect(atResult.log).toBeNull();
    expect(atResult.alertState.highCo2).toBe(false);

    // Just above 30, should trigger
    const aboveThreshold = produce(state, (draft) => {
      draft.resources.co2 = 30.1;
    });
    const aboveResult = highCo2Alert.check(aboveThreshold);
    expect(aboveResult.log).not.toBeNull();
    expect(aboveResult.alertState.highCo2).toBe(true);
  });

  it('triggers at very high CO2 (50 mg/L)', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const veryHighState = produce(state, (draft) => {
      draft.resources.co2 = 50;
    });

    const result = highCo2Alert.check(veryHighState);

    expect(result.log).not.toBeNull();
    expect(result.alertState.highCo2).toBe(true);
  });

  it('clears alert state when CO2 drops below threshold', () => {
    const state = createSimulation({ tankCapacity: 100 });
    // Previously triggered, but CO2 is now below threshold
    const recoveredState = produce(state, (draft) => {
      draft.resources.co2 = 20;
      draft.alertState.highCo2 = true;
    });

    const result = highCo2Alert.check(recoveredState);

    expect(result.log).toBeNull();
    expect(result.alertState.highCo2).toBe(false);
  });

  it('fires again after clearing and re-crossing threshold', () => {
    const state = createSimulation({ tankCapacity: 100 });

    // First crossing - fires
    const firstCross = produce(state, (draft) => {
      draft.resources.co2 = 35;
      draft.alertState.highCo2 = false;
    });
    const firstResult = highCo2Alert.check(firstCross);
    expect(firstResult.log).not.toBeNull();

    // Recovery - clears
    const recovered = produce(state, (draft) => {
      draft.resources.co2 = 20;
      draft.alertState.highCo2 = true;
    });
    const recoveredResult = highCo2Alert.check(recovered);
    expect(recoveredResult.alertState.highCo2).toBe(false);

    // Second crossing - fires again
    const secondCross = produce(state, (draft) => {
      draft.resources.co2 = 40;
      draft.alertState.highCo2 = false;
    });
    const secondResult = highCo2Alert.check(secondCross);
    expect(secondResult.log).not.toBeNull();
  });

  it('does not trigger for normal CO2 levels (0-30 mg/L)', () => {
    const state = createSimulation({ tankCapacity: 100 });

    const levels = [4, 10, 15, 20, 25, 30];
    for (const level of levels) {
      const normalState = produce(state, (draft) => {
        draft.resources.co2 = level;
      });
      const result = highCo2Alert.check(normalState);
      expect(result.log).toBeNull();
      expect(result.alertState.highCo2).toBe(false);
    }
  });
});

describe('HIGH_CO2_THRESHOLD', () => {
  it('is set to 30.0', () => {
    expect(HIGH_CO2_THRESHOLD).toBe(30.0);
  });
});

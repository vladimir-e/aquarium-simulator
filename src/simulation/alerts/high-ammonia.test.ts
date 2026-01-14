import { describe, it, expect } from 'vitest';
import { highAmmoniaAlert, HIGH_AMMONIA_THRESHOLD } from './high-ammonia.js';
import { createSimulation } from '../state.js';
import { produce } from 'immer';

describe('highAmmoniaAlert', () => {
  it('has correct id', () => {
    expect(highAmmoniaAlert.id).toBe('high-ammonia');
  });

  it('returns warning log when ammonia > 0.02 and not already triggered', () => {
    const state = createSimulation({ tankCapacity: 40 });
    const highAmmoniaState = produce(state, (draft) => {
      draft.resources.ammonia = 0.05;
      draft.tick = 100;
    });

    const result = highAmmoniaAlert.check(highAmmoniaState);

    expect(result.log).not.toBeNull();
    expect(result.log!.severity).toBe('warning');
    expect(result.log!.source).toBe('nitrogen-cycle');
    expect(result.log!.tick).toBe(100);
    expect(result.alertState.highAmmonia).toBe(true);
  });

  it('returns null log when already triggered (threshold crossing detection)', () => {
    const state = createSimulation({ tankCapacity: 40 });
    const alreadyTriggeredState = produce(state, (draft) => {
      draft.resources.ammonia = 0.1;
      draft.alertState.highAmmonia = true;
    });

    const result = highAmmoniaAlert.check(alreadyTriggeredState);

    expect(result.log).toBeNull();
    expect(result.alertState.highAmmonia).toBe(true);
  });

  it('returns null log when ammonia <= 0.02', () => {
    const state = createSimulation({ tankCapacity: 40 });
    const normalState = produce(state, (draft) => {
      draft.resources.ammonia = 0.02;
    });

    const result = highAmmoniaAlert.check(normalState);

    expect(result.log).toBeNull();
    expect(result.alertState.highAmmonia).toBe(false);
  });

  it('returns null log when ammonia is 0', () => {
    const state = createSimulation({ tankCapacity: 40 });

    const result = highAmmoniaAlert.check(state);

    expect(result.log).toBeNull();
    expect(result.alertState.highAmmonia).toBe(false);
  });

  it('log message includes ammonia level', () => {
    const state = createSimulation({ tankCapacity: 40 });
    const highAmmoniaState = produce(state, (draft) => {
      draft.resources.ammonia = 0.123;
    });

    const result = highAmmoniaAlert.check(highAmmoniaState);

    expect(result.log).not.toBeNull();
    expect(result.log!.message).toContain('0.123');
  });

  it('log message suggests action', () => {
    const state = createSimulation({ tankCapacity: 40 });
    const highAmmoniaState = produce(state, (draft) => {
      draft.resources.ammonia = 0.05;
    });

    const result = highAmmoniaAlert.check(highAmmoniaState);

    expect(result.log!.message).toMatch(/filter|feeding/i);
  });

  it('does not trigger at exactly 0.02 threshold', () => {
    const state = createSimulation({ tankCapacity: 40 });
    const atThreshold = produce(state, (draft) => {
      draft.resources.ammonia = 0.02;
    });

    const result = highAmmoniaAlert.check(atThreshold);
    expect(result.log).toBeNull();
    expect(result.alertState.highAmmonia).toBe(false);
  });

  it('triggers just above 0.02 threshold', () => {
    const state = createSimulation({ tankCapacity: 40 });
    const aboveThreshold = produce(state, (draft) => {
      draft.resources.ammonia = 0.021;
    });

    const result = highAmmoniaAlert.check(aboveThreshold);
    expect(result.log).not.toBeNull();
    expect(result.alertState.highAmmonia).toBe(true);
  });

  it('clears alert state when ammonia drops below threshold', () => {
    const state = createSimulation({ tankCapacity: 40 });
    const recoveredState = produce(state, (draft) => {
      draft.resources.ammonia = 0.01;
      draft.alertState.highAmmonia = true;
    });

    const result = highAmmoniaAlert.check(recoveredState);

    expect(result.log).toBeNull();
    expect(result.alertState.highAmmonia).toBe(false);
  });

  it('fires again after clearing and re-crossing threshold', () => {
    const state = createSimulation({ tankCapacity: 40 });

    // First crossing - fires
    const firstCross = produce(state, (draft) => {
      draft.resources.ammonia = 0.05;
      draft.alertState.highAmmonia = false;
    });
    const firstResult = highAmmoniaAlert.check(firstCross);
    expect(firstResult.log).not.toBeNull();

    // Recovery - clears
    const recovered = produce(state, (draft) => {
      draft.resources.ammonia = 0.01;
      draft.alertState.highAmmonia = true;
    });
    const recoveredResult = highAmmoniaAlert.check(recovered);
    expect(recoveredResult.alertState.highAmmonia).toBe(false);

    // Second crossing - fires again
    const secondCross = produce(state, (draft) => {
      draft.resources.ammonia = 0.08;
      draft.alertState.highAmmonia = false;
    });
    const secondResult = highAmmoniaAlert.check(secondCross);
    expect(secondResult.log).not.toBeNull();
  });
});

describe('HIGH_AMMONIA_THRESHOLD', () => {
  it('is set to 0.02', () => {
    expect(HIGH_AMMONIA_THRESHOLD).toBe(0.02);
  });
});

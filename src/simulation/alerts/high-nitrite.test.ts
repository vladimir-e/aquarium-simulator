import { describe, it, expect } from 'vitest';
import { highNitriteAlert, HIGH_NITRITE_THRESHOLD } from './high-nitrite.js';
import { createSimulation } from '../state.js';
import { produce } from 'immer';

describe('highNitriteAlert', () => {
  it('has correct id', () => {
    expect(highNitriteAlert.id).toBe('high-nitrite');
  });

  it('returns warning log when nitrite > 0.1 and not already triggered', () => {
    const state = createSimulation({ tankCapacity: 40 });
    const highNitriteState = produce(state, (draft) => {
      draft.resources.nitrite = 0.5;
      draft.tick = 200;
    });

    const result = highNitriteAlert.check(highNitriteState);

    expect(result.log).not.toBeNull();
    expect(result.log!.severity).toBe('warning');
    expect(result.log!.source).toBe('nitrogen-cycle');
    expect(result.log!.tick).toBe(200);
    expect(result.alertState.highNitrite).toBe(true);
  });

  it('returns null log when already triggered (threshold crossing detection)', () => {
    const state = createSimulation({ tankCapacity: 40 });
    const alreadyTriggeredState = produce(state, (draft) => {
      draft.resources.nitrite = 1.0;
      draft.alertState.highNitrite = true;
    });

    const result = highNitriteAlert.check(alreadyTriggeredState);

    expect(result.log).toBeNull();
    expect(result.alertState.highNitrite).toBe(true);
  });

  it('returns null log when nitrite <= 0.1', () => {
    const state = createSimulation({ tankCapacity: 40 });
    const normalState = produce(state, (draft) => {
      draft.resources.nitrite = 0.1;
    });

    const result = highNitriteAlert.check(normalState);

    expect(result.log).toBeNull();
    expect(result.alertState.highNitrite).toBe(false);
  });

  it('returns null log when nitrite is 0', () => {
    const state = createSimulation({ tankCapacity: 40 });

    const result = highNitriteAlert.check(state);

    expect(result.log).toBeNull();
    expect(result.alertState.highNitrite).toBe(false);
  });

  it('log message includes nitrite level', () => {
    const state = createSimulation({ tankCapacity: 40 });
    const highNitriteState = produce(state, (draft) => {
      draft.resources.nitrite = 2.5;
    });

    const result = highNitriteAlert.check(highNitriteState);

    expect(result.log).not.toBeNull();
    expect(result.log!.message).toContain('2.500');
  });

  it('log message suggests action', () => {
    const state = createSimulation({ tankCapacity: 40 });
    const highNitriteState = produce(state, (draft) => {
      draft.resources.nitrite = 0.5;
    });

    const result = highNitriteAlert.check(highNitriteState);

    expect(result.log!.message).toMatch(/cycling|water change/i);
  });

  it('does not trigger at exactly 0.1 threshold', () => {
    const state = createSimulation({ tankCapacity: 40 });
    const atThreshold = produce(state, (draft) => {
      draft.resources.nitrite = 0.1;
    });

    const result = highNitriteAlert.check(atThreshold);
    expect(result.log).toBeNull();
    expect(result.alertState.highNitrite).toBe(false);
  });

  it('triggers just above 0.1 threshold', () => {
    const state = createSimulation({ tankCapacity: 40 });
    const aboveThreshold = produce(state, (draft) => {
      draft.resources.nitrite = 0.11;
    });

    const result = highNitriteAlert.check(aboveThreshold);
    expect(result.log).not.toBeNull();
    expect(result.alertState.highNitrite).toBe(true);
  });

  it('clears alert state when nitrite drops below threshold', () => {
    const state = createSimulation({ tankCapacity: 40 });
    const recoveredState = produce(state, (draft) => {
      draft.resources.nitrite = 0.05;
      draft.alertState.highNitrite = true;
    });

    const result = highNitriteAlert.check(recoveredState);

    expect(result.log).toBeNull();
    expect(result.alertState.highNitrite).toBe(false);
  });

  it('fires again after clearing and re-crossing threshold', () => {
    const state = createSimulation({ tankCapacity: 40 });

    // First crossing - fires
    const firstCross = produce(state, (draft) => {
      draft.resources.nitrite = 0.5;
      draft.alertState.highNitrite = false;
    });
    const firstResult = highNitriteAlert.check(firstCross);
    expect(firstResult.log).not.toBeNull();

    // Recovery - clears
    const recovered = produce(state, (draft) => {
      draft.resources.nitrite = 0.05;
      draft.alertState.highNitrite = true;
    });
    const recoveredResult = highNitriteAlert.check(recovered);
    expect(recoveredResult.alertState.highNitrite).toBe(false);

    // Second crossing - fires again
    const secondCross = produce(state, (draft) => {
      draft.resources.nitrite = 1.0;
      draft.alertState.highNitrite = false;
    });
    const secondResult = highNitriteAlert.check(secondCross);
    expect(secondResult.log).not.toBeNull();
  });
});

describe('HIGH_NITRITE_THRESHOLD', () => {
  it('is set to 0.1', () => {
    expect(HIGH_NITRITE_THRESHOLD).toBe(0.1);
  });
});

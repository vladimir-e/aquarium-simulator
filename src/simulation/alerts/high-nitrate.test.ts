import { describe, it, expect } from 'vitest';
import { highNitrateAlert, HIGH_NITRATE_THRESHOLD } from './high-nitrate.js';
import { createSimulation } from '../state.js';
import { produce } from 'immer';

describe('highNitrateAlert', () => {
  it('has correct id', () => {
    expect(highNitrateAlert.id).toBe('high-nitrate');
  });

  it('returns warning log when nitrate > 20 and not already triggered', () => {
    const state = createSimulation({ tankCapacity: 40 });
    const highNitrateState = produce(state, (draft) => {
      draft.resources.nitrate = 30;
      draft.tick = 500;
    });

    const result = highNitrateAlert.check(highNitrateState);

    expect(result.log).not.toBeNull();
    expect(result.log!.severity).toBe('warning');
    expect(result.log!.source).toBe('nitrogen-cycle');
    expect(result.log!.tick).toBe(500);
    expect(result.alertState.highNitrate).toBe(true);
  });

  it('returns null log when already triggered (threshold crossing detection)', () => {
    const state = createSimulation({ tankCapacity: 40 });
    const alreadyTriggeredState = produce(state, (draft) => {
      draft.resources.nitrate = 50;
      draft.alertState.highNitrate = true;
    });

    const result = highNitrateAlert.check(alreadyTriggeredState);

    expect(result.log).toBeNull();
    expect(result.alertState.highNitrate).toBe(true);
  });

  it('returns null log when nitrate <= 20', () => {
    const state = createSimulation({ tankCapacity: 40 });
    const normalState = produce(state, (draft) => {
      draft.resources.nitrate = 20;
    });

    const result = highNitrateAlert.check(normalState);

    expect(result.log).toBeNull();
    expect(result.alertState.highNitrate).toBe(false);
  });

  it('returns null log when nitrate is 0', () => {
    const state = createSimulation({ tankCapacity: 40 });

    const result = highNitrateAlert.check(state);

    expect(result.log).toBeNull();
    expect(result.alertState.highNitrate).toBe(false);
  });

  it('log message includes nitrate level', () => {
    const state = createSimulation({ tankCapacity: 40 });
    const highNitrateState = produce(state, (draft) => {
      draft.resources.nitrate = 45.5;
    });

    const result = highNitrateAlert.check(highNitrateState);

    expect(result.log).not.toBeNull();
    expect(result.log!.message).toContain('45.5');
  });

  it('log message suggests action', () => {
    const state = createSimulation({ tankCapacity: 40 });
    const highNitrateState = produce(state, (draft) => {
      draft.resources.nitrate = 30;
    });

    const result = highNitrateAlert.check(highNitrateState);

    expect(result.log!.message).toMatch(/water change|plants/i);
  });

  it('does not trigger at exactly 20 threshold', () => {
    const state = createSimulation({ tankCapacity: 40 });
    const atThreshold = produce(state, (draft) => {
      draft.resources.nitrate = 20;
    });

    const result = highNitrateAlert.check(atThreshold);
    expect(result.log).toBeNull();
    expect(result.alertState.highNitrate).toBe(false);
  });

  it('triggers just above 20 threshold', () => {
    const state = createSimulation({ tankCapacity: 40 });
    const aboveThreshold = produce(state, (draft) => {
      draft.resources.nitrate = 20.1;
    });

    const result = highNitrateAlert.check(aboveThreshold);
    expect(result.log).not.toBeNull();
    expect(result.alertState.highNitrate).toBe(true);
  });

  it('clears alert state when nitrate drops below threshold', () => {
    const state = createSimulation({ tankCapacity: 40 });
    const recoveredState = produce(state, (draft) => {
      draft.resources.nitrate = 15;
      draft.alertState.highNitrate = true;
    });

    const result = highNitrateAlert.check(recoveredState);

    expect(result.log).toBeNull();
    expect(result.alertState.highNitrate).toBe(false);
  });

  it('fires again after clearing and re-crossing threshold', () => {
    const state = createSimulation({ tankCapacity: 40 });

    // First crossing - fires
    const firstCross = produce(state, (draft) => {
      draft.resources.nitrate = 30;
      draft.alertState.highNitrate = false;
    });
    const firstResult = highNitrateAlert.check(firstCross);
    expect(firstResult.log).not.toBeNull();

    // Recovery - clears
    const recovered = produce(state, (draft) => {
      draft.resources.nitrate = 10;
      draft.alertState.highNitrate = true;
    });
    const recoveredResult = highNitrateAlert.check(recovered);
    expect(recoveredResult.alertState.highNitrate).toBe(false);

    // Second crossing - fires again
    const secondCross = produce(state, (draft) => {
      draft.resources.nitrate = 50;
      draft.alertState.highNitrate = false;
    });
    const secondResult = highNitrateAlert.check(secondCross);
    expect(secondResult.log).not.toBeNull();
  });

  it('handles very high nitrate levels (100+ ppm)', () => {
    const state = createSimulation({ tankCapacity: 40 });
    const extremeState = produce(state, (draft) => {
      draft.resources.nitrate = 150;
    });

    const result = highNitrateAlert.check(extremeState);

    expect(result.log).not.toBeNull();
    expect(result.alertState.highNitrate).toBe(true);
  });
});

describe('HIGH_NITRATE_THRESHOLD', () => {
  it('is set to 20', () => {
    expect(HIGH_NITRATE_THRESHOLD).toBe(20);
  });
});

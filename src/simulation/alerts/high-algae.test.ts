import { describe, it, expect } from 'vitest';
import { highAlgaeAlert, HIGH_ALGAE_THRESHOLD } from './high-algae.js';
import { createSimulation } from '../state.js';
import { produce } from 'immer';

describe('highAlgaeAlert', () => {
  it('has correct id', () => {
    expect(highAlgaeAlert.id).toBe('high-algae');
  });

  it('returns warning log when algae >= 80 and not already triggered', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const highAlgaeState = produce(state, (draft) => {
      draft.resources.algae = 80;
      draft.tick = 50;
    });

    const result = highAlgaeAlert.check(highAlgaeState);

    expect(result.log).not.toBeNull();
    expect(result.log!.severity).toBe('warning');
    expect(result.log!.source).toBe('algae');
    expect(result.log!.tick).toBe(50);
    expect(result.alertState.highAlgae).toBe(true);
  });

  it('returns null log when already triggered (threshold crossing detection)', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const alreadyTriggeredState = produce(state, (draft) => {
      draft.resources.algae = 85;
      draft.alertState.highAlgae = true;
    });

    const result = highAlgaeAlert.check(alreadyTriggeredState);

    expect(result.log).toBeNull();
    expect(result.alertState.highAlgae).toBe(true);
  });

  it('returns null log when algae < 80', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const normalAlgaeState = produce(state, (draft) => {
      draft.resources.algae = 79;
    });

    const result = highAlgaeAlert.check(normalAlgaeState);

    expect(result.log).toBeNull();
    expect(result.alertState.highAlgae).toBe(false);
  });

  it('returns null log when algae is 0', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const noAlgaeState = produce(state, (draft) => {
      draft.resources.algae = 0;
    });

    const result = highAlgaeAlert.check(noAlgaeState);

    expect(result.log).toBeNull();
    expect(result.alertState.highAlgae).toBe(false);
  });

  it('log message includes algae level and suggests action', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const highAlgaeState = produce(state, (draft) => {
      draft.resources.algae = 85.5;
    });

    const result = highAlgaeAlert.check(highAlgaeState);

    expect(result.log).not.toBeNull();
    expect(result.log!.message).toContain('85.5');
    expect(result.log!.message).toMatch(/light|scrub/i);
  });

  it('log has correct severity (warning) and source (algae)', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const highAlgaeState = produce(state, (draft) => {
      draft.resources.algae = 90;
    });

    const result = highAlgaeAlert.check(highAlgaeState);

    expect(result.log).not.toBeNull();
    expect(result.log!.severity).toBe('warning');
    expect(result.log!.source).toBe('algae');
  });

  it('triggers at exactly 80 threshold', () => {
    const state = createSimulation({ tankCapacity: 100 });

    // At exactly 80, should trigger
    const atThreshold = produce(state, (draft) => {
      draft.resources.algae = 80;
    });
    const atResult = highAlgaeAlert.check(atThreshold);
    expect(atResult.log).not.toBeNull();
    expect(atResult.alertState.highAlgae).toBe(true);

    // Just below 80, should NOT trigger
    const belowThreshold = produce(state, (draft) => {
      draft.resources.algae = 79.99;
    });
    const belowResult = highAlgaeAlert.check(belowThreshold);
    expect(belowResult.log).toBeNull();
    expect(belowResult.alertState.highAlgae).toBe(false);
  });

  it('triggers at maximum algae level (100)', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const maxAlgaeState = produce(state, (draft) => {
      draft.resources.algae = 100;
    });

    const result = highAlgaeAlert.check(maxAlgaeState);

    expect(result.log).not.toBeNull();
    expect(result.alertState.highAlgae).toBe(true);
  });

  it('clears alert state when algae drops below threshold', () => {
    const state = createSimulation({ tankCapacity: 100 });
    // Previously triggered, but algae is now below threshold
    const recoveredState = produce(state, (draft) => {
      draft.resources.algae = 70;
      draft.alertState.highAlgae = true;
    });

    const result = highAlgaeAlert.check(recoveredState);

    expect(result.log).toBeNull();
    expect(result.alertState.highAlgae).toBe(false);
  });

  it('fires again after clearing and re-crossing threshold', () => {
    const state = createSimulation({ tankCapacity: 100 });

    // First crossing - fires
    const firstCross = produce(state, (draft) => {
      draft.resources.algae = 85;
      draft.alertState.highAlgae = false;
    });
    const firstResult = highAlgaeAlert.check(firstCross);
    expect(firstResult.log).not.toBeNull();

    // Recovery - clears
    const recovered = produce(state, (draft) => {
      draft.resources.algae = 50;
      draft.alertState.highAlgae = true;
    });
    const recoveredResult = highAlgaeAlert.check(recovered);
    expect(recoveredResult.alertState.highAlgae).toBe(false);

    // Second crossing - fires again
    const secondCross = produce(state, (draft) => {
      draft.resources.algae = 90;
      draft.alertState.highAlgae = false;
    });
    const secondResult = highAlgaeAlert.check(secondCross);
    expect(secondResult.log).not.toBeNull();
  });

  it('does not trigger for moderate algae levels (30-79)', () => {
    const state = createSimulation({ tankCapacity: 100 });

    const levels = [30, 40, 50, 60, 70, 79];
    for (const level of levels) {
      const moderateState = produce(state, (draft) => {
        draft.resources.algae = level;
      });
      const result = highAlgaeAlert.check(moderateState);
      expect(result.log).toBeNull();
      expect(result.alertState.highAlgae).toBe(false);
    }
  });
});

describe('HIGH_ALGAE_THRESHOLD', () => {
  it('is set to 80', () => {
    expect(HIGH_ALGAE_THRESHOLD).toBe(80);
  });
});

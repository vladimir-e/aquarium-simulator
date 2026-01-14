import { describe, it, expect } from 'vitest';
import { highAmmoniaAlert, HIGH_AMMONIA_THRESHOLD_PPM } from './high-ammonia.js';
import { highNitriteAlert, HIGH_NITRITE_THRESHOLD_PPM } from './high-nitrite.js';
import { highNitrateAlert, HIGH_NITRATE_THRESHOLD_PPM } from './high-nitrate.js';
import { createSimulation, type SimulationState } from '../state.js';
import { produce } from 'immer';
import { ppmToGrams } from '../systems/nitrogen-cycle.js';

// ============================================================================
// High Ammonia Alert Tests
// ============================================================================

describe('highAmmoniaAlert', () => {
  function createTestState(ammoniaPpm: number, wasTriggered = false): SimulationState {
    const state = createSimulation({ tankCapacity: 100 });
    return produce(state, (draft) => {
      // Convert ppm to grams: grams = (ppm / 1000) * liters
      draft.resources.ammonia = ppmToGrams(ammoniaPpm, draft.tank.waterLevel);
      draft.alertState.highAmmonia = wasTriggered;
    });
  }

  it('has correct id', () => {
    expect(highAmmoniaAlert.id).toBe('high-ammonia');
  });

  it('threshold is 0.02 ppm', () => {
    expect(HIGH_AMMONIA_THRESHOLD_PPM).toBe(0.02);
  });

  it('does not trigger when ammonia is below threshold', () => {
    const state = createTestState(0.01); // Below 0.02 ppm
    const result = highAmmoniaAlert.check(state);

    expect(result.log).toBeNull();
    expect(result.alertState.highAmmonia).toBe(false);
  });

  it('does not trigger when ammonia equals threshold', () => {
    const state = createTestState(0.02); // Exactly at threshold
    const result = highAmmoniaAlert.check(state);

    expect(result.log).toBeNull();
    expect(result.alertState.highAmmonia).toBe(false);
  });

  it('triggers when ammonia exceeds threshold', () => {
    const state = createTestState(0.03); // Above threshold
    const result = highAmmoniaAlert.check(state);

    expect(result.log).not.toBeNull();
    expect(result.log!.source).toBe('nitrogen');
    expect(result.log!.severity).toBe('warning');
    expect(result.log!.message).toContain('ammonia');
    expect(result.alertState.highAmmonia).toBe(true);
  });

  it('does not re-trigger when already triggered', () => {
    const state = createTestState(0.05, true); // Above threshold, already triggered
    const result = highAmmoniaAlert.check(state);

    expect(result.log).toBeNull();
    expect(result.alertState.highAmmonia).toBe(true);
  });

  it('clears flag when ammonia drops below threshold', () => {
    const state = createTestState(0.01, true); // Below threshold, was triggered
    const result = highAmmoniaAlert.check(state);

    expect(result.log).toBeNull();
    expect(result.alertState.highAmmonia).toBe(false);
  });

  it('re-triggers after clearing when ammonia rises again', () => {
    // First, drop below to clear
    const lowState = createTestState(0.01, true);
    const clearResult = highAmmoniaAlert.check(lowState);
    expect(clearResult.alertState.highAmmonia).toBe(false);

    // Then rise above to re-trigger
    const highState = createTestState(0.03, false);
    const triggerResult = highAmmoniaAlert.check(highState);
    expect(triggerResult.log).not.toBeNull();
    expect(triggerResult.alertState.highAmmonia).toBe(true);
  });

  it('log message includes ppm value', () => {
    const state = createTestState(0.05);
    const result = highAmmoniaAlert.check(state);

    expect(result.log).not.toBeNull();
    expect(result.log!.message).toContain('ppm');
  });
});

// ============================================================================
// High Nitrite Alert Tests
// ============================================================================

describe('highNitriteAlert', () => {
  function createTestState(nitritePpm: number, wasTriggered = false): SimulationState {
    const state = createSimulation({ tankCapacity: 100 });
    return produce(state, (draft) => {
      draft.resources.nitrite = ppmToGrams(nitritePpm, draft.tank.waterLevel);
      draft.alertState.highNitrite = wasTriggered;
    });
  }

  it('has correct id', () => {
    expect(highNitriteAlert.id).toBe('high-nitrite');
  });

  it('threshold is 0.1 ppm', () => {
    expect(HIGH_NITRITE_THRESHOLD_PPM).toBe(0.1);
  });

  it('does not trigger when nitrite is below threshold', () => {
    const state = createTestState(0.05); // Below 0.1 ppm
    const result = highNitriteAlert.check(state);

    expect(result.log).toBeNull();
    expect(result.alertState.highNitrite).toBe(false);
  });

  it('does not trigger when nitrite equals threshold', () => {
    const state = createTestState(0.1); // Exactly at threshold
    const result = highNitriteAlert.check(state);

    expect(result.log).toBeNull();
    expect(result.alertState.highNitrite).toBe(false);
  });

  it('triggers when nitrite exceeds threshold', () => {
    const state = createTestState(0.2); // Above threshold
    const result = highNitriteAlert.check(state);

    expect(result.log).not.toBeNull();
    expect(result.log!.source).toBe('nitrogen');
    expect(result.log!.severity).toBe('warning');
    expect(result.log!.message).toContain('nitrite');
    expect(result.alertState.highNitrite).toBe(true);
  });

  it('does not re-trigger when already triggered', () => {
    const state = createTestState(0.5, true);
    const result = highNitriteAlert.check(state);

    expect(result.log).toBeNull();
    expect(result.alertState.highNitrite).toBe(true);
  });

  it('clears flag when nitrite drops below threshold', () => {
    const state = createTestState(0.05, true);
    const result = highNitriteAlert.check(state);

    expect(result.log).toBeNull();
    expect(result.alertState.highNitrite).toBe(false);
  });

  it('log message includes cycling information', () => {
    const state = createTestState(0.5);
    const result = highNitriteAlert.check(state);

    expect(result.log).not.toBeNull();
    expect(result.log!.message).toContain('cycling');
  });
});

// ============================================================================
// High Nitrate Alert Tests
// ============================================================================

describe('highNitrateAlert', () => {
  function createTestState(nitratePpm: number, wasTriggered = false): SimulationState {
    const state = createSimulation({ tankCapacity: 100 });
    return produce(state, (draft) => {
      draft.resources.nitrate = ppmToGrams(nitratePpm, draft.tank.waterLevel);
      draft.alertState.highNitrate = wasTriggered;
    });
  }

  it('has correct id', () => {
    expect(highNitrateAlert.id).toBe('high-nitrate');
  });

  it('threshold is 20 ppm', () => {
    expect(HIGH_NITRATE_THRESHOLD_PPM).toBe(20);
  });

  it('does not trigger when nitrate is below threshold', () => {
    const state = createTestState(15); // Below 20 ppm
    const result = highNitrateAlert.check(state);

    expect(result.log).toBeNull();
    expect(result.alertState.highNitrate).toBe(false);
  });

  it('does not trigger when nitrate equals threshold', () => {
    const state = createTestState(20); // Exactly at threshold
    const result = highNitrateAlert.check(state);

    expect(result.log).toBeNull();
    expect(result.alertState.highNitrate).toBe(false);
  });

  it('triggers when nitrate exceeds threshold', () => {
    const state = createTestState(25); // Above threshold
    const result = highNitrateAlert.check(state);

    expect(result.log).not.toBeNull();
    expect(result.log!.source).toBe('nitrogen');
    expect(result.log!.severity).toBe('warning');
    expect(result.log!.message).toContain('nitrate');
    expect(result.alertState.highNitrate).toBe(true);
  });

  it('does not re-trigger when already triggered', () => {
    const state = createTestState(50, true);
    const result = highNitrateAlert.check(state);

    expect(result.log).toBeNull();
    expect(result.alertState.highNitrate).toBe(true);
  });

  it('clears flag when nitrate drops below threshold', () => {
    const state = createTestState(10, true);
    const result = highNitrateAlert.check(state);

    expect(result.log).toBeNull();
    expect(result.alertState.highNitrate).toBe(false);
  });

  it('log message mentions water change or plants', () => {
    const state = createTestState(30);
    const result = highNitrateAlert.check(state);

    expect(result.log).not.toBeNull();
    expect(result.log!.message).toMatch(/water change|plants/i);
  });
});

// ============================================================================
// Integration with Alert System
// ============================================================================

describe('Alert Integration', () => {
  it('alerts are properly imported in alerts/index.ts', async () => {
    const alertsModule = await import('./index.js');

    expect(alertsModule.alerts).toContainEqual(expect.objectContaining({ id: 'high-ammonia' }));
    expect(alertsModule.alerts).toContainEqual(expect.objectContaining({ id: 'high-nitrite' }));
    expect(alertsModule.alerts).toContainEqual(expect.objectContaining({ id: 'high-nitrate' }));
  });

  it('threshold constants are exported from index', async () => {
    const alertsModule = await import('./index.js');

    expect(alertsModule.HIGH_AMMONIA_THRESHOLD_PPM).toBe(0.02);
    expect(alertsModule.HIGH_NITRITE_THRESHOLD_PPM).toBe(0.1);
    expect(alertsModule.HIGH_NITRATE_THRESHOLD_PPM).toBe(20);
  });
});

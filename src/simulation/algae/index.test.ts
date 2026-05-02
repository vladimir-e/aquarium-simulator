/**
 * Algae orchestrator tests.
 *
 * Coverage:
 * - `processAlgae`: full pipeline integration with vitality, surplus
 *   banking (photoperiod-gated), surplus spending, mass decay.
 * - `applyMassDecay`: monotonicity invariant — at condition === 100,
 *   mass is non-decreasing through this step. Condition 0 bleeds at
 *   full rate.
 * - `spendAlgaeSurplus`: surplus drains, mass increases, asymptotic
 *   factor self-limits at saturation.
 */

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import {
  processAlgae,
  applyMassDecay,
  spendAlgaeSurplus,
} from './index.js';
import { algaeVitalityDefaults } from '../config/algae-vitality.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { createSimulation, type SimulationState } from '../state.js';

function baseState(): SimulationState {
  return createSimulation({ tankCapacity: 100 });
}

describe('applyMassDecay', () => {
  it('does not decay when condition is 100', () => {
    const algae = { mass: 50, condition: 100, surplus: 0 };
    const next = applyMassDecay(algae, algaeVitalityDefaults);
    expect(next.mass).toBe(50);
  });

  it('does not decay when mass is zero', () => {
    const algae = { mass: 0, condition: 0, surplus: 0 };
    const next = applyMassDecay(algae, algaeVitalityDefaults);
    expect(next.mass).toBe(0);
  });

  it('decays at full rate when condition is 0', () => {
    // decayRate × (1 - 0/100) × mass = decayRate × mass
    const algae = { mass: 100, condition: 0, surplus: 0 };
    const next = applyMassDecay(algae, algaeVitalityDefaults);
    expect(next.mass).toBeCloseTo(100 - algaeVitalityDefaults.decayRate * 100, 8);
  });

  it('decays at half rate when condition is 50', () => {
    const algae = { mass: 100, condition: 50, surplus: 0 };
    const next = applyMassDecay(algae, algaeVitalityDefaults);
    expect(next.mass).toBeCloseTo(100 - algaeVitalityDefaults.decayRate * 0.5 * 100, 8);
  });

  it('clamps at zero', () => {
    const config = { ...algaeVitalityDefaults, decayRate: 10 };
    const algae = { mass: 1, condition: 0, surplus: 0 };
    const next = applyMassDecay(algae, config);
    expect(next.mass).toBe(0);
  });

  it('preserves condition and surplus fields', () => {
    const algae = { mass: 50, condition: 50, surplus: 5 };
    const next = applyMassDecay(algae, algaeVitalityDefaults);
    expect(next.condition).toBe(50);
    expect(next.surplus).toBe(5);
  });
});

describe('spendAlgaeSurplus', () => {
  it('drains surplus and increases mass when both are positive', () => {
    const algae = { mass: 0, condition: 100, surplus: 1 };
    const next = spendAlgaeSurplus(algae, algaeVitalityDefaults);
    expect(next.surplus).toBeLessThan(1);
    expect(next.mass).toBeGreaterThan(0);
  });

  it('caps drain per tick at algaeGrowthPerTickCap', () => {
    const algae = { mass: 0, condition: 100, surplus: 1000 };
    const next = spendAlgaeSurplus(algae, algaeVitalityDefaults);
    const drained = 1000 - next.surplus;
    expect(drained).toBeCloseTo(algaeVitalityDefaults.algaeGrowthPerTickCap, 8);
  });

  it('asymptotic factor → no growth when mass is at saturation', () => {
    const algae = { mass: 100, condition: 100, surplus: 10 };
    const next = spendAlgaeSurplus(algae, algaeVitalityDefaults);
    // Drain still happens (factor on efficiency, not withdrawal),
    // but mass stays at 100.
    expect(next.mass).toBe(100);
    expect(next.surplus).toBeLessThan(10);
  });

  it('clamps mass at 100', () => {
    // Force a single-tick large gain via config knobs.
    const config = { ...algaeVitalityDefaults, massPerSurplus: 100, algaeGrowthPerTickCap: 100 };
    const algae = { mass: 90, condition: 100, surplus: 100 };
    const next = spendAlgaeSurplus(algae, config);
    expect(next.mass).toBe(100);
  });

  it('no-op when surplus is zero', () => {
    const algae = { mass: 50, condition: 100, surplus: 0 };
    const next = spendAlgaeSurplus(algae, algaeVitalityDefaults);
    expect(next).toEqual(algae);
  });
});

describe('processAlgae', () => {
  it('returns unchanged-shape state object', () => {
    const state = baseState();
    const { state: out } = processAlgae(state, DEFAULT_CONFIG);
    expect(out.algae).toBeDefined();
    expect(typeof out.algae.mass).toBe('number');
    expect(typeof out.algae.condition).toBe('number');
    expect(typeof out.algae.surplus).toBe('number');
  });

  it('mass is monotonically non-decreasing when condition is pinned at 100', () => {
    // No plants, no light → vitality net is zero, condition stays at 100.
    // At light = 0 surplus banking is gated off, so mass should not change.
    const state = produce(baseState(), (draft) => {
      draft.algae = { mass: 50, condition: 100, surplus: 0 };
      draft.resources.light = 0;
    });
    const { state: out } = processAlgae(state, DEFAULT_CONFIG);
    expect(out.algae.mass).toBeGreaterThanOrEqual(50);
    // Spec invariant: condition still 100 → no mass decay step
    expect(out.algae.condition).toBe(100);
  });

  it('mass decays when condition is below 100 and lights are off', () => {
    const state = produce(baseState(), (draft) => {
      draft.algae = { mass: 80, condition: 50, surplus: 0 };
      draft.resources.light = 0;
    });
    const { state: out } = processAlgae(state, DEFAULT_CONFIG);
    // Decay runs 24/7, surplus banking does not (lights off).
    expect(out.algae.mass).toBeLessThan(80);
  });

  it('photoperiod gates surplus banking — no mass growth at night', () => {
    // Set up a benefit-positive scenario at lights off — surplus
    // would be emitted by vitality but should be discarded.
    const state = produce(baseState(), (draft) => {
      draft.algae = { mass: 0, condition: 100, surplus: 0 };
      draft.resources.light = 0;
      draft.resources.nitrate = 0; // no excess nutrients
    });
    const { state: out } = processAlgae(state, DEFAULT_CONFIG);
    expect(out.algae.surplus).toBe(0);
    expect(out.algae.mass).toBe(0);
  });

  it('lights on + benefit-positive scenario → surplus banks and converts to mass', () => {
    // Pure-light tank scenario: no plants, no nutrients, just
    // photons. Excess light → benefit; low plant power → benefit.
    const state = produce(baseState(), (draft) => {
      draft.algae = { mass: 0, condition: 100, surplus: 0 };
      draft.resources.light = 100; // 1.0 W/L on a 100L tank — well above threshold
      draft.resources.nitrate = 0;
      draft.resources.phosphate = 0;
    });
    const { state: out } = processAlgae(state, DEFAULT_CONFIG);
    // Surplus emitted, drained into mass — ending mass > 0.
    expect(out.algae.mass).toBeGreaterThan(0);
    // Bank may still hold any leftover; spec doesn't require zero.
    expect(out.algae.surplus).toBeGreaterThanOrEqual(0);
  });
});

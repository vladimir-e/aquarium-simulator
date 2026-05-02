/**
 * Algae orchestrator tests.
 *
 * Coverage:
 * - `processAlgae`: full pipeline integration with population
 *   computation, surplus banking (positive net, photoperiod-gated),
 *   direct mass shrinkage (negative net, 24/7), and surplus → mass
 *   conversion.
 * - `spendAlgaeSurplus`: surplus drains, mass increases, asymptotic
 *   factor self-limits at saturation.
 */

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { processAlgae, spendAlgaeSurplus } from './index.js';
import { algaeVitalityDefaults } from '../config/algae-vitality.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { createSimulation, type SimulationState } from '../state.js';

function baseState(): SimulationState {
  return createSimulation({ tankCapacity: 100 });
}

describe('spendAlgaeSurplus', () => {
  it('drains surplus and increases mass when both are positive', () => {
    const algae = { mass: 0, surplus: 1 };
    const next = spendAlgaeSurplus(algae, algaeVitalityDefaults);
    expect(next.surplus).toBeLessThan(1);
    expect(next.mass).toBeGreaterThan(0);
  });

  it('caps drain per tick at algaeGrowthPerTickCap', () => {
    const algae = { mass: 0, surplus: 1000 };
    const next = spendAlgaeSurplus(algae, algaeVitalityDefaults);
    const drained = 1000 - next.surplus;
    expect(drained).toBeCloseTo(algaeVitalityDefaults.algaeGrowthPerTickCap, 8);
  });

  it('asymptotic factor → no growth when mass is at saturation', () => {
    const algae = { mass: 100, surplus: 10 };
    const next = spendAlgaeSurplus(algae, algaeVitalityDefaults);
    // Drain still happens (factor on efficiency, not withdrawal),
    // but mass stays at 100.
    expect(next.mass).toBe(100);
    expect(next.surplus).toBeLessThan(10);
  });

  it('clamps mass at 100', () => {
    // Force a single-tick large gain via config knobs.
    const config = { ...algaeVitalityDefaults, massPerSurplus: 100, algaeGrowthPerTickCap: 100 };
    const algae = { mass: 90, surplus: 100 };
    const next = spendAlgaeSurplus(algae, config);
    expect(next.mass).toBe(100);
  });

  it('no-op when surplus is zero', () => {
    const algae = { mass: 50, surplus: 0 };
    const next = spendAlgaeSurplus(algae, algaeVitalityDefaults);
    expect(next).toEqual(algae);
  });
});

describe('processAlgae', () => {
  it('returns a state object with the expected algae shape', () => {
    const state = baseState();
    const { state: out } = processAlgae(state, DEFAULT_CONFIG);
    expect(out.algae).toBeDefined();
    expect(typeof out.algae.mass).toBe('number');
    expect(typeof out.algae.surplus).toBe('number');
    // condition is gone — confirm explicitly so a regression sneaking
    // it back in fails loudly.
    expect((out.algae as Record<string, unknown>).condition).toBeUndefined();
  });

  it('mass is non-decreasing while net ≥ 0 and lights are off', () => {
    // No plants, no light → no benefits or stressors fire (light gate
    // on excess_light, plant power 0 in the deadband below weakness
    // when... actually plant power 0 < weaknessThreshold so low_plant_power
    // fires). With nutrients at zero and no plants, deficiency benefit
    // also fires. With lights off, surplus banking is gated — but mass
    // still cannot decrease through the orchestrator because net ≥ 0.
    const state = produce(baseState(), (draft) => {
      draft.algae = { mass: 50, surplus: 0 };
      draft.resources.light = 0;
    });
    const { state: out } = processAlgae(state, DEFAULT_CONFIG);
    expect(out.algae.mass).toBeGreaterThanOrEqual(50);
    // No surplus banked overnight even though net is positive.
    expect(out.algae.surplus).toBe(0);
  });

  it('negative net shrinks mass directly (24/7, lights off)', () => {
    // Heavy plants → suppression dominates. Lights off; the new
    // pipeline shrinks mass by the negative net regardless of
    // photoperiod.
    let state = baseState();
    state = produce(state, (draft) => {
      draft.algae = { mass: 80, surplus: 0 };
      draft.resources.light = 0;
      // Plants thriving — full power, well above suppressionThreshold.
      draft.plants = [
        { id: 'p1', species: 'amazon_sword', size: 200, condition: 100, surplus: 0 },
        { id: 'p2', species: 'monte_carlo', size: 200, condition: 100, surplus: 0 },
        { id: 'p3', species: 'java_fern', size: 200, condition: 100, surplus: 0 },
      ];
    });
    const { state: out } = processAlgae(state, DEFAULT_CONFIG);
    expect(out.algae.mass).toBeLessThan(80);
    // No surplus banking at night, and no positive net to bank anyway.
    expect(out.algae.surplus).toBe(0);
  });

  it('photoperiod gates surplus banking — positive net at night yields no growth', () => {
    // Pure-light scenario but with light = 0. Vitality would compute
    // positive net (low_plant_power + nutrient_deficiency benefits),
    // but the orchestrator's photoperiod gate discards the bank.
    const state = produce(baseState(), (draft) => {
      draft.algae = { mass: 0, surplus: 0 };
      draft.resources.light = 0;
      draft.resources.nitrate = 0;
      draft.resources.phosphate = 0;
    });
    const { state: out } = processAlgae(state, DEFAULT_CONFIG);
    expect(out.algae.surplus).toBe(0);
    expect(out.algae.mass).toBe(0);
  });

  it('lights on + positive net → surplus banks unconditionally and converts to mass', () => {
    // Pure-light tank scenario: no plants, no nutrients, just photons.
    // Excess light + low plant power + nutrient deficiency benefits
    // stack with no stressors. Surplus banking should fire whether
    // the bloom started fresh (mass = 0) or established (mass > 0) —
    // there is no condition gate any more.
    const state = produce(baseState(), (draft) => {
      draft.algae = { mass: 0, surplus: 0 };
      draft.resources.light = 100; // 1.0 W/L on a 100L tank — well above threshold
      draft.resources.nitrate = 0;
      draft.resources.phosphate = 0;
    });
    const { state: out } = processAlgae(state, DEFAULT_CONFIG);
    expect(out.algae.mass).toBeGreaterThan(0);
    expect(out.algae.surplus).toBeGreaterThanOrEqual(0);
  });

  it('lights on + positive net at established mass → surplus also banks', () => {
    // Same pure-light scenario, but with existing mass. Old pipeline
    // gated banking on condition === 100; new pipeline only gates on
    // photoperiod and net sign.
    const state = produce(baseState(), (draft) => {
      draft.algae = { mass: 60, surplus: 0 };
      draft.resources.light = 100;
      draft.resources.nitrate = 0;
      draft.resources.phosphate = 0;
    });
    const { state: out } = processAlgae(state, DEFAULT_CONFIG);
    expect(out.algae.mass).toBeGreaterThan(60);
  });

  it('mass cannot go negative when net is large and negative', () => {
    // Pathological scenario: massive negative net with low mass.
    // Direct mass + net step clamps at 0.
    let state = baseState();
    state = produce(state, (draft) => {
      draft.algae = { mass: 0.001, surplus: 0 };
      draft.resources.light = 0;
      draft.plants = [
        { id: 'p1', species: 'amazon_sword', size: 200, condition: 100, surplus: 0 },
        { id: 'p2', species: 'monte_carlo', size: 200, condition: 100, surplus: 0 },
        { id: 'p3', species: 'java_fern', size: 200, condition: 100, surplus: 0 },
      ];
    });
    const { state: out } = processAlgae(state, DEFAULT_CONFIG);
    expect(out.algae.mass).toBe(0);
  });
});

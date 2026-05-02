/**
 * Integration tests for the algae-as-organism mechanic.
 *
 * These run multi-day simulations to verify the full
 * vitality → surplus → mass → decay loop behaves as the spec
 * describes:
 *
 * - Heavy plants in a healthy tank push algae condition below 100
 *   and mass shrinks visibly within a few sim days (mechanism, not
 *   exact rate).
 * - Pure-light tank with no plants and no dosing accumulates algae
 *   mass via the excess-light benefit alone, capped at 100.
 *
 * Calibration is deferred — these test mechanism, not numbers.
 */

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { tick } from '../tick.js';
import { applyAction } from '../actions/index.js';
import { createSimulation, type SimulationState } from '../state.js';
import { DEFAULT_CONFIG } from '../config/index.js';

function runTicks(state: SimulationState, ticks: number): SimulationState {
  let s = state;
  for (let i = 0; i < ticks; i++) {
    s = tick(s, DEFAULT_CONFIG);
  }
  return s;
}

function setupTank(): SimulationState {
  // 100L planted-style setup with steady CO2 and a moderate light.
  return createSimulation({
    tankCapacity: 100,
    initialTemperature: 25,
    light: { enabled: true, wattage: 30, schedule: { startHour: 8, duration: 8 } },
    co2Generator: { enabled: true, bubbleRate: 1.0, schedule: { startHour: 7, duration: 10 } },
    filter: { enabled: true, type: 'canister' },
    substrate: { type: 'aqua_soil' },
  });
}

describe('algae as organism — heavy planted tank suppresses an existing bloom', () => {
  it('mass shrinks when plants are healthy and the bloom started above the threshold', () => {
    let state = setupTank();
    // Start with a meaningful bloom so we can observe shrink.
    state = produce(state, (draft) => {
      draft.algae = { mass: 50, condition: 100, surplus: 0 };
    });
    // Add several thriving plants — power well above suppression threshold.
    state = applyAction(state, { type: 'addPlant', species: 'amazon_sword', initialSize: 80 }).state;
    state = applyAction(state, { type: 'addPlant', species: 'amazon_sword', initialSize: 80 }).state;
    state = applyAction(state, { type: 'addPlant', species: 'java_fern', initialSize: 80 }).state;

    const startMass = state.algae.mass;

    // Run 7 sim days.
    state = runTicks(state, 24 * 7);

    // Spec: condition drops below 100; mass shrinks visibly. We do
    // not pin the rate — calibration follows.
    expect(state.algae.condition).toBeLessThan(100);
    expect(state.algae.mass).toBeLessThan(startMass);
  });
});

describe('algae as organism — pure-light tank grows mass via excess light alone', () => {
  it('with no plants, no dosing, the bloom accumulates mass over a week', () => {
    // High light setup — well above algaeVitalityDefaults.lightExcessThreshold (0.5 W/L).
    let state = createSimulation({
      tankCapacity: 100,
      light: { enabled: true, wattage: 80, schedule: { startHour: 8, duration: 8 } },
      filter: { enabled: true, type: 'canister' },
    });

    // No plants, no dosing — the "neglected" scenario the spec
    // names explicitly.
    state = produce(state, (draft) => {
      draft.algae = { mass: 0, condition: 100, surplus: 0 };
      draft.resources.nitrate = 0;
      draft.resources.phosphate = 0;
    });

    const startMass = state.algae.mass;
    state = runTicks(state, 24 * 7);
    // Mechanism: excess_light + low_plant_power + nutrient_deficiency
    // benefits stack, condition stays at 100, surplus banks, mass
    // accumulates. Mass should be visibly above the start.
    expect(state.algae.mass).toBeGreaterThan(startMass);
    expect(state.algae.mass).toBeLessThanOrEqual(100); // hard cap
  });
});

describe('algae as organism — monotonicity at full condition', () => {
  it('mass does not decay through the orchestrator while condition === 100', () => {
    // Stage a state where the vitality engine cannot force condition
    // below 100: empty tank with lights off, no benefits or stressors,
    // condition pinned at 100.
    const state = produce(createSimulation({ tankCapacity: 100 }), (draft) => {
      draft.algae = { mass: 50, condition: 100, surplus: 0 };
      draft.resources.light = 0; // lights off — no W/L excess
    });

    // Run a single tick — `processAlgae` should not call mass decay.
    const next = runTicks(state, 1);
    // With no surplus and condition at 100, mass should be unchanged.
    expect(next.algae.mass).toBeGreaterThanOrEqual(50);
    expect(next.algae.condition).toBe(100);
  });
});

describe('algae as organism — plant-side feedback (algae shading)', () => {
  it('a heavy bloom drives plant condition down via algae_shading', () => {
    let state = setupTank();
    // Start with a bloom well above the 30-mass shading threshold.
    state = produce(state, (draft) => {
      draft.algae = { mass: 80, condition: 100, surplus: 0 };
    });
    // Use a hardy species (Anubias hardiness 0.75) so it doesn't die
    // before we observe the shading signal — the test is about
    // plumbing (algae mass → plant stressor), not about killing
    // the plant.
    state = applyAction(state, { type: 'addPlant', species: 'anubias', initialSize: 80 }).state;

    const startCondition = state.plants[0].condition;

    // Run for a single sim day — long enough to see the signal
    // start, short enough to not enter scrub-or-die territory. The
    // algae shading stressor reads `state.algae.mass` and gates at
    // threshold 30 — well below the 80 we staged.
    state = runTicks(state, 24);

    // Plant should still be alive.
    expect(state.plants.length).toBe(1);
    // And its condition should have dropped from the starting value.
    expect(state.plants[0].condition).toBeLessThan(startCondition);
  });
});

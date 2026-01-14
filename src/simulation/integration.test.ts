import { describe, it, expect } from 'vitest';
import { createSimulation } from './state.js';
import { tick } from './tick.js';
import { applyAction } from './actions/index.js';

describe('Food-Decay-Waste integration', () => {
  it('feeding increases food resource', () => {
    const state = createSimulation({ tankCapacity: 100 });
    const result = applyAction(state, { type: 'feed', amount: 0.5 });

    expect(result.state.resources.food).toBe(0.5);
  });

  it('food decays to waste over time', () => {
    let state = createSimulation({ tankCapacity: 100 });
    state = applyAction(state, { type: 'feed', amount: 1.0 }).state;

    const initialFood = state.resources.food;
    const initialWaste = state.resources.waste;

    // Run one tick
    state = tick(state);

    expect(state.resources.food).toBeLessThan(initialFood);
    expect(state.resources.waste).toBeGreaterThan(initialWaste);
  });

  it('waste accumulates from decay', () => {
    let state = createSimulation({ tankCapacity: 100 });
    state = applyAction(state, { type: 'feed', amount: 1.0 }).state;

    const initialWaste = state.resources.waste;

    // Run multiple ticks
    for (let i = 0; i < 5; i++) {
      state = tick(state);
    }

    expect(state.resources.waste).toBeGreaterThan(initialWaste);
  });

  it('ambient waste accumulates continuously', () => {
    let state = createSimulation({ tankCapacity: 100 });

    // No food added, just run ticks
    const initialWaste = state.resources.waste;

    for (let i = 0; i < 10; i++) {
      state = tick(state);
    }

    // Ambient waste is added (0.01g/tick) but nitrogen cycle converts 30% of waste to ammonia per tick.
    // The waste level should still increase due to ambient waste production exceeding conversion.
    // After 10 ticks, waste should be greater than initial but less than simple accumulation.
    expect(state.resources.waste).toBeGreaterThan(initialWaste);

    // Ammonia should also have been produced from the waste conversion
    expect(state.resources.ammonia).toBeGreaterThan(0);
  });

  it('higher temperature increases decay rate', () => {
    // Create two states with different temperatures
    let coldState = createSimulation({
      tankCapacity: 100,
      initialTemperature: 20,
    });
    let hotState = createSimulation({
      tankCapacity: 100,
      initialTemperature: 30,
    });

    // Add same amount of food
    coldState = applyAction(coldState, { type: 'feed', amount: 1.0 }).state;
    hotState = applyAction(hotState, { type: 'feed', amount: 1.0 }).state;

    // Run one tick
    coldState = tick(coldState);
    hotState = tick(hotState);

    // Hot tank should have less food remaining (decayed faster)
    expect(hotState.resources.food).toBeLessThan(coldState.resources.food);
    // Hot tank should have more waste
    expect(hotState.resources.waste).toBeGreaterThan(coldState.resources.waste);
  });

  it('lower temperature decreases decay rate', () => {
    // Create two states with different temperatures
    let coldState = createSimulation({
      tankCapacity: 100,
      initialTemperature: 15,
    });
    let normalState = createSimulation({
      tankCapacity: 100,
      initialTemperature: 25,
    });

    // Add same amount of food
    coldState = applyAction(coldState, { type: 'feed', amount: 1.0 }).state;
    normalState = applyAction(normalState, { type: 'feed', amount: 1.0 }).state;

    // Run one tick
    coldState = tick(coldState);
    normalState = tick(normalState);

    // Cold tank should have more food remaining (decayed slower)
    expect(coldState.resources.food).toBeGreaterThan(normalState.resources.food);
  });

  it('all food eventually decays if no consumption', () => {
    let state = createSimulation({ tankCapacity: 100 });
    state = applyAction(state, { type: 'feed', amount: 1.0 }).state;

    // Run many ticks
    for (let i = 0; i < 100; i++) {
      state = tick(state);
    }

    // Food should be nearly zero (exponential decay)
    expect(state.resources.food).toBeLessThan(0.01);
  });

  it('decay happens in PASSIVE tier (after IMMEDIATE and ACTIVE)', () => {
    // This is implicit in the tick order, but we can verify by checking
    // that equipment effects (heater) are applied before decay
    let state = createSimulation({
      tankCapacity: 100,
      initialTemperature: 20,
      roomTemperature: 20,
      heater: { enabled: true, targetTemperature: 30 },
    });
    state = applyAction(state, { type: 'feed', amount: 1.0 }).state;

    const initialFood = state.resources.food;
    state = tick(state);

    // Heater should have raised temperature (IMMEDIATE tier)
    // Decay rate would be calculated using the new temperature (PASSIVE tier)
    expect(state.resources.temperature).toBeGreaterThan(20);
    expect(state.resources.food).toBeLessThan(initialFood);
  });

  it('food and waste maintain precision', () => {
    let state = createSimulation({ tankCapacity: 100 });
    state = applyAction(state, { type: 'feed', amount: 0.25 }).state;

    // Run a few ticks
    for (let i = 0; i < 3; i++) {
      state = tick(state);
    }

    // Values should remain reasonable (not NaN, not extreme)
    expect(Number.isFinite(state.resources.food)).toBe(true);
    expect(Number.isFinite(state.resources.waste)).toBe(true);
    expect(state.resources.food).toBeGreaterThanOrEqual(0);
    expect(state.resources.waste).toBeGreaterThanOrEqual(0);
  });
});

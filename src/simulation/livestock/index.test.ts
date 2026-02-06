import { describe, it, expect } from 'vitest';
import { processLivestock } from './index.js';
import { createSimulation, type SimulationState } from '../state.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { produce } from 'immer';
import type { Fish } from '../state.js';

function makeFish(overrides: Partial<Fish> = {}): Fish {
  return {
    id: 'fish_1',
    species: 'neon_tetra',
    mass: 0.5,
    health: 100,
    age: 0,
    hunger: 50,
    sex: 'male',
    ...overrides,
  };
}

function makeState(fish: Fish[] = []): SimulationState {
  const state = createSimulation({ tankCapacity: 100 });
  return produce(state, (draft) => {
    draft.fish = fish;
    draft.resources.food = 5; // Ample food
    draft.resources.oxygen = 8.0;
  });
}

describe('processLivestock', () => {
  it('returns unchanged state when no fish', () => {
    const state = makeState();
    const result = processLivestock(state, DEFAULT_CONFIG);

    expect(result.state.fish).toHaveLength(0);
    expect(result.effects).toHaveLength(0);
  });

  it('processes metabolism: food consumed and waste produced', () => {
    const state = makeState([makeFish({ hunger: 50, mass: 1.0 })]);
    const result = processLivestock(state, DEFAULT_CONFIG);

    // Should have food consumption effect
    const foodEffect = result.effects.find((e) => e.resource === 'food');
    expect(foodEffect).toBeDefined();
    expect(foodEffect!.delta).toBeLessThan(0);

    // Should have waste production effect
    const wasteEffect = result.effects.find((e) => e.resource === 'waste');
    expect(wasteEffect).toBeDefined();
    expect(wasteEffect!.delta).toBeGreaterThan(0);
  });

  it('processes respiration: O2 consumed and CO2 produced', () => {
    const state = makeState([makeFish({ mass: 2.0 })]);
    const result = processLivestock(state, DEFAULT_CONFIG);

    const o2Effect = result.effects.find((e) => e.resource === 'oxygen');
    expect(o2Effect).toBeDefined();
    expect(o2Effect!.delta).toBeLessThan(0);

    const co2Effect = result.effects.find((e) => e.resource === 'co2');
    expect(co2Effect).toBeDefined();
    expect(co2Effect!.delta).toBeGreaterThan(0);
  });

  it('updates fish hunger and age', () => {
    const state = makeState([makeFish({ hunger: 20, age: 100 })]);
    const result = processLivestock(state, DEFAULT_CONFIG);

    expect(result.state.fish[0].age).toBe(101);
    // Hunger should have changed (increased by rate, possibly reduced by food)
    expect(result.state.fish[0].hunger).not.toBe(20);
  });

  it('updates fish health', () => {
    const state = makeState([makeFish({ health: 90 })]);
    const result = processLivestock(state, DEFAULT_CONFIG);

    // In ideal conditions, health should recover toward 100
    expect(result.state.fish[0].health).toBeGreaterThanOrEqual(90);
  });

  it('removes dead fish and logs death', () => {
    const state = produce(makeState([makeFish({ health: 1 })]), (draft) => {
      // Lethal ammonia
      draft.resources.ammonia = 5000;
    });

    const result = processLivestock(state, DEFAULT_CONFIG);

    expect(result.state.fish).toHaveLength(0);
    // Should have a death log
    const deathLogs = result.state.logs.filter((l) => l.message.includes('died'));
    expect(deathLogs.length).toBeGreaterThan(0);
  });

  it('produces death waste effect when fish dies', () => {
    const state = produce(makeState([makeFish({ health: 1, mass: 4.0 })]), (draft) => {
      draft.resources.ammonia = 10000;
    });

    const result = processLivestock(state, DEFAULT_CONFIG);

    const deathWasteEffect = result.effects.find(
      (e) => e.resource === 'waste' && e.source === 'fish-death'
    );
    expect(deathWasteEffect).toBeDefined();
    expect(deathWasteEffect!.delta).toBeGreaterThan(0);
  });

  it('handles multiple fish', () => {
    const state = makeState([
      makeFish({ id: 'f1', mass: 1.0 }),
      makeFish({ id: 'f2', mass: 2.0 }),
      makeFish({ id: 'f3', mass: 3.0 }),
    ]);

    const result = processLivestock(state, DEFAULT_CONFIG);

    expect(result.state.fish).toHaveLength(3);

    // Total O2 should be sum of all fish respiration
    const o2Effect = result.effects.find((e) => e.resource === 'oxygen');
    expect(o2Effect).toBeDefined();
    // (0.02 * 1) + (0.02 * 2) + (0.02 * 3) = 0.12
    expect(o2Effect!.delta).toBeCloseTo(-0.12, 3);
  });

  it('effect sources are correctly labeled', () => {
    const state = makeState([makeFish({ hunger: 50 })]);
    const result = processLivestock(state, DEFAULT_CONFIG);

    const sources = result.effects.map((e) => e.source);
    expect(sources).toContain('fish-metabolism');
    expect(sources).toContain('fish-respiration');
  });
});

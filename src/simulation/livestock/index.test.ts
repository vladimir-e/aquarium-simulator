import { describe, it, expect } from 'vitest';
import { processLivestock } from './index.js';
import { createSimulation, type SimulationState } from '../state.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { produce } from 'immer';
import { monodFactor } from '../core/kinetics.js';
import { metabolicMass } from '../systems/digestion.js';
import type { Fish } from '../state.js';
import { fishRecord } from '../tests/fish.js';

function makeFish(overrides: Partial<Fish> = {}): Fish {
  return fishRecord({ gut: 0.01, ...overrides });
}

function makeState(fish: Fish[] = []): SimulationState {
  const state = createSimulation({ tankCapacity: 100 });
  return produce(state, (draft) => {
    draft.fish = fish;
    draft.resources.food = 5;
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

  it('eats, and leaves the hour’s digestion to be excreted once growth has built from it', () => {
    const state = makeState([makeFish({ mass: 1.0 })]);
    const result = processLivestock(state, DEFAULT_CONFIG);

    expect(result.effects.find((e) => e.resource === 'food')!.delta).toBeLessThan(0);
    expect(result.metabolism.digested[0]).toBeGreaterThan(0);
    expect(result.effects.some((e) => e.resource === 'waste' || e.resource === 'ammonia')).toBe(false);
  });

  it('returns the metabolism and a vitality per fish handed in, the dead included', () => {
    const state = produce(
      makeState([makeFish({ id: 'f1', mass: 1.0 }), makeFish({ id: 'f2', health: 1 })]),
      (draft) => {
        draft.resources.ammonia = 5000;
      }
    );
    const result = processLivestock(state, DEFAULT_CONFIG);

    expect(result.metabolism.updatedFish.map((fish) => fish.id)).toEqual(['f1', 'f2']);
    expect(result.vitalities).toHaveLength(2);
    expect(result.vitalities[1].newCondition).toBe(0);
    expect(result.state.fish.map((fish) => [fish.id, fish.health, fish.surplus])).toEqual([
      ['f1', result.vitalities[0].newCondition, result.vitalities[0].surplus],
    ]);
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

  it("moves each fish's gut and age on", () => {
    const state = makeState([makeFish({ gut: 0.001, age: 100 })]);
    const result = processLivestock(state, DEFAULT_CONFIG);

    expect(result.state.fish[0].age).toBe(101);
    expect(result.state.fish[0].gut).toBeGreaterThan(0.001);
  });

  it('removes dead fish and logs death', () => {
    const state = produce(makeState([makeFish({ health: 1 })]), (draft) => {
      draft.resources.ammonia = 5000;
    });

    const result = processLivestock(state, DEFAULT_CONFIG);

    expect(result.state.fish).toHaveLength(0);
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

    const o2Effect = result.effects.find((e) => e.resource === 'oxygen');
    expect(o2Effect).toBeDefined();
    const expectedDelta =
      -(
        DEFAULT_CONFIG.livestock.baseRespirationRate *
        state.fish.reduce((total, fish) => total + metabolicMass(fish, DEFAULT_CONFIG.livestock), 0) *
        monodFactor(
          state.resources.oxygen,
          DEFAULT_CONFIG.livestock.respirationOxygenHalfSaturation
        )
      ) / state.resources.water;
    expect(o2Effect!.delta).toBeCloseTo(expectedDelta, 6);
  });
});

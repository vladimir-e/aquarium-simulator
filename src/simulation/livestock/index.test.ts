import { describe, it, expect } from 'vitest';
import { deltaOf } from '../core/effects.js';
import { burnEffects, processLivestock, tankPaces } from './index.js';
import { createSimulation, type SimulationState } from '../state.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { produce } from 'immer';
import type { Fish } from '../state.js';
import { burn, fishPace } from '../systems/metabolism.js';
import { calculateO2Saturation } from '../systems/gas-exchange.js';
import { getPpm } from '../resources/index.js';
import { fishRecord } from '../tests/fish.js';

function makeFish(overrides: Partial<Fish> & { size?: number } = {}): Fish {
  return fishRecord({ gut: 0.001, ...overrides });
}

function makeState(fish: Fish[] = []): SimulationState {
  const state = createSimulation({ tankCapacity: 100 });
  return produce(state, (draft) => {
    draft.fish = fish;
    draft.resources.food = 5;
    draft.resources.oxygen = 8.0;
  });
}

const effectOf = (result: ReturnType<typeof processLivestock>, resource: string, source?: string): number =>
  result.effects
    .filter((e) => e.resource === resource && (source === undefined || e.source === source))
    .reduce((sum, e) => sum + deltaOf(e), 0);

describe('processLivestock', () => {
  it('returns unchanged state when no fish', () => {
    const state = makeState();
    const result = processLivestock(state, DEFAULT_CONFIG);

    expect(result.state.fish).toHaveLength(0);
    expect(result.effects).toHaveLength(0);
  });

  it('paces every fish on its species and the tank’s water', () => {
    const state = makeState([makeFish({ species: 'guppy' }), makeFish({ species: 'angelfish' })]);
    const saturation = calculateO2Saturation(state.resources.temperature, DEFAULT_CONFIG.gasExchange);
    expect(tankPaces(state, DEFAULT_CONFIG)).toEqual(
      state.fish.map((f) => fishPace(f.species, state.resources, saturation, DEFAULT_CONFIG.livestock))
    );
  });

  it('eats, passes its feces as waste and burns what its budget burned', () => {
    const result = processLivestock(makeState([makeFish({ id: 'a' }), makeFish({ id: 'b', size: 40 })]), DEFAULT_CONFIG);

    expect(effectOf(result, 'food')).toBeLessThan(0);
    expect(effectOf(result, 'waste', 'fish-metabolism')).toBeCloseTo(result.feces, 15);
    expect(result.feces).toBeGreaterThan(0);
    const { water } = makeState().resources;
    const burnt = burn(result.burned, DEFAULT_CONFIG.livestock, DEFAULT_CONFIG.nutrients.foodMineralContent);
    expect(effectOf(result, 'oxygen')).toBeCloseTo(-getPpm(burnt.oxygen, water), 15);
    expect(effectOf(result, 'co2')).toBeCloseTo(getPpm(burnt.co2, water), 15);
    expect(effectOf(result, 'ammonia')).toBeCloseTo(burnt.ammonia, 15);
  });

  it('turns a burn into gill ammonia, minerals, an oxygen draw and CO2, and nothing of nothing', () => {
    const effects = burnEffects(0.01, 100, DEFAULT_CONFIG.livestock, DEFAULT_CONFIG.nutrients.foodMineralContent, 'x');
    expect(effects.map((e) => e.resource)).toEqual(
      expect.arrayContaining(['ammonia', 'kh', 'phosphate', 'potassium', 'iron', 'oxygen', 'co2'])
    );
    expect(burnEffects(0, 100, DEFAULT_CONFIG.livestock, DEFAULT_CONFIG.nutrients.foodMineralContent, 'x')).toEqual([]);
  });

  it('returns an hour and a vitality per fish handed in, the dead included', () => {
    const state = produce(makeState([makeFish({ id: 'f1' }), makeFish({ id: 'f2', health: 1 })]), (draft) => {
      draft.resources.oxygen = 0;
    });
    const result = processLivestock(state, DEFAULT_CONFIG);

    expect(result.hours.map((hour) => hour.fish.id)).toEqual(['f1', 'f2']);
    expect(result.vitalities).toHaveLength(2);
    expect(result.vitalities[1].newCondition).toBe(0);
    expect(result.state.fish.map((fish) => [fish.id, fish.health])).toEqual([['f1', result.vitalities[0].newCondition]]);
  });

  it("moves each fish's gut, budget and age on", () => {
    const fish = makeFish({ age: 100 });
    const result = processLivestock(makeState([fish]), DEFAULT_CONFIG);

    expect(result.state.fish[0].age).toBe(101);
    expect(result.state.fish[0].gut).toBeGreaterThan(fish.gut);
    expect(result.state.fish[0].deb).not.toEqual(fish.deb);
  });

  it('removes dead fish, logs the death and leaves their remains as waste', () => {
    const state = produce(makeState([makeFish({ health: 1 })]), (draft) => {
      draft.resources.oxygen = 0;
    });
    const result = processLivestock(state, DEFAULT_CONFIG);

    expect(result.state.fish).toHaveLength(0);
    expect(result.state.logs.filter((l) => l.event === 'fish-died')).toHaveLength(1);
    expect(effectOf(result, 'waste', 'fish-death')).toBeGreaterThan(0);
  });
});

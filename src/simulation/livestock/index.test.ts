import { describe, it, expect } from 'vitest';
import { deltaOf } from '../tests/effects.js';
import { burnEffects, processLivestock, tankPaces } from './index.js';
import { createSimulation, type SimulationState } from '../state.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { produce } from 'immer';
import type { Fish } from '../state.js';
import { burn, fishPace } from '../systems/metabolism.js';
import { calculateO2Saturation } from '../systems/gas-exchange.js';
import { getPpm } from '../resources/index.js';
import { fishComposition } from '../systems/fish-body.js';
import { ofFood } from '../tests/organics.js';
import { carrying, fishRecord, saturated } from '../tests/fish.js';
import { waterStressors } from '../systems/fish-health.js';
import { fishHardiness } from './tolerance.js';
import { speciesTau } from './species.js';
import { loadFish, waterToxins } from '../systems/toxicokinetics.js';
import { TOXINS, type Toxin } from '../config/livestock.js';
import type { VitalityResult } from '../systems/vitality.js';

function makeFish(overrides: Partial<Fish> & { size?: number } = {}): Fish {
  return fishRecord({ gut: ofFood(0.001), ...overrides });
}

function makeState(fish: Fish[] = []): SimulationState {
  const state = createSimulation({ tankCapacity: 100 });
  return produce(state, (draft) => {
    draft.fish = fish;
    draft.resources.food = ofFood(5);
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
      state.fish.map((f) => fishPace(f, state.resources, saturation, DEFAULT_CONFIG.livestock))
    );
  });

  it('eats, passes its feces as waste and burns what its budget burned', () => {
    const result = processLivestock(makeState([makeFish({ id: 'a' }), makeFish({ id: 'b', size: 40 })]), DEFAULT_CONFIG);

    expect(effectOf(result, 'food')).toBeLessThan(0);
    expect(result.effects.find((e) => e.resource === 'waste' && e.source === 'fish-metabolism')?.delta).toEqual(result.feces);
    expect(result.feces.grams).toBeGreaterThan(0);
    const { water } = makeState().resources;
    const burnt = burn(result.burned, fishComposition(DEFAULT_CONFIG), DEFAULT_CONFIG.livestock);
    expect(effectOf(result, 'oxygen')).toBeCloseTo(-getPpm(burnt.oxygen, water), 15);
    expect(effectOf(result, 'co2')).toBeCloseTo(getPpm(burnt.co2, water), 15);
    expect(effectOf(result, 'ammonia')).toBeCloseTo(burnt.ammonia, 15);
  });

  it('turns a burn into gill ammonia, minerals, an oxygen draw and CO2, and nothing of nothing', () => {
    const body = fishComposition(DEFAULT_CONFIG);
    const effects = burnEffects(0.01, 100, DEFAULT_CONFIG.livestock, body, 'x');
    expect(effects.map((e) => e.resource)).toEqual(
      expect.arrayContaining(['ammonia', 'kh', 'phosphate', 'potassium', 'iron', 'oxygen', 'co2'])
    );
    expect(burnEffects(0, 100, DEFAULT_CONFIG.livestock, body, 'x')).toEqual([]);
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
    expect(result.state.fish[0].gut.grams).toBeGreaterThan(fish.gut.grams);
    expect(result.state.fish[0].budget).not.toEqual(fish.budget);
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

describe('toxin loads', () => {
  const livestock = DEFAULT_CONFIG.livestock;
  const spiked = (state: SimulationState): SimulationState =>
    produce(state, (draft) => {
      draft.resources.ammonia = 20 * draft.resources.water;
      draft.resources.nitrite = 20 * draft.resources.water;
      draft.resources.nitrate = 2000 * draft.resources.water;
    });
  const charge = (vitality: VitalityResult, toxin: Toxin): number =>
    vitality.breakdown.stressors.find((factor) => factor.key === toxin)!.amount;
  const stepped = (state: SimulationState): Fish[] => {
    const levels = waterToxins(state.resources);
    return state.fish.map((fish) =>
      loadFish(fish, levels, speciesTau(fish.species, state.resources.temperature), livestock.loadRate)
    );
  };

  it('loads every fish on the hour’s water first: its hour, its health and the survivors carry the load', () => {
    const state = spiked(makeState([makeFish({ id: 'a' }), makeFish({ id: 'b', size: 30 })]));
    const loaded = stepped(state);
    const result = processLivestock(state, DEFAULT_CONFIG);

    expect(result.hours.map((hour) => hour.fish.load)).toEqual(loaded.map((fish) => fish.load));
    expect(result.state.fish.map((fish) => fish.load)).toEqual(loaded.map((fish) => fish.load));
    const { resources } = state;
    loaded.forEach((fish, i) => {
      const read = waterStressors(fish.species, fishHardiness(fish), fish.load, resources, resources.water, livestock);
      for (const toxin of TOXINS) {
        expect(charge(result.vitalities[i], toxin)).toBe(read.find((factor) => factor.key === toxin)!.amount);
      }
    });
  });

  it('paces every fish on the load the hour steps it to, so its budget runs on that stress', () => {
    const state = carrying(makeState([makeFish({ id: 'a' }), makeFish({ id: 'b', size: 30 })]), {
      ammonia: 0.5,
      nitrite: 10,
      nitrate: 500,
    });
    const loaded = stepped(state);
    const paces = processLivestock(state, DEFAULT_CONFIG).hours.map((hour) => hour.pace);

    expect(paces).toEqual(tankPaces({ ...state, fish: loaded }, DEFAULT_CONFIG));
    for (const pace of paces) expect(pace.stress.assimilation).toBeLessThan(1);
  });

  it('harms less in the first hour of a spike than the water read straight would', () => {
    const state = spiked(makeState([makeFish()]));
    const fresh = processLivestock(state, DEFAULT_CONFIG).vitalities[0];
    const steeped = processLivestock(saturated(state), DEFAULT_CONFIG).vitalities[0];
    for (const toxin of TOXINS) expect(charge(fresh, toxin)).toBeLessThan(charge(steeped, toxin));
  });

  it('keeps harming once the water clears, less each hour as the load clears', () => {
    const state = carrying(makeState([makeFish()]), { ammonia: 1, nitrite: 20, nitrate: 2000 });
    const first = processLivestock(state, DEFAULT_CONFIG);
    const second = processLivestock(first.state, DEFAULT_CONFIG);
    for (const toxin of TOXINS) {
      expect(charge(first.vitalities[0], toxin)).toBeGreaterThan(0);
      expect(charge(second.vitalities[0], toxin)).toBeLessThan(charge(first.vitalities[0], toxin));
    }
  });
});

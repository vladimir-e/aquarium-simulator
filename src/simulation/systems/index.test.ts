import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { createSimulation, type SimulationState } from '../state.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { applyEffects } from '../core/effects.js';
import { NO_ORGANICS, portion } from '../core/organics.js';
import { sum } from '../core/sum.js';
import { LEAN, ofFood } from '../tests/organics.js';
import { decompositionSystem, poolShares } from './decomposition.js';
import { nitrogenCycleSystem } from './nitrogen-cycle.js';
import { calculateFlowFactor, calculateO2Saturation, gasExchangeSystem } from './gas-exchange.js';
import { coreSystems, tierOxygen } from './index.js';

const config = DEFAULT_CONFIG;
const passive = coreSystems.filter((system) => system.tier === 'passive');

function fouled(food: number, oxygen: number): SimulationState {
  return produce(createSimulation({ tankCapacity: 100, substrate: { type: 'gravel' } }), (draft) => {
    draft.resources.flow = 0;
    draft.resources.aeration = false;
    draft.resources.food = ofFood(food);
    draft.resources.waste = portion(LEAN, food);
    draft.resources.ammonia = 20 * draft.resources.water;
    draft.resources.nitrite = 5 * draft.resources.water;
    draft.resources.aob = 5000;
    draft.resources.nob = 5000;
    draft.resources.oxygen = oxygen;
  });
}

const drawn = (tank: SimulationState, oxygen: number): number =>
  sum(passive.map((system) => system.oxygenDraw?.(tank, oxygen, config) ?? 0));
const consumed = (tank: SimulationState, oxygen: number): number =>
  sum([decompositionSystem, nitrogenCycleSystem].map((system) => system.oxygenDraw(tank, oxygen, config)));
const given = (tank: SimulationState, oxygen: number): number => -gasExchangeSystem.oxygenDraw(tank, oxygen, config);

describe('tierOxygen', () => {
  it('leaves the water where what rot, both guilds and the air draw at that level meets the stock', () => {
    const tank = fouled(5, 4);
    const oxygen = tierOxygen(tank, 'passive', config);
    expect(oxygen).toBeLessThan(tank.resources.oxygen);
    expect(oxygen + drawn(tank, oxygen)).toBeCloseTo(tank.resources.oxygen, 9);
  });

  it('lands the water on the level its systems read, however hard they draw on it', () => {
    for (const food of [1, 20, 500]) {
      for (const start of [0.05, 1, 8]) {
        const tank = fouled(food, start);
        const oxygen = tierOxygen(tank, 'passive', config);
        const after = applyEffects(tank, passive.flatMap((system) => system.update(tank, config, oxygen)));
        expect(after.resources.oxygen).toBeCloseTo(tank.resources.oxygen - drawn(tank, oxygen), 12);
        expect(after.resources.oxygen).toBeGreaterThanOrEqual(oxygen);
        expect(after.resources.oxygen).toBeCloseTo(oxygen, 6);
      }
    }
  });

  it('lands the water on the solve however near the bound it starts, the air’s credit netted against the draws', () => {
    for (const start of [8, 14, 18, 20]) {
      const tank = produce(createSimulation({ tankCapacity: 100 }), (draft) => {
        draft.resources.flow = 1000;
        draft.resources.aeration = true;
        draft.resources.food = ofFood(100);
        draft.resources.oxygen = start;
      });
      const oxygen = tierOxygen(tank, 'passive', config);
      expect(oxygen).toBeGreaterThan(0);
      for (const systems of [passive, [...passive].reverse()]) {
        const after = applyEffects(tank, systems.flatMap((system) => system.update(tank, config, oxygen)));
        expect(after.resources.oxygen).toBeCloseTo(oxygen, 9);
      }
    }
  });

  it('holds a steady tank where it stands: where the air gives what the draws take, they read the level the water holds', () => {
    const tank = fouled(5, 0);
    let low = 0;
    let high = calculateO2Saturation(tank.resources.temperature, config.gasExchange);
    for (let step = 0; step < 100; step++) {
      const mid = (low + high) / 2;
      if (given(tank, mid) > consumed(tank, mid)) low = mid;
      else high = mid;
    }
    const steady = produce(tank, (draft) => void (draft.resources.oxygen = low));
    expect(low).toBeGreaterThan(0);
    expect(tierOxygen(steady, 'passive', config)).toBeCloseTo(low, 9);
  });

  it('relaxes still water toward saturation at the air’s rate where nothing else draws', () => {
    const still = produce(createSimulation({ tankCapacity: 100 }), (draft) => {
      draft.resources.food = NO_ORGANICS;
      draft.resources.waste = NO_ORGANICS;
      draft.resources.aeration = false;
      draft.resources.oxygen = 5;
    });
    const { temperature, flow } = still.resources;
    const rate = config.gasExchange.baseExchangeRate * calculateFlowFactor(flow, still.tank.capacity, config.gasExchange);
    const saturation = calculateO2Saturation(temperature, config.gasExchange);
    expect(tierOxygen(still, 'passive', config)).toBeCloseTo((5 + rate * saturation) / (1 + rate), 9);
  });

  it('rots on what it could not get aerobically at the anaerobic share, more of it the harder the pools press on the oxygen', () => {
    const anaerobicPart = (tank: SimulationState): number => {
      const water = { temperature: tank.resources.temperature, oxygen: tierOxygen(tank, 'passive', config) };
      const shares = poolShares('food', water, tank);
      return shares.anaerobic / (shares.aerobic + shares.anaerobic);
    };
    expect(anaerobicPart(fouled(500, 8))).toBeGreaterThan(anaerobicPart(fouled(20, 8)));
    expect(anaerobicPart(fouled(20, 8))).toBeGreaterThan(anaerobicPart(fouled(1, 8)));
  });
});

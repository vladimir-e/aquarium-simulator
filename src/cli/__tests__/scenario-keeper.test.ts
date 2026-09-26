import { describe, it, expect } from 'vitest';
import { createSimulation, type SimulationState } from '../../simulation/state.js';
import {
  KEEPER_HOUR,
  dueActions,
  isKeeperHourOf,
  rescapeTank,
  thinToFloor,
  type Schedule,
} from '../scenarios/keeper.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { floorCover, isOvergrown, resetHardscape } from '../../simulation/index.js';
import { findSetup, toConfig, toSeed } from '../scenarios/setups.js';

const stocked = createSimulation(toConfig(findSetup('nano')), toSeed(findSetup('nano')), 1);
const empty: SimulationState = { ...stocked, fish: [] };
const at = (state: SimulationState, day: number, hour = KEEPER_HOUR): SimulationState => ({
  ...state,
  tick: (day - 1) * 24 + hour,
});

describe('dueActions', () => {
  const daily: Schedule = [{ every: 1, action: { type: 'topOff' } }];

  it('fires nothing outside the keeper hour', () => {
    for (let hour = 0; hour < 24; hour++) {
      expect(dueActions(daily, at(stocked, 3, hour))).toHaveLength(hour === KEEPER_HOUR ? 1 : 0);
    }
  });

  it('fires an every-7 chore on day 7, not on day 1 or 6', () => {
    const weekly: Schedule = [{ every: 7, action: { type: 'scrubAlgae' } }];
    expect(dueActions(weekly, at(stocked, 1))).toEqual([]);
    expect(dueActions(weekly, at(stocked, 6))).toEqual([]);
    expect(dueActions(weekly, at(stocked, 7))).toEqual([{ type: 'scrubAlgae' }]);
  });

  it('turns a share-of-stock feed into grams of the fish mass', () => {
    const mass = stocked.fish.reduce((sum, fish) => sum + fish.mass, 0);
    const [feed] = dueActions([{ every: 1, action: { type: 'feed', shareOfStock: 0.5 } }], at(stocked, 1));
    expect(feed).toEqual({ type: 'feed', amount: mass * 0.5 });
  });

  it('drops a share-of-stock feed when there are no fish', () => {
    expect(dueActions([{ every: 1, action: { type: 'feed', shareOfStock: 0.5 } }], at(empty, 1))).toEqual([]);
  });
});

describe('isKeeperHourOf', () => {
  it('holds at the keeper hour of that day and no other tick', () => {
    const ticks = Array.from({ length: 5 * 24 }, (_, tick) => tick).filter((tick) => isKeeperHourOf(3, tick));
    expect(ticks).toEqual([2 * 24 + KEEPER_HOUR]);
  });
});

describe('rescapeTank', () => {
  const scaped = createSimulation(
    toConfig({ ...findSetup('low-tech'), hardscape: ['neutral_rock', 'driftwood'] }),
    toSeed(findSetup('low-tech')),
    1
  );

  it('sets every piece back fresh and uproots every other plant', () => {
    const after = rescapeTank(scaped, DEFAULT_CONFIG);

    expect(after.equipment.hardscape.items.map((i) => i.type)).toEqual(['neutral_rock', 'driftwood']);
    expect(after.equipment.hardscape.items).toEqual(resetHardscape(scaped).equipment.hardscape.items);
    expect(after.plants).toHaveLength(Math.floor(scaped.plants.length / 2));
    expect(after.resources.aob).toBeLessThan(scaped.resources.aob);
  });
});

describe('thinToFloor', () => {
  const ESTABLISHED = 2000;
  const overgrown = (extra: number): SimulationState => {
    const seed = toSeed(findSetup('low-tech'));
    const established = seed.plants!.map((group) => ({ ...group, age: ESTABLISHED }));
    return createSimulation(
      toConfig(findSetup('low-tech')),
      { ...seed, plants: [{ species: 'anubias', count: extra, size: 50 }, ...established] },
      1
    );
  };

  it('pulls the youngest plants, wherever they stand in the list, until the planting fits its floor', () => {
    const state = overgrown(4);
    expect(isOvergrown(state)).toBe(true);

    const after = thinToFloor(state, DEFAULT_CONFIG);
    const kept = new Set(after.plants.map((p) => p.id));
    const pulled = state.plants.filter((p) => !kept.has(p.id));
    expect(floorCover(after.plants, after.tank.capacity)).toBeLessThanOrEqual(1);
    expect(pulled.length).toBeGreaterThan(0);
    expect(pulled.every((p) => p.age === 0)).toBe(true);
    expect(isOvergrown({ ...after, plants: [...after.plants, pulled[0]!] })).toBe(true);
  });

  it('leaves a planting that fits alone', () => {
    const state = overgrown(0);
    expect(thinToFloor(state, DEFAULT_CONFIG)).toBe(state);
  });
});

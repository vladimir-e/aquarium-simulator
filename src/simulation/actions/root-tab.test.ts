import { describe, it, expect } from 'vitest';
import { canRootTab, MAX_ROOT_TABS, rootTab } from './root-tab.js';
import { applyAction } from './index.js';
import { createSimulation, type SimulationState } from '../state.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { NUTRIENTS, type NutrientVector } from '../config/nutrients.js';
import type { SubstrateType } from '../equipment/substrate.js';

const TAB: NutrientVector = { nitrate: 300, phosphate: 40, potassium: 200, iron: 10 };

const tank = (type: SubstrateType): SimulationState =>
  createSimulation({ tankCapacity: 40, substrate: { type } });

describe('canRootTab', () => {
  it('needs a bed to push the tab into', () => {
    expect(canRootTab(tank('none'))).toBe(false);
    for (const type of ['sand', 'gravel', 'aqua_soil'] as const) expect(canRootTab(tank(type))).toBe(true);
  });
});

describe('rootTab', () => {
  it('adds count × tab to what the bed holds, and leaves the water alone', () => {
    const state = tank('aqua_soil');
    const result = rootTab(state, { type: 'rootTab', count: 3 }, TAB);

    for (const n of NUTRIENTS) {
      expect(result.state.equipment.substrate.nutrients[n]).toBeCloseTo(
        state.equipment.substrate.nutrients[n] + 3 * TAB[n],
        10
      );
    }
    expect(result.state.resources).toEqual(state.resources);
    expect(result.message).toBe('Pushed 3 root tabs');
    expect(result.state.logs.at(-1)).toMatchObject({ source: 'user', severity: 'info' });
  });

  it('pushes the configured tab through applyAction', () => {
    const state = tank('gravel');
    const result = applyAction(state, { type: 'rootTab', count: 1 }, DEFAULT_CONFIG);
    expect(result.state.equipment.substrate.nutrients).toEqual(DEFAULT_CONFIG.nutrients.rootTab);
  });

  it.each<[number, string]>([
    [0, 'whole'],
    [-1, 'whole'],
    [1.5, 'whole'],
    [NaN, 'whole'],
    [MAX_ROOT_TABS + 1, 'Maximum'],
  ])('refuses %d tabs', (count, message) => {
    const state = tank('gravel');
    const result = rootTab(state, { type: 'rootTab', count }, TAB);
    expect(result.state).toBe(state);
    expect(result.message).toContain(message);
  });

  it('refuses a tank with no bed', () => {
    const state = tank('none');
    const result = rootTab(state, { type: 'rootTab', count: 1 }, TAB);
    expect(result.state).toBe(state);
    expect(result.message).toBe('No bed to push a root tab into');
  });
});

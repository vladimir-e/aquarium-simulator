import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { waterChange, WATER_CHANGE_AMOUNTS } from './water-change.js';
import { createSimulation } from '../state.js';
import type { WaterChangeAction } from './types.js';

describe('waterChange action', () => {
  describe('nitrogen compound removal', () => {
    it('removes proportional ammonia mass with 25% water change', () => {
      let state = createSimulation({ tankCapacity: 100 });
      state = produce(state, (draft) => {
        draft.resources.ammonia = 10; // 10mg
      });

      const action: WaterChangeAction = { type: 'waterChange', amount: 0.25 };
      const result = waterChange(state, action);

      expect(result.state.resources.ammonia).toBe(7.5); // 75% remains
    });

    it('removes proportional nitrite mass with 50% water change', () => {
      let state = createSimulation({ tankCapacity: 100 });
      state = produce(state, (draft) => {
        draft.resources.nitrite = 20; // 20mg
      });

      const action: WaterChangeAction = { type: 'waterChange', amount: 0.5 };
      const result = waterChange(state, action);

      expect(result.state.resources.nitrite).toBe(10); // 50% remains
    });

    it('removes proportional nitrate mass with 90% water change', () => {
      let state = createSimulation({ tankCapacity: 100 });
      state = produce(state, (draft) => {
        draft.resources.nitrate = 100; // 100mg
      });

      const action: WaterChangeAction = { type: 'waterChange', amount: 0.9 };
      const result = waterChange(state, action);

      expect(result.state.resources.nitrate).toBeCloseTo(10, 10); // 10% remains
    });

    it('removes all nitrogen compounds proportionally', () => {
      let state = createSimulation({ tankCapacity: 100 });
      state = produce(state, (draft) => {
        draft.resources.ammonia = 10;
        draft.resources.nitrite = 20;
        draft.resources.nitrate = 100;
      });

      const action: WaterChangeAction = { type: 'waterChange', amount: 0.25 };
      const result = waterChange(state, action);

      expect(result.state.resources.ammonia).toBe(7.5);
      expect(result.state.resources.nitrite).toBe(15);
      expect(result.state.resources.nitrate).toBe(75);
    });
  });

  describe('temperature blending', () => {
    it('blends temperature correctly with 50% water change', () => {
      // 50% water change with 20°C tap into 26°C tank → 23°C result
      const state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 26,
        tapWaterTemperature: 20,
      });

      const action: WaterChangeAction = { type: 'waterChange', amount: 0.5 };
      const result = waterChange(state, action);

      expect(result.state.resources.temperature).toBe(23);
    });

    it('blends temperature correctly with 25% water change', () => {
      // 25% water change with 20°C tap into 28°C tank
      // newTemp = (28 * 75 + 20 * 25) / 100 = (2100 + 500) / 100 = 26
      const state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 28,
        tapWaterTemperature: 20,
      });

      const action: WaterChangeAction = { type: 'waterChange', amount: 0.25 };
      const result = waterChange(state, action);

      expect(result.state.resources.temperature).toBe(26);
    });

    it('blends temperature correctly with 10% water change', () => {
      // 10% water change with 20°C tap into 25°C tank
      // newTemp = (25 * 90 + 20 * 10) / 100 = (2250 + 200) / 100 = 24.5
      const state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 25,
        tapWaterTemperature: 20,
      });

      const action: WaterChangeAction = { type: 'waterChange', amount: 0.1 };
      const result = waterChange(state, action);

      expect(result.state.resources.temperature).toBe(24.5);
    });

    it('uses tank environment tap water temperature', () => {
      const state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 25,
        tapWaterTemperature: 15, // Custom tap water temp
      });

      const action: WaterChangeAction = { type: 'waterChange', amount: 0.5 };
      const result = waterChange(state, action);

      // (25 * 50 + 15 * 50) / 100 = 20
      expect(result.state.resources.temperature).toBe(20);
    });
  });

  describe('water volume', () => {
    it('maintains same water volume after water change', () => {
      const state = createSimulation({ tankCapacity: 100 });

      const action: WaterChangeAction = { type: 'waterChange', amount: 0.5 };
      const result = waterChange(state, action);

      expect(result.state.resources.water).toBe(100);
    });

    it('works with partially filled tank', () => {
      let state = createSimulation({ tankCapacity: 100 });
      state = produce(state, (draft) => {
        draft.resources.water = 80;
        draft.resources.ammonia = 10;
      });

      const action: WaterChangeAction = { type: 'waterChange', amount: 0.25 };
      const result = waterChange(state, action);

      // Water volume unchanged
      expect(result.state.resources.water).toBe(80);
      // Ammonia reduced by 25%
      expect(result.state.resources.ammonia).toBe(7.5);
    });
  });

  describe('edge cases', () => {
    it('returns unchanged state for empty tank', () => {
      let state = createSimulation({ tankCapacity: 100 });
      state = produce(state, (draft) => {
        draft.resources.water = 0;
      });

      const action: WaterChangeAction = { type: 'waterChange', amount: 0.25 };
      const result = waterChange(state, action);

      expect(result.message).toBe('No water to change');
      expect(result.state).toBe(state);
    });

    it('rejects invalid amount (0)', () => {
      const state = createSimulation({ tankCapacity: 100 });

      const action = { type: 'waterChange', amount: 0 } as WaterChangeAction;
      const result = waterChange(state, action);

      expect(result.message).toBe('Invalid water change amount');
    });

    it('rejects negative amount', () => {
      const state = createSimulation({ tankCapacity: 100 });

      const action = { type: 'waterChange', amount: -0.5 } as WaterChangeAction;
      const result = waterChange(state, action);

      expect(result.message).toBe('Invalid water change amount');
    });

    it('rejects amount > 1', () => {
      const state = createSimulation({ tankCapacity: 100 });

      const action = { type: 'waterChange', amount: 1.5 } as WaterChangeAction;
      const result = waterChange(state, action);

      expect(result.message).toBe('Invalid water change amount');
    });
  });

  describe('logging', () => {
    it('logs water change action', () => {
      const state = createSimulation({ tankCapacity: 100 });

      const action: WaterChangeAction = { type: 'waterChange', amount: 0.25 };
      const result = waterChange(state, action);

      const log = result.state.logs.find(
        (l) => l.source === 'user' && l.message.includes('Water change')
      );
      expect(log).toBeDefined();
      expect(log!.message).toContain('25%');
      expect(log!.message).toContain('25.0L');
    });

    it('returns success message with percentage and volume', () => {
      const state = createSimulation({ tankCapacity: 100 });

      const action: WaterChangeAction = { type: 'waterChange', amount: 0.5 };
      const result = waterChange(state, action);

      expect(result.message).toContain('50%');
      expect(result.message).toContain('50.0L');
    });
  });

  describe('WATER_CHANGE_AMOUNTS', () => {
    it('exports correct amount options', () => {
      expect(WATER_CHANGE_AMOUNTS).toEqual([0.1, 0.25, 0.5, 0.9]);
    });
  });
});

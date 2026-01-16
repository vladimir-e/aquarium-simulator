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
    it('restores water to 100% capacity after water change', () => {
      const state = createSimulation({ tankCapacity: 100 });

      const action: WaterChangeAction = { type: 'waterChange', amount: 0.5 };
      const result = waterChange(state, action);

      expect(result.state.resources.water).toBe(100);
    });

    it('fills partially filled tank to 100% after water change', () => {
      // Tank at 80L, 25% WC removes 20L (leaving 60L), then fills to 100L
      let state = createSimulation({ tankCapacity: 100 });
      state = produce(state, (draft) => {
        draft.resources.water = 80;
        draft.resources.ammonia = 10;
      });

      const action: WaterChangeAction = { type: 'waterChange', amount: 0.25 };
      const result = waterChange(state, action);

      // Water restored to 100%
      expect(result.state.resources.water).toBe(100);
      // Ammonia reduced by 25% (based on removal, not final volume)
      expect(result.state.resources.ammonia).toBe(7.5);
    });

    it('handles tank at 90% with 25% water change', () => {
      // Tank at 90L, 25% WC removes 22.5L (leaving 67.5L), then fills to 100L (adds 32.5L)
      let state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 26,
        tapWaterTemperature: 20,
      });
      state = produce(state, (draft) => {
        draft.resources.water = 90;
        draft.resources.nitrate = 90; // 90mg = 1ppm
      });

      const action: WaterChangeAction = { type: 'waterChange', amount: 0.25 };
      const result = waterChange(state, action);

      // Water restored to 100%
      expect(result.state.resources.water).toBe(100);
      // Nitrate reduced by 25%: 90 * 0.75 = 67.5mg
      expect(result.state.resources.nitrate).toBe(67.5);
      // Temperature: 67.5L at 26°C + 32.5L at 20°C = (1755 + 650) / 100 = 24.05°C
      expect(result.state.resources.temperature).toBe(24.05);
    });

    it('acts as top-off when tank very low', () => {
      // Tank at 20L, 25% WC removes 5L (leaving 15L), then fills to 100L (adds 85L)
      let state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 28,
        tapWaterTemperature: 20,
      });
      state = produce(state, (draft) => {
        draft.resources.water = 20;
      });

      const action: WaterChangeAction = { type: 'waterChange', amount: 0.25 };
      const result = waterChange(state, action);

      // Water restored to 100%
      expect(result.state.resources.water).toBe(100);
      // Temperature: 15L at 28°C + 85L at 20°C = (420 + 1700) / 100 = 21.2°C
      expect(result.state.resources.temperature).toBe(21.2);
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
    it('logs water change action with removed and added volumes', () => {
      const state = createSimulation({ tankCapacity: 100 });

      const action: WaterChangeAction = { type: 'waterChange', amount: 0.25 };
      const result = waterChange(state, action);

      const log = result.state.logs.find(
        (l) => l.source === 'user' && l.message.includes('Water change')
      );
      expect(log).toBeDefined();
      expect(log!.message).toContain('25%');
      expect(log!.message).toContain('removed 25.0L');
      expect(log!.message).toContain('added 25.0L');
    });

    it('logs different removed/added volumes for partial tank', () => {
      let state = createSimulation({ tankCapacity: 100 });
      state = produce(state, (draft) => {
        draft.resources.water = 90;
      });

      const action: WaterChangeAction = { type: 'waterChange', amount: 0.25 };
      const result = waterChange(state, action);

      const log = result.state.logs.find(
        (l) => l.source === 'user' && l.message.includes('Water change')
      );
      expect(log).toBeDefined();
      expect(log!.message).toContain('removed 22.5L');
      expect(log!.message).toContain('added 32.5L');
    });

    it('returns success message with percentage and volumes', () => {
      const state = createSimulation({ tankCapacity: 100 });

      const action: WaterChangeAction = { type: 'waterChange', amount: 0.5 };
      const result = waterChange(state, action);

      expect(result.message).toContain('50%');
      expect(result.message).toContain('removed 50.0L');
      expect(result.message).toContain('added 50.0L');
    });
  });

  describe('WATER_CHANGE_AMOUNTS', () => {
    it('exports correct amount options', () => {
      expect(WATER_CHANGE_AMOUNTS).toEqual([0.1, 0.25, 0.5, 0.9]);
    });
  });
});

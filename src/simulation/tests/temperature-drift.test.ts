import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { createSimulation } from '../state.js';
import { tick } from '../tick.js';
import { applyAction } from '../actions/index.js';

describe('Temperature drift integration', () => {
  describe('cooling toward room temperature', () => {
    it('tank cools toward room temperature when heater is disabled', () => {
      let state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 28,
        roomTemperature: 22,
        heater: { enabled: false },
      });

      const initialTemp = state.resources.temperature;

      // Run several ticks
      for (let i = 0; i < 10; i++) {
        state = tick(state);
      }

      // Temperature should have decreased toward room temp
      expect(state.resources.temperature).toBeLessThan(initialTemp);
      expect(state.resources.temperature).toBeGreaterThan(22);
    });

    it('tank warms toward room temperature when below it (heater disabled)', () => {
      let state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 18,
        roomTemperature: 22,
        heater: { enabled: false },
      });

      const initialTemp = state.resources.temperature;

      for (let i = 0; i < 10; i++) {
        state = tick(state);
      }

      // Temperature should rise toward room temp
      expect(state.resources.temperature).toBeGreaterThan(initialTemp);
      expect(state.resources.temperature).toBeLessThan(22);
    });

    it('temperature stabilizes at room temperature over many ticks', () => {
      let state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 30,
        roomTemperature: 22,
        heater: { enabled: false },
      });

      // Run many ticks to approach equilibrium
      for (let i = 0; i < 200; i++) {
        state = tick(state);
      }

      // Should be very close to room temperature
      expect(state.resources.temperature).toBeCloseTo(22, 0);
    });
  });

  describe('thermal mass — larger tanks cool slower', () => {
    it('small tank cools faster than large tank', () => {
      let smallTank = createSimulation({
        tankCapacity: 20,
        initialTemperature: 28,
        roomTemperature: 22,
        heater: { enabled: false },
      });
      let largeTank = createSimulation({
        tankCapacity: 200,
        initialTemperature: 28,
        roomTemperature: 22,
        heater: { enabled: false },
      });

      // Run a few ticks
      for (let i = 0; i < 5; i++) {
        smallTank = tick(smallTank);
        largeTank = tick(largeTank);
      }

      // Both should cool, but the small tank should have cooled more
      expect(smallTank.resources.temperature).toBeLessThan(28);
      expect(largeTank.resources.temperature).toBeLessThan(28);
      expect(smallTank.resources.temperature).toBeLessThan(
        largeTank.resources.temperature
      );
    });

    it('thermal mass difference is consistent across multiple ticks', () => {
      const volumes = [20, 50, 100, 200];
      const states = volumes.map((v) =>
        createSimulation({
          tankCapacity: v,
          initialTemperature: 30,
          roomTemperature: 22,
          heater: { enabled: false },
        })
      );

      // Run 10 ticks for each
      const finalTemps = states.map((s) => {
        let state = s;
        for (let i = 0; i < 10; i++) {
          state = tick(state);
        }
        return state.resources.temperature;
      });

      // Each larger tank should retain more heat (higher temperature)
      for (let i = 0; i < finalTemps.length - 1; i++) {
        expect(finalTemps[i]).toBeLessThan(finalTemps[i + 1]);
      }
    });
  });

  describe('heater counteracts cooling', () => {
    it('heater maintains target temperature against cooling', () => {
      let state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 25,
        roomTemperature: 22,
        heater: { enabled: true, targetTemperature: 25, wattage: 100 },
      });

      // Run many ticks — temperature should stay near target
      for (let i = 0; i < 50; i++) {
        state = tick(state);
      }

      // Should remain close to target despite room being cooler
      expect(state.resources.temperature).toBeCloseTo(25, 0);
    });

    it('heater warms tank from below target', () => {
      let state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 20,
        roomTemperature: 22,
        heater: { enabled: true, targetTemperature: 26, wattage: 100 },
      });

      const initialTemp = state.resources.temperature;

      // Run several ticks
      for (let i = 0; i < 20; i++) {
        state = tick(state);
      }

      // Temperature should have increased significantly toward target
      expect(state.resources.temperature).toBeGreaterThan(initialTemp);
      expect(state.resources.temperature).toBeGreaterThan(22); // Past room temp
    });

    it('disabled heater allows unchecked cooling', () => {
      let heaterOn = createSimulation({
        tankCapacity: 100,
        initialTemperature: 28,
        roomTemperature: 22,
        heater: { enabled: true, targetTemperature: 28, wattage: 100 },
      });
      let heaterOff = createSimulation({
        tankCapacity: 100,
        initialTemperature: 28,
        roomTemperature: 22,
        heater: { enabled: false },
      });

      for (let i = 0; i < 20; i++) {
        heaterOn = tick(heaterOn);
        heaterOff = tick(heaterOff);
      }

      // Heater-on tank should be warmer
      expect(heaterOn.resources.temperature).toBeGreaterThan(
        heaterOff.resources.temperature
      );
      // Heater-off tank should have drifted noticeably toward room
      expect(heaterOff.resources.temperature).toBeLessThan(26);
    });
  });

  describe('thermostat behavior through ticks', () => {
    it('heater turns on when below target and off when above target', () => {
      // Start above target — heater should remain off
      let state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 28,
        roomTemperature: 28,
        heater: { enabled: true, targetTemperature: 26, wattage: 100 },
      });

      state = tick(state);
      // Above target — heater should be off
      expect(state.resources.temperature).toBeGreaterThanOrEqual(26);
      expect(state.equipment.heater.isOn).toBe(false);

      // Now start below target — heater should turn on
      let coldState = createSimulation({
        tankCapacity: 100,
        initialTemperature: 22,
        roomTemperature: 22,
        heater: { enabled: true, targetTemperature: 26, wattage: 100 },
      });

      coldState = tick(coldState);
      expect(coldState.equipment.heater.isOn).toBe(true);
      expect(coldState.resources.temperature).toBeGreaterThan(22);
    });

    it('heater cycles on and off to maintain temperature', () => {
      let state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 25,
        roomTemperature: 20,
        heater: { enabled: true, targetTemperature: 25, wattage: 100 },
      });

      // Track heater on/off transitions over many ticks
      const heaterStates: boolean[] = [];

      for (let i = 0; i < 50; i++) {
        state = tick(state);
        heaterStates.push(state.equipment.heater.isOn);
      }

      // Temperature should remain near target
      expect(state.resources.temperature).toBeCloseTo(25, 0);

      // Heater should have been on at least once (fighting cooling)
      expect(heaterStates.some((on) => on)).toBe(true);
    });
  });

  describe('temperature affects decay rate (cross-system)', () => {
    it('warmer tank decays food faster than cooler tank', () => {
      let warmState = createSimulation({
        tankCapacity: 100,
        initialTemperature: 30,
        roomTemperature: 30, // Keep stable
        heater: { enabled: false },
      });
      let coolState = createSimulation({
        tankCapacity: 100,
        initialTemperature: 20,
        roomTemperature: 20, // Keep stable
        heater: { enabled: false },
      });

      // Feed both tanks equally
      warmState = applyAction(warmState, { type: 'feed', amount: 2.0 }).state;
      coolState = applyAction(coolState, { type: 'feed', amount: 2.0 }).state;

      // Run ticks so decay processes food at different rates
      for (let i = 0; i < 5; i++) {
        warmState = tick(warmState);
        coolState = tick(coolState);
      }

      // Warm tank should have less food remaining (faster decay)
      expect(warmState.resources.food).toBeLessThan(coolState.resources.food);
      // Warm tank should have more waste produced
      expect(warmState.resources.waste).toBeGreaterThan(coolState.resources.waste);
    });

    it('heater-driven temperature increase accelerates decay over time', () => {
      // Start cold, heater warms the tank — decay should accelerate
      let heatedState = createSimulation({
        tankCapacity: 100,
        initialTemperature: 20,
        roomTemperature: 20,
        heater: { enabled: true, targetTemperature: 30, wattage: 200 },
      });
      let unheatedState = createSimulation({
        tankCapacity: 100,
        initialTemperature: 20,
        roomTemperature: 20,
        heater: { enabled: false },
      });

      // Feed both
      heatedState = applyAction(heatedState, { type: 'feed', amount: 2.0 }).state;
      unheatedState = applyAction(unheatedState, { type: 'feed', amount: 2.0 }).state;

      // Run enough ticks for the heater to warm the water
      for (let i = 0; i < 20; i++) {
        heatedState = tick(heatedState);
        unheatedState = tick(unheatedState);
      }

      // The heated tank should be warmer
      expect(heatedState.resources.temperature).toBeGreaterThan(
        unheatedState.resources.temperature
      );
      // Heated tank should have less food remaining due to faster decay
      expect(heatedState.resources.food).toBeLessThan(unheatedState.resources.food);
    });
  });

  describe('temperature affects O2 saturation (cross-system)', () => {
    it('colder water reaches higher O2 saturation than warmer water', () => {
      let coldTank = createSimulation({
        tankCapacity: 100,
        initialTemperature: 18,
        roomTemperature: 18,
        heater: { enabled: false },
      });
      let warmTank = createSimulation({
        tankCapacity: 100,
        initialTemperature: 30,
        roomTemperature: 30,
        heater: { enabled: false },
      });

      // Start both with same O2 level
      coldTank = produce(coldTank, (draft) => {
        draft.resources.oxygen = 6.0;
      });
      warmTank = produce(warmTank, (draft) => {
        draft.resources.oxygen = 6.0;
      });

      // Run many ticks to let gas exchange equilibrate
      for (let i = 0; i < 100; i++) {
        coldTank = tick(coldTank);
        warmTank = tick(warmTank);
      }

      // Cold water should hold more dissolved O2 (Henry's Law)
      expect(coldTank.resources.oxygen).toBeGreaterThan(
        warmTank.resources.oxygen
      );
    });

    it('warming the tank via heater reduces O2 saturation target', () => {
      // Start cold, let O2 equilibrate, then warm via heater
      let state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 18,
        roomTemperature: 18,
        heater: { enabled: false },
      });

      // Equilibrate O2 at cold temperature
      for (let i = 0; i < 50; i++) {
        state = tick(state);
      }

      const coldO2 = state.resources.oxygen;

      // Enable heater to warm the tank
      state = produce(state, (draft) => {
        draft.equipment.heater.enabled = true;
        draft.equipment.heater.targetTemperature = 28;
        draft.equipment.heater.wattage = 200;
        draft.environment.roomTemperature = 28; // Support warming
      });

      // Run ticks to warm up and let O2 adjust
      for (let i = 0; i < 100; i++) {
        state = tick(state);
      }

      // Tank should be warmer
      expect(state.resources.temperature).toBeGreaterThan(24);
      // O2 should be lower due to reduced saturation at higher temperature
      expect(state.resources.oxygen).toBeLessThan(coldO2);
    });
  });

  describe('water change blends temperatures', () => {
    it('water change brings temperature toward tap water temperature', () => {
      let state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 28,
        roomTemperature: 28,
        tapWaterTemperature: 18,
        heater: { enabled: false },
      });

      const tempBefore = state.resources.temperature;

      // Perform a 50% water change
      state = applyAction(state, { type: 'waterChange', amount: 0.5 }).state;

      // Temperature should drop toward tap water temperature
      expect(state.resources.temperature).toBeLessThan(tempBefore);
      // Blended: (28 * 50 + 18 * 50) / 100 = 23
      expect(state.resources.temperature).toBeCloseTo(23, 0);
    });

    it('larger water changes cause bigger temperature shifts', () => {
      const makeState = () =>
        createSimulation({
          tankCapacity: 100,
          initialTemperature: 28,
          roomTemperature: 28,
          tapWaterTemperature: 18,
          heater: { enabled: false },
        });

      let smallChange = applyAction(makeState(), {
        type: 'waterChange',
        amount: 0.1,
      }).state;
      let largeChange = applyAction(makeState(), {
        type: 'waterChange',
        amount: 0.5,
      }).state;

      // Larger change should cause bigger temperature drop
      expect(largeChange.resources.temperature).toBeLessThan(
        smallChange.resources.temperature
      );
    });

    it('water change temperature drop is recovered by heater over time', () => {
      let state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 26,
        roomTemperature: 22,
        tapWaterTemperature: 18,
        heater: { enabled: true, targetTemperature: 26, wattage: 100 },
      });

      // Perform a 50% water change — drops temperature significantly
      state = applyAction(state, { type: 'waterChange', amount: 0.5 }).state;
      const tempAfterChange = state.resources.temperature;
      expect(tempAfterChange).toBeLessThan(26);

      // Run ticks — heater should recover toward target
      for (let i = 0; i < 100; i++) {
        state = tick(state);
      }

      // Temperature should have recovered significantly toward target
      expect(state.resources.temperature).toBeGreaterThan(tempAfterChange);
      expect(state.resources.temperature).toBeCloseTo(26, 0);
    });

    it('water change followed by ticks shows drift and heater interaction', () => {
      let state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 26,
        roomTemperature: 22,
        tapWaterTemperature: 15,
        heater: { enabled: true, targetTemperature: 26, wattage: 100 },
      });

      // Large water change with cold tap water
      state = applyAction(state, { type: 'waterChange', amount: 0.5 }).state;
      const postChangeTemp = state.resources.temperature;

      // Track temperature recovery
      const temps: number[] = [postChangeTemp];
      for (let i = 0; i < 30; i++) {
        state = tick(state);
        temps.push(state.resources.temperature);
      }

      // Temperature should generally increase toward target
      // (heater fights both the drop from water change and drift toward room temp)
      expect(temps[temps.length - 1]).toBeGreaterThan(temps[0]);
    });
  });
});

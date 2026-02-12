import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { createSimulation } from '../state.js';
import { tick } from '../tick.js';
import { applyAction } from '../actions/index.js';
import { calculateO2Saturation } from '../systems/gas-exchange.js';
import { gasExchangeDefaults } from '../config/gas-exchange.js';

/**
 * Helper: run N ticks on state.
 */
function runTicks(state: ReturnType<typeof createSimulation>, n: number): ReturnType<typeof createSimulation> {
  let s = state;
  for (let i = 0; i < n; i++) {
    s = tick(s);
  }
  return s;
}

describe('Gas Exchange integration', () => {
  // -----------------------------------------------------------------------
  // O2 reaches equilibrium in an empty tank with filter running
  // -----------------------------------------------------------------------
  describe('O2 equilibrium in empty tank with filter', () => {
    it('O2 converges toward saturation over many ticks', () => {
      // Start with O2 below saturation (6.0 mg/L) in a 100L tank at 25C.
      // Default filter is sponge (enabled), which provides flow and aeration.
      let state = createSimulation({ tankCapacity: 100, initialTemperature: 25 });
      state = produce(state, (draft) => {
        draft.resources.oxygen = 6.0;
      });

      const saturation = calculateO2Saturation(25);

      // Run 48 ticks (2 days)
      state = runTicks(state, 48);

      // O2 should have moved substantially toward saturation
      expect(state.resources.oxygen).toBeGreaterThan(6.0);
      // Should be within 10% of saturation after 48 hours of gas exchange
      expect(state.resources.oxygen).toBeCloseTo(saturation, 0);
    });

    it('O2 decreases toward saturation when supersaturated', () => {
      // Start with O2 above saturation
      let state = createSimulation({ tankCapacity: 100, initialTemperature: 25 });
      const saturation = calculateO2Saturation(25);
      state = produce(state, (draft) => {
        draft.resources.oxygen = saturation + 3.0;
      });

      state = runTicks(state, 48);

      // O2 should have dropped toward saturation
      expect(state.resources.oxygen).toBeLessThan(saturation + 3.0);
      expect(state.resources.oxygen).toBeCloseTo(saturation, 0);
    });
  });

  // -----------------------------------------------------------------------
  // O2 equilibrium varies with temperature (colder water holds more O2)
  // -----------------------------------------------------------------------
  describe('O2 saturation varies with temperature', () => {
    it('colder water reaches higher O2 equilibrium than warmer water', () => {
      // Two tanks: one cold (18C), one warm (30C), both starting at same O2.
      // Pin room temperature to match initial so temperature drift does not interfere.
      let coldState = createSimulation({
        tankCapacity: 100,
        initialTemperature: 18,
        roomTemperature: 18,
        heater: { enabled: false },
      });
      let warmState = createSimulation({
        tankCapacity: 100,
        initialTemperature: 30,
        roomTemperature: 30,
        heater: { enabled: false },
      });

      // Set both to the same starting O2 well below both saturations
      coldState = produce(coldState, (draft) => {
        draft.resources.oxygen = 5.0;
      });
      warmState = produce(warmState, (draft) => {
        draft.resources.oxygen = 5.0;
      });

      // Run enough ticks to approach equilibrium
      coldState = runTicks(coldState, 72);
      warmState = runTicks(warmState, 72);

      // Cold water should hold more O2 than warm water
      expect(coldState.resources.oxygen).toBeGreaterThan(warmState.resources.oxygen);

      // Verify against the saturation model
      const coldSat = calculateO2Saturation(18);
      const warmSat = calculateO2Saturation(30);
      expect(coldSat).toBeGreaterThan(warmSat);

      // Each should be close to its respective saturation
      expect(coldState.resources.oxygen).toBeCloseTo(coldSat, 0);
      expect(warmState.resources.oxygen).toBeCloseTo(warmSat, 0);
    });
  });

  // -----------------------------------------------------------------------
  // CO2 off-gasses toward atmospheric level over ticks
  // -----------------------------------------------------------------------
  describe('CO2 off-gassing', () => {
    it('excess CO2 decreases toward atmospheric equilibrium', () => {
      // Start with elevated CO2 (e.g. 15 mg/L, atmospheric is ~4 mg/L)
      let state = createSimulation({ tankCapacity: 100, initialTemperature: 25 });
      state = produce(state, (draft) => {
        draft.resources.co2 = 15.0;
      });

      const initialCo2 = state.resources.co2;
      state = runTicks(state, 24);

      // CO2 should have decreased significantly
      expect(state.resources.co2).toBeLessThan(initialCo2);
      // Should be moving toward atmospheric ~4 mg/L
      expect(state.resources.co2).toBeLessThan(10.0);
    });

    it('CO2 converges to atmospheric equilibrium over many ticks', () => {
      let state = createSimulation({ tankCapacity: 100, initialTemperature: 25 });
      state = produce(state, (draft) => {
        draft.resources.co2 = 20.0;
      });

      state = runTicks(state, 96);

      // After 4 days should be very close to atmospheric CO2
      expect(state.resources.co2).toBeCloseTo(gasExchangeDefaults.atmosphericCo2, 0);
    });

    it('low CO2 rises toward atmospheric equilibrium', () => {
      let state = createSimulation({ tankCapacity: 100, initialTemperature: 25 });
      state = produce(state, (draft) => {
        draft.resources.co2 = 1.0;
      });

      state = runTicks(state, 48);

      // CO2 should increase toward atmospheric level
      expect(state.resources.co2).toBeGreaterThan(1.0);
      expect(state.resources.co2).toBeCloseTo(gasExchangeDefaults.atmosphericCo2, 0);
    });
  });

  // -----------------------------------------------------------------------
  // Aeration (air pump) speeds up O2 recovery when below saturation
  // -----------------------------------------------------------------------
  describe('aeration speeds up O2 recovery', () => {
    it('air pump tank recovers O2 faster than non-aerated tank', () => {
      // Tank with air pump (and HOB filter so sponge aeration is not a factor)
      let aeratedState = createSimulation({
        tankCapacity: 100,
        initialTemperature: 25,
        filter: { type: 'hob', enabled: true },
        airPump: { enabled: true },
      });
      // Tank without air pump (HOB filter, no sponge)
      let quietState = createSimulation({
        tankCapacity: 100,
        initialTemperature: 25,
        filter: { type: 'hob', enabled: true },
        airPump: { enabled: false },
      });

      // Depress O2 in both tanks
      const depressedO2 = 4.0;
      aeratedState = produce(aeratedState, (draft) => {
        draft.resources.oxygen = depressedO2;
      });
      quietState = produce(quietState, (draft) => {
        draft.resources.oxygen = depressedO2;
      });

      // Run 6 ticks
      aeratedState = runTicks(aeratedState, 6);
      quietState = runTicks(quietState, 6);

      // Both should have recovered some O2
      expect(aeratedState.resources.oxygen).toBeGreaterThan(depressedO2);
      expect(quietState.resources.oxygen).toBeGreaterThan(depressedO2);

      // Aerated tank should have recovered more
      expect(aeratedState.resources.oxygen).toBeGreaterThan(quietState.resources.oxygen);
    });
  });

  // -----------------------------------------------------------------------
  // Aeration strips excess CO2 faster than without
  // -----------------------------------------------------------------------
  describe('aeration strips CO2 faster', () => {
    it('air pump tank loses excess CO2 faster than non-aerated tank', () => {
      // Tank with air pump (HOB filter)
      let aeratedState = createSimulation({
        tankCapacity: 100,
        initialTemperature: 25,
        filter: { type: 'hob', enabled: true },
        airPump: { enabled: true },
      });
      // Tank without air pump (HOB filter)
      let quietState = createSimulation({
        tankCapacity: 100,
        initialTemperature: 25,
        filter: { type: 'hob', enabled: true },
        airPump: { enabled: false },
      });

      // Elevate CO2 in both
      const elevatedCo2 = 20.0;
      aeratedState = produce(aeratedState, (draft) => {
        draft.resources.co2 = elevatedCo2;
      });
      quietState = produce(quietState, (draft) => {
        draft.resources.co2 = elevatedCo2;
      });

      // Run 6 ticks
      aeratedState = runTicks(aeratedState, 6);
      quietState = runTicks(quietState, 6);

      // Both should have lost CO2
      expect(aeratedState.resources.co2).toBeLessThan(elevatedCo2);
      expect(quietState.resources.co2).toBeLessThan(elevatedCo2);

      // Aerated tank should have stripped more CO2 (lower value = more stripped)
      expect(aeratedState.resources.co2).toBeLessThan(quietState.resources.co2);
    });
  });

  // -----------------------------------------------------------------------
  // Fish respiration depresses O2 and raises CO2
  // (fish metabolism + gas exchange interaction)
  // -----------------------------------------------------------------------
  describe('fish respiration affects dissolved gases', () => {
    it('fish depress O2 and raise CO2 compared to empty tank', () => {
      // Empty tank
      let emptyState = createSimulation({ tankCapacity: 100, initialTemperature: 25 });

      // Tank with several fish (angelfish = 15g each, significant bioload)
      let fishState = createSimulation({ tankCapacity: 100, initialTemperature: 25 });
      for (let i = 0; i < 4; i++) {
        fishState = applyAction(fishState, { type: 'addFish', species: 'angelfish' }).state;
      }

      // Feed the fish so they have food to eat (keeps hunger stable)
      fishState = applyAction(fishState, { type: 'feed', amount: 2.0 }).state;

      // Run 12 ticks
      emptyState = runTicks(emptyState, 12);
      fishState = runTicks(fishState, 12);

      // Fish tank should have lower O2 than empty tank
      expect(fishState.resources.oxygen).toBeLessThan(emptyState.resources.oxygen);

      // Fish tank should have higher CO2 than empty tank
      expect(fishState.resources.co2).toBeGreaterThan(emptyState.resources.co2);
    });

    it('O2 still stabilizes with fish due to gas exchange replenishment', () => {
      // Tank with moderate fish load
      let state = createSimulation({ tankCapacity: 100, initialTemperature: 25 });
      state = applyAction(state, { type: 'addFish', species: 'neon_tetra' }).state;
      state = applyAction(state, { type: 'addFish', species: 'neon_tetra' }).state;

      // Run many ticks - gas exchange should keep O2 from crashing
      state = runTicks(state, 72);

      // O2 should remain in a healthy range (above 4 mg/L at minimum)
      expect(state.resources.oxygen).toBeGreaterThan(4.0);
    });
  });

  // -----------------------------------------------------------------------
  // Food decay consumes O2 and produces CO2
  // (decay + gas exchange interaction)
  // -----------------------------------------------------------------------
  describe('food decay affects dissolved gases', () => {
    it('decaying food consumes O2 and produces CO2', () => {
      // Tank with food
      let foodState = createSimulation({ tankCapacity: 100, initialTemperature: 25 });
      foodState = applyAction(foodState, { type: 'feed', amount: 3.0 }).state;

      // Control tank: no food
      let controlState = createSimulation({ tankCapacity: 100, initialTemperature: 25 });

      // Run several ticks for decay to take effect
      foodState = runTicks(foodState, 12);
      controlState = runTicks(controlState, 12);

      // Food tank should have lower O2 (bacteria consuming O2 during decay)
      expect(foodState.resources.oxygen).toBeLessThan(controlState.resources.oxygen);

      // Food tank should have higher CO2 (decay produces CO2)
      expect(foodState.resources.co2).toBeGreaterThan(controlState.resources.co2);
    });

    it('heavy feeding in small tank causes measurable O2 depression', () => {
      // Small tank with heavy feeding
      let state = createSimulation({ tankCapacity: 40, initialTemperature: 25 });
      const initialO2 = state.resources.oxygen;

      // Overfeed
      state = applyAction(state, { type: 'feed', amount: 5.0 }).state;

      // Run ticks for decay
      state = runTicks(state, 24);

      // O2 should be noticeably depressed from decay in a small volume
      expect(state.resources.oxygen).toBeLessThan(initialO2);
    });
  });

  // -----------------------------------------------------------------------
  // Filter disabled = reduced gas exchange (flow factor)
  // -----------------------------------------------------------------------
  describe('filter disabled reduces gas exchange', () => {
    it('tank with filter off recovers O2 slower than with filter on', () => {
      // Tank with filter on (HOB for non-aeration comparison)
      let filterOnState = createSimulation({
        tankCapacity: 100,
        initialTemperature: 25,
        filter: { type: 'hob', enabled: true },
        airPump: { enabled: false },
      });
      // Tank with filter off
      let filterOffState = createSimulation({
        tankCapacity: 100,
        initialTemperature: 25,
        filter: { type: 'hob', enabled: false },
        airPump: { enabled: false },
      });

      // Depress O2 in both
      const depressedO2 = 4.0;
      filterOnState = produce(filterOnState, (draft) => {
        draft.resources.oxygen = depressedO2;
      });
      filterOffState = produce(filterOffState, (draft) => {
        draft.resources.oxygen = depressedO2;
      });

      // Run 12 ticks
      filterOnState = runTicks(filterOnState, 12);
      filterOffState = runTicks(filterOffState, 12);

      // Both may recover some (passive surface exchange at flow=0 gives flowFactor=0,
      // so filter-off tank should have essentially zero gas exchange)
      // Filter-on tank should have recovered more O2
      expect(filterOnState.resources.oxygen).toBeGreaterThan(filterOffState.resources.oxygen);
    });

    it('no flow means nearly zero gas exchange rate', () => {
      // Tank with no filter, no powerhead, no air pump = zero flow
      let state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 25,
        filter: { type: 'hob', enabled: false },
        powerhead: { enabled: false },
        airPump: { enabled: false },
      });

      state = produce(state, (draft) => {
        draft.resources.oxygen = 4.0;
      });

      const o2Before = state.resources.oxygen;
      state = runTicks(state, 6);

      // With zero flow, flowFactor=0, so exchange rate = baseRate * 0 = 0
      // O2 should remain essentially unchanged
      expect(state.resources.oxygen).toBeCloseTo(o2Before, 1);
    });

    it('filter off also slows CO2 off-gassing', () => {
      let filterOnState = createSimulation({
        tankCapacity: 100,
        initialTemperature: 25,
        filter: { type: 'hob', enabled: true },
        airPump: { enabled: false },
      });
      let filterOffState = createSimulation({
        tankCapacity: 100,
        initialTemperature: 25,
        filter: { type: 'hob', enabled: false },
        airPump: { enabled: false },
      });

      // Elevate CO2 in both
      const elevatedCo2 = 15.0;
      filterOnState = produce(filterOnState, (draft) => {
        draft.resources.co2 = elevatedCo2;
      });
      filterOffState = produce(filterOffState, (draft) => {
        draft.resources.co2 = elevatedCo2;
      });

      filterOnState = runTicks(filterOnState, 12);
      filterOffState = runTicks(filterOffState, 12);

      // Filter-on should have off-gassed more CO2 (lower value)
      expect(filterOnState.resources.co2).toBeLessThan(filterOffState.resources.co2);
    });
  });

  // -----------------------------------------------------------------------
  // Sponge filter provides aeration (air-driven filter)
  // -----------------------------------------------------------------------
  describe('sponge filter provides aeration', () => {
    it('sponge filter aerates just like having an air pump', () => {
      // Sponge filter (air-driven, provides aeration) vs HOB (no aeration)
      let spongeState = createSimulation({
        tankCapacity: 100,
        initialTemperature: 25,
        filter: { type: 'sponge', enabled: true },
        airPump: { enabled: false },
      });
      let hobState = createSimulation({
        tankCapacity: 100,
        initialTemperature: 25,
        filter: { type: 'hob', enabled: true },
        airPump: { enabled: false },
      });

      // Depress O2
      spongeState = produce(spongeState, (draft) => {
        draft.resources.oxygen = 4.0;
      });
      hobState = produce(hobState, (draft) => {
        draft.resources.oxygen = 4.0;
      });

      spongeState = runTicks(spongeState, 6);
      hobState = runTicks(hobState, 6);

      // Sponge filter provides aeration, so it should recover O2 faster
      // even though HOB filter provides more raw flow
      expect(spongeState.resources.oxygen).toBeGreaterThan(hobState.resources.oxygen);
    });
  });
});

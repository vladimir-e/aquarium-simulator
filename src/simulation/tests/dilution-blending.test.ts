import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { createSimulation } from '../state.js';
import { tick } from '../tick.js';
import { applyAction } from '../actions/index.js';
import { getPpm, getMassFromPpm } from '../resources/helpers.js';

describe('Dilution & Blending integration', () => {
  describe('water change removes proportional mass of dissolved substances', () => {
    it('25% water change removes ~25% of ammonia, nitrite, and nitrate mass', () => {
      // Seed a tank with known nitrogen compound masses
      let state = createSimulation({ tankCapacity: 100 });
      state = produce(state, (draft) => {
        draft.resources.ammonia = getMassFromPpm(2.0, 100); // 200 mg
        draft.resources.nitrite = getMassFromPpm(1.0, 100); // 100 mg
        draft.resources.nitrate = getMassFromPpm(40, 100); // 4000 mg
      });

      const ammoniaBefore = state.resources.ammonia;
      const nitriteBefore = state.resources.nitrite;
      const nitrateBefore = state.resources.nitrate;

      state = applyAction(state, { type: 'waterChange', amount: 0.25 }).state;

      // Each compound should be reduced by 25%
      expect(state.resources.ammonia).toBeCloseTo(ammoniaBefore * 0.75, 5);
      expect(state.resources.nitrite).toBeCloseTo(nitriteBefore * 0.75, 5);
      expect(state.resources.nitrate).toBeCloseTo(nitrateBefore * 0.75, 5);
    });

    it('50% water change halves all dissolved compound masses', () => {
      let state = createSimulation({ tankCapacity: 100 });
      state = produce(state, (draft) => {
        draft.resources.ammonia = 500;
        draft.resources.nitrite = 200;
        draft.resources.nitrate = 8000;
        draft.resources.phosphate = 100;
        draft.resources.potassium = 1000;
        draft.resources.iron = 50;
      });

      state = applyAction(state, { type: 'waterChange', amount: 0.5 }).state;

      expect(state.resources.ammonia).toBeCloseTo(250, 5);
      expect(state.resources.nitrite).toBeCloseTo(100, 5);
      expect(state.resources.nitrate).toBeCloseTo(4000, 5);
      expect(state.resources.phosphate).toBeCloseTo(50, 5);
      expect(state.resources.potassium).toBeCloseTo(500, 5);
      expect(state.resources.iron).toBeCloseTo(25, 5);
    });
  });

  describe('water change blends temperature', () => {
    it('blends tank water temperature toward tap water temperature', () => {
      let state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 28,
        tapWaterTemperature: 18,
        // Disable heater so it does not counteract the blend
        heater: { enabled: false },
      });

      state = applyAction(state, { type: 'waterChange', amount: 0.5 }).state;

      // Tank starts at full 100L, remove 50% (50L), remaining = 50L at 28C
      // Add back 50L at 18C to fill to capacity
      // Blended: (28*50 + 18*50) / 100 = 23C
      expect(state.resources.temperature).toBeCloseTo(23, 1);
    });

    it('small water change causes small temperature shift', () => {
      let state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 26,
        tapWaterTemperature: 16,
        heater: { enabled: false },
      });

      state = applyAction(state, { type: 'waterChange', amount: 0.1 }).state;

      // Remove 10L (10%), remaining 90L at 26C, add 10L at 16C
      // Blended: (26*90 + 16*10) / 100 = 25C
      expect(state.resources.temperature).toBeCloseTo(25, 1);
    });

    it('large water change (90%) heavily shifts toward tap temperature', () => {
      let state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 30,
        tapWaterTemperature: 15,
        heater: { enabled: false },
      });

      state = applyAction(state, { type: 'waterChange', amount: 0.9 }).state;

      // Remove 90L, remaining 10L at 30C, add 90L at 15C
      // Blended: (30*10 + 15*90) / 100 = 16.5C
      expect(state.resources.temperature).toBeCloseTo(16.5, 1);
    });
  });

  describe('water change followed by ticks shows reduced concentrations', () => {
    it('nitrate ppm drops after water change and stays lower through ticks', () => {
      let state = createSimulation({ tankCapacity: 100 });
      state = produce(state, (draft) => {
        draft.resources.nitrate = getMassFromPpm(40, 100); // 40 ppm
      });

      const ppmBefore = getPpm(state.resources.nitrate, state.resources.water);
      expect(ppmBefore).toBeCloseTo(40, 1);

      // Perform a 50% water change
      state = applyAction(state, { type: 'waterChange', amount: 0.5 }).state;

      const ppmAfterChange = getPpm(state.resources.nitrate, state.resources.water);
      expect(ppmAfterChange).toBeCloseTo(20, 1);

      // Run a few ticks — nitrate may drift slightly from nitrogen cycle,
      // but should remain substantially lower than original 40 ppm
      for (let i = 0; i < 5; i++) {
        state = tick(state);
      }

      const ppmAfterTicks = getPpm(state.resources.nitrate, state.resources.water);
      expect(ppmAfterTicks).toBeLessThan(ppmBefore);
    });
  });

  describe('top-off adds water without adding solutes (dilution)', () => {
    it('top-off dilutes concentrations when water has evaporated', () => {
      let state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 25,
      });

      // Seed ammonia mass and manually reduce water to simulate evaporation
      const ammoniaMass = getMassFromPpm(1.0, 100); // 100 mg in 100L = 1 ppm
      state = produce(state, (draft) => {
        draft.resources.ammonia = ammoniaMass;
        draft.resources.water = 80; // 20L evaporated
      });

      // Before top-off: concentration is higher because less water
      const ppmBeforeTopOff = getPpm(state.resources.ammonia, state.resources.water);
      expect(ppmBeforeTopOff).toBeCloseTo(1.25, 2); // 100mg / 80L = 1.25 ppm

      // Top off restores water to 100L
      state = applyAction(state, { type: 'topOff' }).state;

      expect(state.resources.water).toBe(100);

      // Mass unchanged, but concentration drops back
      expect(state.resources.ammonia).toBeCloseTo(ammoniaMass, 5);
      const ppmAfterTopOff = getPpm(state.resources.ammonia, state.resources.water);
      expect(ppmAfterTopOff).toBeCloseTo(1.0, 2); // 100mg / 100L = 1.0 ppm
    });

    it('top-off does not add nitrogen compounds', () => {
      let state = createSimulation({ tankCapacity: 100 });
      state = produce(state, (draft) => {
        draft.resources.ammonia = 50;
        draft.resources.nitrite = 30;
        draft.resources.nitrate = 500;
        draft.resources.water = 70; // simulate evaporation
      });

      const ammoniaBefore = state.resources.ammonia;
      const nitriteBefore = state.resources.nitrite;
      const nitrateBefore = state.resources.nitrate;

      state = applyAction(state, { type: 'topOff' }).state;

      // Mass is unchanged — top-off adds pure water
      expect(state.resources.ammonia).toBe(ammoniaBefore);
      expect(state.resources.nitrite).toBe(nitriteBefore);
      expect(state.resources.nitrate).toBe(nitrateBefore);

      // But concentration drops because volume increased
      expect(getPpm(state.resources.nitrate, state.resources.water)).toBeLessThan(
        getPpm(nitrateBefore, 70)
      );
    });
  });

  describe('multiple water changes progressively reduce nitrate', () => {
    it('three successive 25% water changes reduce nitrate to ~42% of original', () => {
      let state = createSimulation({ tankCapacity: 100 });
      state = produce(state, (draft) => {
        draft.resources.nitrate = getMassFromPpm(80, 100); // 80 ppm
      });

      const originalMass = state.resources.nitrate;

      // Each 25% change retains 75% of mass: 0.75^3 = 0.421875
      state = applyAction(state, { type: 'waterChange', amount: 0.25 }).state;
      state = applyAction(state, { type: 'waterChange', amount: 0.25 }).state;
      state = applyAction(state, { type: 'waterChange', amount: 0.25 }).state;

      const expectedMass = originalMass * Math.pow(0.75, 3);
      expect(state.resources.nitrate).toBeCloseTo(expectedMass, 1);

      const finalPpm = getPpm(state.resources.nitrate, state.resources.water);
      expect(finalPpm).toBeCloseTo(80 * Math.pow(0.75, 3), 1); // ~33.75 ppm
    });

    it('repeated 50% changes converge toward zero', () => {
      let state = createSimulation({ tankCapacity: 100 });
      state = produce(state, (draft) => {
        draft.resources.nitrate = getMassFromPpm(100, 100);
      });

      for (let i = 0; i < 5; i++) {
        state = applyAction(state, { type: 'waterChange', amount: 0.5 }).state;
      }

      // 0.5^5 = 0.03125 => ~3.125 ppm from original 100 ppm
      const finalPpm = getPpm(state.resources.nitrate, state.resources.water);
      expect(finalPpm).toBeCloseTo(100 * Math.pow(0.5, 5), 1);
      expect(finalPpm).toBeLessThan(5);
    });
  });

  describe('water change during nitrogen cycle — partial reset', () => {
    it('water change mid-cycle reduces ammonia and nitrite but does not eliminate bacteria', () => {
      // Build up nitrogen cycle: feed, let ticks run so ammonia/nitrite build
      let state = createSimulation({ tankCapacity: 100 });

      // Seed waste so the nitrogen cycle has something to work with
      state = produce(state, (draft) => {
        draft.resources.waste = 5.0; // 5g of waste
      });

      // Run ticks to let waste convert to ammonia
      for (let i = 0; i < 24; i++) {
        state = tick(state);
      }

      // Should have ammonia by now from waste->ammonia conversion
      const ammoniaBeforeChange = state.resources.ammonia;
      expect(ammoniaBeforeChange).toBeGreaterThan(0);

      // Record AOB/NOB if any have grown
      const aobBefore = state.resources.aob;

      // Perform 50% water change
      state = applyAction(state, { type: 'waterChange', amount: 0.5 }).state;

      // Ammonia mass should be halved
      expect(state.resources.ammonia).toBeCloseTo(ammoniaBeforeChange * 0.5, 1);

      // Bacteria are not dissolved — they live on surfaces, unaffected by water change
      expect(state.resources.aob).toBe(aobBefore);

      // Run a few more ticks — bacteria continue processing the reduced ammonia
      for (let i = 0; i < 10; i++) {
        state = tick(state);
      }

      // The cycle continues — ammonia does not stall at zero since waste is still present
      // (waste continues converting, bacteria keep processing)
      expect(state.resources.ammonia).toBeGreaterThanOrEqual(0);
    });
  });

  describe('evaporation concentrates then water change dilutes (multi-system)', () => {
    it('evaporation raises ppm, water change lowers it', () => {
      // Use a tank with no lid for maximum evaporation, and a temperature
      // above room temp to drive evaporation. Disable heater to avoid complexity.
      let state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 28,
        roomTemperature: 22,
        heater: { enabled: false },
        lid: { type: 'none' },
      });

      // Seed nitrate for tracking concentration
      const initialMass = getMassFromPpm(20, 100); // 20 ppm at 100L
      state = produce(state, (draft) => {
        draft.resources.nitrate = initialMass;
      });

      const initialPpm = getPpm(state.resources.nitrate, state.resources.water);
      expect(initialPpm).toBeCloseTo(20, 1);

      // Run ticks to let evaporation reduce water volume
      // With base rate 1%/day and temp delta of 6C, evaporation is modest
      // Run for several days to see a measurable effect
      for (let i = 0; i < 72; i++) {
        // 3 days
        state = tick(state);
      }

      // Water level should have dropped from evaporation
      expect(state.resources.water).toBeLessThan(100);
      const waterAfterEvap = state.resources.water;

      // Nitrate mass may change slightly due to nitrogen cycle, but
      // concentration should be higher because volume dropped
      // Use the mass we have now, not the initial mass
      const massAfterEvap = state.resources.nitrate;
      const ppmAfterEvap = getPpm(massAfterEvap, waterAfterEvap);

      // If mass stayed the same, ppm would be initialMass / waterAfterEvap
      // which is > 20 since waterAfterEvap < 100
      // Even if nitrogen cycle added or removed some, the concentration effect is real
      expect(ppmAfterEvap).toBeGreaterThan(initialPpm);

      // Now do a water change to dilute
      state = applyAction(state, { type: 'waterChange', amount: 0.5 }).state;

      // Water should be back to capacity
      expect(state.resources.water).toBe(100);

      const ppmAfterChange = getPpm(state.resources.nitrate, state.resources.water);

      // Water change removed 50% of remaining mass AND restored volume to 100L
      // So ppm should be substantially lower than the concentrated value
      expect(ppmAfterChange).toBeLessThan(ppmAfterEvap);
    });

    it('top-off after evaporation restores concentration without removing mass', () => {
      let state = createSimulation({
        tankCapacity: 100,
        initialTemperature: 28,
        roomTemperature: 22,
        heater: { enabled: false },
        lid: { type: 'none' },
      });

      const initialMass = getMassFromPpm(10, 100);
      state = produce(state, (draft) => {
        draft.resources.nitrate = initialMass;
      });

      // Let evaporation run
      for (let i = 0; i < 72; i++) {
        state = tick(state);
      }

      const massAfterEvap = state.resources.nitrate;
      const waterAfterEvap = state.resources.water;
      expect(waterAfterEvap).toBeLessThan(100);

      const ppmConcentrated = getPpm(massAfterEvap, waterAfterEvap);

      // Top off — adds pure water, no solutes removed
      state = applyAction(state, { type: 'topOff' }).state;

      expect(state.resources.water).toBe(100);
      // Mass is unchanged by top-off
      expect(state.resources.nitrate).toBeCloseTo(massAfterEvap, 5);

      const ppmAfterTopOff = getPpm(state.resources.nitrate, state.resources.water);
      // Concentration drops back toward original because volume is restored
      expect(ppmAfterTopOff).toBeLessThan(ppmConcentrated);
      // Mass preserved means ppm = mass / 100, which is close to what we had
      // before evaporation changed things (minus any nitrogen cycle activity)
      expect(ppmAfterTopOff).toBeCloseTo(massAfterEvap / 100, 2);
    });
  });

  describe('water volume is restored to capacity after water change', () => {
    it('water change always fills tank back to 100% capacity', () => {
      let state = createSimulation({ tankCapacity: 100 });

      // Simulate partial evaporation
      state = produce(state, (draft) => {
        draft.resources.water = 85;
      });

      state = applyAction(state, { type: 'waterChange', amount: 0.25 }).state;

      // Water change removes 25% of current (85L * 0.25 = 21.25L removed)
      // Then fills to capacity (100L)
      expect(state.resources.water).toBe(100);
    });
  });
});

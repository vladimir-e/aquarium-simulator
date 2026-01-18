import { describe, it, expect } from 'vitest';
import { calculatePassiveResources } from './index.js';
import { createSimulation } from '../state.js';
import { FILTER_SURFACE, getFilterFlow } from './filter.js';
import { POWERHEAD_FLOW_LPH } from './powerhead.js';
import { HARDSCAPE_SURFACE } from '../state.js';
import type { HardscapeItem } from '../state.js';

describe('calculatePassiveResources', () => {
  describe('surface calculation', () => {
    it('includes tank bacteria surface', () => {
      const state = createSimulation({
        tankCapacity: 100,
        filter: { enabled: false },
        substrate: { type: 'none' },
      });

      const resources = calculatePassiveResources(state);

      // Should only have tank surface (positive number)
      expect(resources.surface).toBeGreaterThan(0);
      expect(Number.isInteger(resources.surface)).toBe(true);
    });

    it('includes filter surface when enabled', () => {
      const stateWithFilter = createSimulation({
        tankCapacity: 100,
        filter: { enabled: true, type: 'canister' },
        substrate: { type: 'none' },
      });

      const stateWithoutFilter = createSimulation({
        tankCapacity: 100,
        filter: { enabled: false },
        substrate: { type: 'none' },
      });

      const resourcesWithFilter = calculatePassiveResources(stateWithFilter);
      const resourcesWithoutFilter = calculatePassiveResources(stateWithoutFilter);

      expect(resourcesWithFilter.surface).toBe(
        resourcesWithoutFilter.surface + FILTER_SURFACE.canister
      );
    });

    it('disabled filter contributes 0 surface', () => {
      const stateEnabled = createSimulation({
        tankCapacity: 100,
        filter: { enabled: true, type: 'canister' },
        substrate: { type: 'none' },
      });

      const stateDisabled = createSimulation({
        tankCapacity: 100,
        filter: { enabled: false, type: 'canister' },
        substrate: { type: 'none' },
      });

      const resourcesEnabled = calculatePassiveResources(stateEnabled);
      const resourcesDisabled = calculatePassiveResources(stateDisabled);

      expect(resourcesDisabled.surface).toBe(
        resourcesEnabled.surface - FILTER_SURFACE.canister
      );
    });

    it('includes substrate surface based on type and tank capacity', () => {
      const stateWithGravel = createSimulation({
        tankCapacity: 100,
        filter: { enabled: false },
        substrate: { type: 'gravel' },
      });

      const stateWithoutSubstrate = createSimulation({
        tankCapacity: 100,
        filter: { enabled: false },
        substrate: { type: 'none' },
      });

      const resourcesWithGravel = calculatePassiveResources(stateWithGravel);
      const resourcesWithoutSubstrate = calculatePassiveResources(stateWithoutSubstrate);

      // 800 cm²/L * 100L = 80,000 cm²
      expect(resourcesWithGravel.surface).toBe(
        resourcesWithoutSubstrate.surface + 80000
      );
    });

    it('substrate none contributes 0 surface', () => {
      const stateNone = createSimulation({
        tankCapacity: 100,
        filter: { enabled: false },
        substrate: { type: 'none' },
      });

      const stateGravel = createSimulation({
        tankCapacity: 100,
        filter: { enabled: false },
        substrate: { type: 'gravel' },
      });

      const resourcesNone = calculatePassiveResources(stateNone);
      const resourcesGravel = calculatePassiveResources(stateGravel);

      expect(resourcesNone.surface).toBeLessThan(resourcesGravel.surface);
      expect(resourcesGravel.surface - resourcesNone.surface).toBe(80000); // gravel surface
    });

    it('aqua soil provides most surface', () => {
      const stateSand = createSimulation({
        tankCapacity: 100,
        filter: { enabled: false },
        substrate: { type: 'sand' },
      });

      const stateAquaSoil = createSimulation({
        tankCapacity: 100,
        filter: { enabled: false },
        substrate: { type: 'aqua_soil' },
      });

      const resourcesSand = calculatePassiveResources(stateSand);
      const resourcesAquaSoil = calculatePassiveResources(stateAquaSoil);

      expect(resourcesAquaSoil.surface).toBeGreaterThan(resourcesSand.surface);
    });

    it('totals all sources correctly', () => {
      const stateWithAll = createSimulation({
        tankCapacity: 100,
        filter: { enabled: true, type: 'hob' },
        substrate: { type: 'sand' },
      });

      const stateBase = createSimulation({
        tankCapacity: 100,
        filter: { enabled: false },
        substrate: { type: 'none' },
      });

      const resourcesWithAll = calculatePassiveResources(stateWithAll);
      const resourcesBase = calculatePassiveResources(stateBase);

      // Should include tank + filter + substrate
      const expected =
        resourcesBase.surface +
        FILTER_SURFACE.hob +
        400 * 100; // sand: 400 cm²/L * 100L

      expect(resourcesWithAll.surface).toBe(expected);
    });
  });

  describe('flow calculation', () => {
    it('includes filter flow when enabled (scaled to tank size)', () => {
      const state = createSimulation({
        tankCapacity: 100,
        filter: { enabled: true, type: 'hob' },
        powerhead: { enabled: false },
      });

      const resources = calculatePassiveResources(state);

      // HOB on 100L tank: 100 * 6x turnover = 600 L/h
      expect(resources.flow).toBe(getFilterFlow('hob', 100));
      expect(resources.flow).toBe(600);
    });

    it('disabled filter contributes 0 flow', () => {
      const state = createSimulation({
        tankCapacity: 100,
        filter: { enabled: false, type: 'hob' },
        powerhead: { enabled: false },
      });

      const resources = calculatePassiveResources(state);

      expect(resources.flow).toBe(0);
    });

    it('includes powerhead flow when enabled', () => {
      const state = createSimulation({
        tankCapacity: 100,
        filter: { enabled: false },
        powerhead: { enabled: true, flowRateGPH: 400 },
      });

      const resources = calculatePassiveResources(state);

      expect(resources.flow).toBe(POWERHEAD_FLOW_LPH[400]);
    });

    it('powerhead disabled contributes 0 flow', () => {
      const state = createSimulation({
        tankCapacity: 100,
        filter: { enabled: false },
        powerhead: { enabled: false, flowRateGPH: 850 },
      });

      const resources = calculatePassiveResources(state);

      expect(resources.flow).toBe(0);
    });

    it('powerhead 240 GPH provides 908 L/h', () => {
      const state = createSimulation({
        tankCapacity: 100,
        filter: { enabled: false },
        powerhead: { enabled: true, flowRateGPH: 240 },
      });

      const resources = calculatePassiveResources(state);

      expect(resources.flow).toBe(908);
    });

    it('powerhead 850 GPH provides 3218 L/h', () => {
      const state = createSimulation({
        tankCapacity: 100,
        filter: { enabled: false },
        powerhead: { enabled: true, flowRateGPH: 850 },
      });

      const resources = calculatePassiveResources(state);

      expect(resources.flow).toBe(3218);
    });

    it('sponge filter caps flow at 300 L/h for large tanks', () => {
      const state = createSimulation({
        tankCapacity: 100,
        filter: { enabled: true, type: 'sponge' },
        powerhead: { enabled: false },
      });

      const resources = calculatePassiveResources(state);

      // Sponge on 100L tank: 100 * 4x = 400, but capped at 300 L/h
      expect(resources.flow).toBe(300);
    });

    it('sump filter provides highest flow (1000 L/h)', () => {
      const state = createSimulation({
        tankCapacity: 100,
        filter: { enabled: true, type: 'sump' },
        powerhead: { enabled: false },
      });

      const resources = calculatePassiveResources(state);

      expect(resources.flow).toBe(1000);
    });

    it('totals filter + powerhead correctly', () => {
      const state = createSimulation({
        tankCapacity: 100,
        filter: { enabled: true, type: 'canister' },
        powerhead: { enabled: true, flowRateGPH: 600 },
      });

      const resources = calculatePassiveResources(state);

      // Canister on 100L tank: 100 * 8x turnover = 800 L/h
      // Plus powerhead 600 GPH = 2271 L/h
      expect(resources.flow).toBe(
        getFilterFlow('canister', 100) + POWERHEAD_FLOW_LPH[600]
      );
    });
  });

  describe('hardscape surface calculation', () => {
    it('includes hardscape surface in total', () => {
      const items: HardscapeItem[] = [
        { id: 'test-1', type: 'driftwood' },
      ];
      const stateWithHardscape = createSimulation({
        tankCapacity: 100,
        filter: { enabled: false },
        substrate: { type: 'none' },
        hardscape: { items },
      });

      const stateWithoutHardscape = createSimulation({
        tankCapacity: 100,
        filter: { enabled: false },
        substrate: { type: 'none' },
      });

      const resourcesWithHardscape = calculatePassiveResources(stateWithHardscape);
      const resourcesWithoutHardscape = calculatePassiveResources(stateWithoutHardscape);

      expect(resourcesWithHardscape.surface).toBe(
        resourcesWithoutHardscape.surface + HARDSCAPE_SURFACE.driftwood
      );
    });

    it('hardscape surface adds to tank + filter + substrate', () => {
      const items: HardscapeItem[] = [
        { id: 'test-1', type: 'neutral_rock' },
      ];
      const stateWithHardscape = createSimulation({
        tankCapacity: 100,
        filter: { enabled: true, type: 'hob' },
        substrate: { type: 'sand' },
        hardscape: { items },
      });

      const stateWithoutHardscape = createSimulation({
        tankCapacity: 100,
        filter: { enabled: true, type: 'hob' },
        substrate: { type: 'sand' },
      });

      const resourcesWithHardscape = calculatePassiveResources(stateWithHardscape);
      const resourcesWithoutHardscape = calculatePassiveResources(stateWithoutHardscape);

      expect(resourcesWithHardscape.surface).toBe(
        resourcesWithoutHardscape.surface + HARDSCAPE_SURFACE.neutral_rock
      );
    });

    it('empty hardscape contributes 0 surface', () => {
      const stateWithHardscape = createSimulation({
        tankCapacity: 100,
        filter: { enabled: false },
        substrate: { type: 'none' },
        hardscape: { items: [{ id: '1', type: 'driftwood' }] },
      });

      const stateWithoutHardscape = createSimulation({
        tankCapacity: 100,
        filter: { enabled: false },
        substrate: { type: 'none' },
        hardscape: { items: [] },
      });

      const resourcesWithHardscape = calculatePassiveResources(stateWithHardscape);
      const resourcesWithoutHardscape = calculatePassiveResources(stateWithoutHardscape);

      expect(resourcesWithoutHardscape.surface).toBeLessThan(resourcesWithHardscape.surface);
      expect(resourcesWithHardscape.surface - resourcesWithoutHardscape.surface).toBe(
        HARDSCAPE_SURFACE.driftwood
      );
    });

    it('multiple hardscape items sum correctly', () => {
      const items: HardscapeItem[] = [
        { id: '1', type: 'neutral_rock' },  // 400
        { id: '2', type: 'driftwood' },      // 650
        { id: '3', type: 'plastic_decoration' }, // 100
      ];
      const stateWithHardscape = createSimulation({
        tankCapacity: 100,
        filter: { enabled: false },
        substrate: { type: 'none' },
        hardscape: { items },
      });

      const stateWithoutHardscape = createSimulation({
        tankCapacity: 100,
        filter: { enabled: false },
        substrate: { type: 'none' },
      });

      const resourcesWithHardscape = calculatePassiveResources(stateWithHardscape);
      const resourcesWithoutHardscape = calculatePassiveResources(stateWithoutHardscape);

      expect(resourcesWithHardscape.surface).toBe(
        resourcesWithoutHardscape.surface + 400 + 650 + 100
      );
    });

    it('different hardscape types have different surfaces', () => {
      const driftwoodState = createSimulation({
        tankCapacity: 100,
        filter: { enabled: false },
        substrate: { type: 'none' },
        hardscape: { items: [{ id: '1', type: 'driftwood' }] },
      });

      const plasticState = createSimulation({
        tankCapacity: 100,
        filter: { enabled: false },
        substrate: { type: 'none' },
        hardscape: { items: [{ id: '1', type: 'plastic_decoration' }] },
      });

      const driftwoodResources = calculatePassiveResources(driftwoodState);
      const plasticResources = calculatePassiveResources(plasticState);

      expect(driftwoodResources.surface).toBeGreaterThan(plasticResources.surface);
      expect(driftwoodResources.surface - plasticResources.surface).toBe(
        HARDSCAPE_SURFACE.driftwood - HARDSCAPE_SURFACE.plastic_decoration
      );
    });
  });

  describe('light calculation', () => {
    it('returns 0 light when light disabled', () => {
      const state = createSimulation({ tankCapacity: 100 });
      state.equipment.light.enabled = false;
      const resources = calculatePassiveResources(state);
      expect(resources.light).toBe(0);
    });

    it('returns wattage when schedule active', () => {
      const state = createSimulation({ tankCapacity: 100 });
      state.tick = 10; // hourOfDay = 10
      state.equipment.light.enabled = true;
      state.equipment.light.wattage = 150;
      state.equipment.light.schedule = { startHour: 8, duration: 10 }; // 8am-6pm
      const resources = calculatePassiveResources(state);
      expect(resources.light).toBe(150);
    });

    it('returns 0 when outside schedule', () => {
      const state = createSimulation({ tankCapacity: 100 });
      state.tick = 20; // hourOfDay = 20 (8pm)
      state.equipment.light.enabled = true;
      state.equipment.light.wattage = 150;
      state.equipment.light.schedule = { startHour: 8, duration: 10 }; // 8am-6pm
      const resources = calculatePassiveResources(state);
      expect(resources.light).toBe(0);
    });

    it('handles 24-hour duration (always-on)', () => {
      const state = createSimulation({ tankCapacity: 100 });
      state.equipment.light.enabled = true;
      state.equipment.light.wattage = 100;
      state.equipment.light.schedule = { startHour: 0, duration: 24 };

      // Test various hours - all should be on
      state.tick = 0;
      expect(calculatePassiveResources(state).light).toBe(100);
      state.tick = 12;
      expect(calculatePassiveResources(state).light).toBe(100);
      state.tick = 23;
      expect(calculatePassiveResources(state).light).toBe(100);
    });

    it('handles midnight wrap-around schedule', () => {
      const state = createSimulation({ tankCapacity: 100 });
      state.equipment.light.enabled = true;
      state.equipment.light.wattage = 100;
      state.equipment.light.schedule = { startHour: 22, duration: 8 }; // 10pm-6am

      // Test hours during active period
      state.tick = 23; // 11pm - should be on
      expect(calculatePassiveResources(state).light).toBe(100);

      state.tick = 2; // 2am - should be on
      expect(calculatePassiveResources(state).light).toBe(100);

      state.tick = 10; // 10am - should be off
      expect(calculatePassiveResources(state).light).toBe(0);
    });

    it('light initializes with default values', () => {
      const state = createSimulation({ tankCapacity: 100 });
      expect(state.equipment.light.enabled).toBe(true);
      expect(state.equipment.light.wattage).toBe(100);
      expect(state.equipment.light.schedule.startHour).toBe(8);
      expect(state.equipment.light.schedule.duration).toBe(10);
    });

    it('can be disabled', () => {
      const state = createSimulation({ tankCapacity: 100 });
      state.tick = 10; // During default schedule
      state.equipment.light.enabled = false;
      expect(calculatePassiveResources(state).light).toBe(0);
    });

    it('can have wattage changed', () => {
      const state = createSimulation({ tankCapacity: 100 });
      state.tick = 10; // During schedule (8am-6pm default)
      state.equipment.light.wattage = 200;
      expect(calculatePassiveResources(state).light).toBe(200);
    });

    it('can have schedule updated', () => {
      const state = createSimulation({ tankCapacity: 100 });
      state.equipment.light.schedule = { startHour: 6, duration: 12 };
      state.tick = 6; // Start of new schedule
      expect(calculatePassiveResources(state).light).toBe(100);
      state.tick = 18; // End of new schedule
      expect(calculatePassiveResources(state).light).toBe(0);
    });

    it('supports always-on with 24h duration', () => {
      const state = createSimulation({ tankCapacity: 100 });
      state.equipment.light.schedule = { startHour: 0, duration: 24 };

      // Verify light is on at any time
      for (let hour = 0; hour < 24; hour++) {
        state.tick = hour;
        expect(calculatePassiveResources(state).light).toBe(100);
      }
    });

    it('correctly calculates hourOfDay from tick across multiple days', () => {
      const state = createSimulation({ tankCapacity: 100 });
      state.equipment.light.schedule = { startHour: 8, duration: 10 }; // 8am-6pm

      // Day 0, hour 10
      state.tick = 10;
      expect(calculatePassiveResources(state).light).toBe(100);

      // Day 1, hour 10 (tick 34)
      state.tick = 34;
      expect(calculatePassiveResources(state).light).toBe(100);

      // Day 2, hour 20 (tick 68) - outside schedule
      state.tick = 68;
      expect(calculatePassiveResources(state).light).toBe(0);
    });
  });
});

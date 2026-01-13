import { describe, it, expect } from 'vitest';
import {
  calculatePassiveResources,
  getFilterSurface,
  getFilterFlow,
  getPowerheadFlow,
  getSubstrateSurface,
} from './passive-resources.js';
import { createSimulation, FILTER_SURFACE, FILTER_FLOW, POWERHEAD_FLOW_LPH } from './state.js';

describe('getFilterSurface', () => {
  it('returns correct surface for sponge filter', () => {
    expect(getFilterSurface('sponge')).toBe(8000);
  });

  it('returns correct surface for HOB filter', () => {
    expect(getFilterSurface('hob')).toBe(15000);
  });

  it('returns correct surface for canister filter', () => {
    expect(getFilterSurface('canister')).toBe(25000);
  });

  it('returns correct surface for sump filter', () => {
    expect(getFilterSurface('sump')).toBe(40000);
  });
});

describe('getFilterFlow', () => {
  it('returns correct flow for sponge filter (lowest)', () => {
    expect(getFilterFlow('sponge')).toBe(100);
  });

  it('returns correct flow for HOB filter', () => {
    expect(getFilterFlow('hob')).toBe(300);
  });

  it('returns correct flow for canister filter', () => {
    expect(getFilterFlow('canister')).toBe(600);
  });

  it('returns correct flow for sump filter (highest)', () => {
    expect(getFilterFlow('sump')).toBe(1000);
  });
});

describe('getPowerheadFlow', () => {
  it('converts 240 GPH to 908 L/h', () => {
    expect(getPowerheadFlow(240)).toBe(908);
  });

  it('converts 400 GPH to 1514 L/h', () => {
    expect(getPowerheadFlow(400)).toBe(1514);
  });

  it('converts 600 GPH to 2271 L/h', () => {
    expect(getPowerheadFlow(600)).toBe(2271);
  });

  it('converts 850 GPH to 3218 L/h', () => {
    expect(getPowerheadFlow(850)).toBe(3218);
  });
});

describe('getSubstrateSurface', () => {
  it('returns 0 for no substrate', () => {
    expect(getSubstrateSurface('none', 100)).toBe(0);
  });

  it('returns correct surface for sand (400 cm²/L)', () => {
    expect(getSubstrateSurface('sand', 100)).toBe(40000);
  });

  it('returns correct surface for gravel (800 cm²/L)', () => {
    expect(getSubstrateSurface('gravel', 100)).toBe(80000);
  });

  it('returns correct surface for aqua soil (1200 cm²/L, highest)', () => {
    expect(getSubstrateSurface('aqua_soil', 100)).toBe(120000);
  });

  it('scales surface with tank capacity', () => {
    expect(getSubstrateSurface('gravel', 50)).toBe(40000);
    expect(getSubstrateSurface('gravel', 200)).toBe(160000);
  });
});

describe('calculatePassiveResources', () => {
  describe('surface calculation', () => {
    it('includes tank bacteria surface', () => {
      const state = createSimulation({
        tankCapacity: 100,
        filter: { enabled: false },
        substrate: { type: 'none' },
      });

      const resources = calculatePassiveResources(state);

      // Should only have tank surface
      expect(resources.surface).toBe(state.tank.bacteriaSurface);
    });

    it('includes filter surface when enabled', () => {
      const state = createSimulation({
        tankCapacity: 100,
        filter: { enabled: true, type: 'canister' },
        substrate: { type: 'none' },
      });

      const resources = calculatePassiveResources(state);

      expect(resources.surface).toBe(
        state.tank.bacteriaSurface + FILTER_SURFACE.canister
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
      const state = createSimulation({
        tankCapacity: 100,
        filter: { enabled: false },
        substrate: { type: 'gravel' },
      });

      const resources = calculatePassiveResources(state);

      // 800 cm²/L * 100L = 80,000 cm²
      expect(resources.surface).toBe(state.tank.bacteriaSurface + 80000);
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
      const state = createSimulation({
        tankCapacity: 100,
        filter: { enabled: true, type: 'hob' },
        substrate: { type: 'sand' },
      });

      const resources = calculatePassiveResources(state);

      const expected =
        state.tank.bacteriaSurface +
        FILTER_SURFACE.hob +
        400 * 100; // sand: 400 cm²/L * 100L

      expect(resources.surface).toBe(expected);
    });
  });

  describe('flow calculation', () => {
    it('includes filter flow when enabled', () => {
      const state = createSimulation({
        tankCapacity: 100,
        filter: { enabled: true, type: 'hob' },
        powerhead: { enabled: false },
      });

      const resources = calculatePassiveResources(state);

      expect(resources.flow).toBe(FILTER_FLOW.hob);
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

    it('sponge filter provides lowest flow (100 L/h)', () => {
      const state = createSimulation({
        tankCapacity: 100,
        filter: { enabled: true, type: 'sponge' },
        powerhead: { enabled: false },
      });

      const resources = calculatePassiveResources(state);

      expect(resources.flow).toBe(100);
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

      expect(resources.flow).toBe(
        FILTER_FLOW.canister + POWERHEAD_FLOW_LPH[600]
      );
    });
  });
});

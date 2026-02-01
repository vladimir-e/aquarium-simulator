/**
 * Unit tests for persistence schema validation.
 */

import { describe, it, expect } from 'vitest';
import {
  validateSimulation,
  validateTunableConfig,
  validateUI,
  validatePersistedState,
  isCurrentVersion,
} from './schema.js';
import { PERSISTENCE_SCHEMA_VERSION } from './types.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';

describe('schema validation', () => {
  describe('validateSimulation', () => {
    it('validates a correct simulation state', () => {
      const validSimulation = createValidSimulation();
      const result = validateSimulation(validSimulation);
      expect(result).not.toBeNull();
      expect(result?.tick).toBe(100);
    });

    it('rejects simulation with invalid tick', () => {
      const invalid = { ...createValidSimulation(), tick: -1 };
      const result = validateSimulation(invalid);
      expect(result).toBeNull();
    });

    it('rejects simulation with missing fields', () => {
      const invalid = { tick: 100 }; // Missing all other fields
      const result = validateSimulation(invalid);
      expect(result).toBeNull();
    });

    it('rejects simulation with invalid equipment type', () => {
      const invalid = createValidSimulation();
      invalid.equipment.filter.type = 'invalid_filter' as 'hob';
      const result = validateSimulation(invalid);
      expect(result).toBeNull();
    });

    it('rejects simulation with out-of-range values', () => {
      const invalid = createValidSimulation();
      invalid.resources.ph = 15; // pH must be 0-14
      const result = validateSimulation(invalid);
      expect(result).toBeNull();
    });

    it('validates plants array', () => {
      const withPlants = createValidSimulation();
      withPlants.plants = [
        { id: 'plant-1', species: 'java_fern', size: 50 },
        { id: 'plant-2', species: 'anubias', size: 100 },
      ];
      const result = validateSimulation(withPlants);
      expect(result).not.toBeNull();
      expect(result?.plants).toHaveLength(2);
    });

    it('rejects invalid plant species', () => {
      const invalid = createValidSimulation();
      invalid.plants = [
        { id: 'plant-1', species: 'invalid_species' as 'java_fern', size: 50 },
      ];
      const result = validateSimulation(invalid);
      expect(result).toBeNull();
    });
  });

  describe('validateTunableConfig', () => {
    it('validates a correct config', () => {
      const result = validateTunableConfig(DEFAULT_CONFIG);
      expect(result).not.toBeNull();
    });

    it('rejects config with missing sections', () => {
      const invalid = { decay: DEFAULT_CONFIG.decay }; // Missing other sections
      const result = validateTunableConfig(invalid);
      expect(result).toBeNull();
    });

    it('rejects config with non-number values', () => {
      const invalid = {
        ...DEFAULT_CONFIG,
        decay: { ...DEFAULT_CONFIG.decay, foodDecayRate: 'invalid' },
      };
      const result = validateTunableConfig(invalid);
      expect(result).toBeNull();
    });
  });

  describe('validateUI', () => {
    it('validates correct UI preferences', () => {
      const valid = { units: 'metric' as const, debugPanelOpen: false };
      const result = validateUI(valid);
      expect(result).not.toBeNull();
      expect(result?.units).toBe('metric');
    });

    it('accepts imperial units', () => {
      const valid = { units: 'imperial' as const, debugPanelOpen: true };
      const result = validateUI(valid);
      expect(result).not.toBeNull();
      expect(result?.units).toBe('imperial');
    });

    it('rejects invalid units', () => {
      const invalid = { units: 'celsius', debugPanelOpen: false };
      const result = validateUI(invalid);
      expect(result).toBeNull();
    });

    it('rejects non-boolean debugPanelOpen', () => {
      const invalid = { units: 'metric', debugPanelOpen: 'yes' };
      const result = validateUI(invalid);
      expect(result).toBeNull();
    });
  });

  describe('validatePersistedState', () => {
    it('validates complete persisted state', () => {
      const valid = {
        version: PERSISTENCE_SCHEMA_VERSION,
        simulation: createValidSimulation(),
        tunableConfig: DEFAULT_CONFIG,
        ui: { units: 'metric' as const, debugPanelOpen: false },
      };
      const result = validatePersistedState(valid);
      expect(result).not.toBeNull();
    });

    it('rejects state with wrong version type', () => {
      const invalid = {
        version: '1', // Should be number
        simulation: createValidSimulation(),
        tunableConfig: DEFAULT_CONFIG,
        ui: { units: 'metric' as const, debugPanelOpen: false },
      };
      const result = validatePersistedState(invalid);
      expect(result).toBeNull();
    });

    it('rejects state with missing sections', () => {
      const invalid = {
        version: PERSISTENCE_SCHEMA_VERSION,
        simulation: createValidSimulation(),
        // Missing tunableConfig and ui
      };
      const result = validatePersistedState(invalid);
      expect(result).toBeNull();
    });
  });

  describe('isCurrentVersion', () => {
    it('returns true for current version', () => {
      expect(isCurrentVersion(PERSISTENCE_SCHEMA_VERSION)).toBe(true);
    });

    it('returns false for old version', () => {
      expect(isCurrentVersion(0)).toBe(false);
    });

    it('returns false for future version', () => {
      expect(isCurrentVersion(PERSISTENCE_SCHEMA_VERSION + 1)).toBe(false);
    });
  });
});

/**
 * Helper to create a valid simulation state for testing.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createValidSimulation() {
  return {
    tick: 100,
    tank: { capacity: 40, hardscapeSlots: 4 },
    resources: {
      water: 40,
      temperature: 25,
      surface: 500,
      flow: 100,
      light: 0,
      aeration: false,
      food: 0,
      waste: 0,
      algae: 0,
      ammonia: 0,
      nitrite: 0,
      nitrate: 0,
      oxygen: 8,
      co2: 4,
      ph: 7,
      aob: 0,
      nob: 0,
    },
    environment: {
      roomTemperature: 22,
      tapWaterTemperature: 20,
      tapWaterPH: 7,
    },
    equipment: {
      heater: { enabled: true, isOn: false, targetTemperature: 25, wattage: 100 },
      lid: { type: 'none' as const },
      ato: { enabled: false },
      filter: { enabled: true, type: 'hob' as const },
      powerhead: { enabled: false, flowRateGPH: 200 as const },
      substrate: { type: 'gravel' as const },
      hardscape: { items: [] },
      light: { enabled: false, wattage: 10, schedule: { startHour: 8, duration: 8 } },
      co2Generator: { enabled: false, bubbleRate: 1, isOn: false, schedule: { startHour: 7, duration: 10 } },
      airPump: { enabled: false },
    },
    plants: [] as { id: string; species: 'java_fern' | 'anubias' | 'amazon_sword' | 'dwarf_hairgrass' | 'monte_carlo'; size: number }[],
    alertState: {
      waterLevelCritical: false,
      highAlgae: false,
      highAmmonia: false,
      highNitrite: false,
      highNitrate: false,
      lowOxygen: false,
      highCo2: false,
    },
  };
}

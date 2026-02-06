import { describe, it, expect } from 'vitest';
import {
  PersistedStateSchema,
  PersistedSimulationSchema,
  TunableConfigSchema,
  PersistedUISchema,
} from './schema.js';
import { PERSISTENCE_VERSION } from './types.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';

describe('PersistedUISchema', () => {
  it('validates valid UI state', () => {
    const validUI = {
      units: 'metric',
      debugPanelOpen: false,
    };
    expect(PersistedUISchema.safeParse(validUI).success).toBe(true);
  });

  it('validates imperial units', () => {
    const validUI = {
      units: 'imperial',
      debugPanelOpen: true,
    };
    expect(PersistedUISchema.safeParse(validUI).success).toBe(true);
  });

  it('rejects invalid unit system', () => {
    const invalidUI = {
      units: 'invalid',
      debugPanelOpen: false,
    };
    expect(PersistedUISchema.safeParse(invalidUI).success).toBe(false);
  });

  it('rejects extra keys (strict mode)', () => {
    const withExtra = {
      units: 'metric',
      debugPanelOpen: false,
      extraKey: 'value',
    };
    expect(PersistedUISchema.safeParse(withExtra).success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const missing = { units: 'metric' };
    expect(PersistedUISchema.safeParse(missing).success).toBe(false);
  });
});

describe('TunableConfigSchema', () => {
  it('validates DEFAULT_CONFIG', () => {
    const result = TunableConfigSchema.safeParse(DEFAULT_CONFIG);
    expect(result.success).toBe(true);
  });

  it('validates all sections have correct structure', () => {
    const result = TunableConfigSchema.safeParse(DEFAULT_CONFIG);
    if (result.success) {
      expect(result.data.decay).toBeDefined();
      expect(result.data.nitrogenCycle).toBeDefined();
      expect(result.data.gasExchange).toBeDefined();
      expect(result.data.temperature).toBeDefined();
      expect(result.data.evaporation).toBeDefined();
      expect(result.data.algae).toBeDefined();
      expect(result.data.ph).toBeDefined();
      expect(result.data.plants).toBeDefined();
    }
  });

  it('rejects missing sections', () => {
    const partial = { decay: DEFAULT_CONFIG.decay };
    expect(TunableConfigSchema.safeParse(partial).success).toBe(false);
  });

  it('rejects extra keys in sections', () => {
    const withExtra = {
      ...DEFAULT_CONFIG,
      decay: {
        ...DEFAULT_CONFIG.decay,
        unknownField: 42,
      },
    };
    expect(TunableConfigSchema.safeParse(withExtra).success).toBe(false);
  });
});

describe('PersistedSimulationSchema', () => {
  const validSimulation = {
    tick: 100,
    tank: { capacity: 40, hardscapeSlots: 4 },
    resources: {
      water: 40,
      temperature: 25,
      surface: 1000,
      flow: 100,
      light: 0,
      aeration: false,
      food: 0,
      waste: 0,
      algae: 0,
      ammonia: 0,
      nitrite: 0,
      nitrate: 0,
      phosphate: 0,
      potassium: 0,
      iron: 0,
      oxygen: 8,
      co2: 5,
      ph: 7,
      aob: 0,
      nob: 0,
    },
    environment: {
      roomTemperature: 22,
      tapWaterTemperature: 18,
      tapWaterPH: 7.0,
    },
    equipment: {
      heater: { enabled: true, isOn: false, targetTemperature: 25, wattage: 50 },
      lid: { type: 'none' },
      ato: { enabled: false },
      filter: { enabled: true, type: 'hob' },
      powerhead: { enabled: false, flowRateGPH: 240 },
      substrate: { type: 'gravel' },
      hardscape: { items: [] },
      light: { enabled: true, wattage: 10, schedule: { startHour: 8, duration: 8 } },
      co2Generator: { enabled: false, bubbleRate: 1, isOn: false, schedule: { startHour: 8, duration: 8 } },
      airPump: { enabled: false },
      autoDoser: { enabled: false, doseAmountMl: 2, schedule: { startHour: 8, duration: 1 }, dosedToday: false },
    },
    plants: [],
    fish: [],
    alertState: {
      waterLevelCritical: false,
      highAlgae: false,
      highAmmonia: false,
      highNitrite: false,
      highNitrate: false,
      lowOxygen: false,
      highCo2: false,
    },
    currentPreset: 'planted',
  };

  it('validates valid simulation state', () => {
    expect(PersistedSimulationSchema.safeParse(validSimulation).success).toBe(true);
  });

  it('validates simulation with plants', () => {
    const withPlants = {
      ...validSimulation,
      plants: [
        { id: 'plant-1', species: 'java_fern', size: 50, condition: 100 },
        { id: 'plant-2', species: 'anubias', size: 75, condition: 85 },
      ],
    };
    expect(PersistedSimulationSchema.safeParse(withPlants).success).toBe(true);
  });

  it('validates simulation with hardscape', () => {
    const withHardscape = {
      ...validSimulation,
      equipment: {
        ...validSimulation.equipment,
        hardscape: {
          items: [
            { id: 'rock-1', type: 'neutral_rock' },
            { id: 'wood-1', type: 'driftwood' },
          ],
        },
      },
    };
    expect(PersistedSimulationSchema.safeParse(withHardscape).success).toBe(true);
  });

  it('rejects invalid plant species', () => {
    const invalidPlant = {
      ...validSimulation,
      plants: [{ id: 'p1', species: 'invalid_species', size: 50, condition: 100 }],
    };
    expect(PersistedSimulationSchema.safeParse(invalidPlant).success).toBe(false);
  });

  it('rejects negative tick', () => {
    const negativeTick = { ...validSimulation, tick: -1 };
    expect(PersistedSimulationSchema.safeParse(negativeTick).success).toBe(false);
  });

  it('rejects invalid filter type', () => {
    const invalidFilter = {
      ...validSimulation,
      equipment: {
        ...validSimulation.equipment,
        filter: { enabled: true, type: 'invalid' },
      },
    };
    expect(PersistedSimulationSchema.safeParse(invalidFilter).success).toBe(false);
  });

  it('rejects schedule with invalid hours', () => {
    const invalidSchedule = {
      ...validSimulation,
      equipment: {
        ...validSimulation.equipment,
        light: { enabled: true, wattage: 10, schedule: { startHour: 25, duration: 8 } },
      },
    };
    expect(PersistedSimulationSchema.safeParse(invalidSchedule).success).toBe(false);
  });

  it('rejects invalid powerhead flow rate', () => {
    const invalidFlow = {
      ...validSimulation,
      equipment: {
        ...validSimulation.equipment,
        powerhead: { enabled: true, flowRateGPH: 500 },
      },
    };
    expect(PersistedSimulationSchema.safeParse(invalidFlow).success).toBe(false);
  });
});

describe('PersistedStateSchema', () => {
  const validSimulation = {
    tick: 0,
    tank: { capacity: 40, hardscapeSlots: 4 },
    resources: {
      water: 40,
      temperature: 25,
      surface: 1000,
      flow: 100,
      light: 0,
      aeration: false,
      food: 0,
      waste: 0,
      algae: 0,
      ammonia: 0,
      nitrite: 0,
      nitrate: 0,
      phosphate: 0,
      potassium: 0,
      iron: 0,
      oxygen: 8,
      co2: 5,
      ph: 7,
      aob: 0,
      nob: 0,
    },
    environment: {
      roomTemperature: 22,
      tapWaterTemperature: 18,
      tapWaterPH: 7.0,
    },
    equipment: {
      heater: { enabled: true, isOn: false, targetTemperature: 25, wattage: 50 },
      lid: { type: 'none' },
      ato: { enabled: false },
      filter: { enabled: true, type: 'hob' },
      powerhead: { enabled: false, flowRateGPH: 240 },
      substrate: { type: 'gravel' },
      hardscape: { items: [] },
      light: { enabled: true, wattage: 10, schedule: { startHour: 8, duration: 8 } },
      co2Generator: { enabled: false, bubbleRate: 1, isOn: false, schedule: { startHour: 8, duration: 8 } },
      airPump: { enabled: false },
      autoDoser: { enabled: false, doseAmountMl: 2, schedule: { startHour: 8, duration: 1 }, dosedToday: false },
    },
    plants: [],
    fish: [],
    alertState: {
      waterLevelCritical: false,
      highAlgae: false,
      highAmmonia: false,
      highNitrite: false,
      highNitrate: false,
      lowOxygen: false,
      highCo2: false,
    },
    currentPreset: 'planted',
  };

  const validState = {
    version: PERSISTENCE_VERSION,
    simulation: validSimulation,
    tunableConfig: DEFAULT_CONFIG,
    ui: { units: 'metric', debugPanelOpen: false },
  };

  it('validates complete valid state', () => {
    expect(PersistedStateSchema.safeParse(validState).success).toBe(true);
  });

  it('rejects mismatched version', () => {
    const wrongVersion = { ...validState, version: 999 };
    expect(PersistedStateSchema.safeParse(wrongVersion).success).toBe(false);
  });

  it('rejects missing version', () => {
    const noVersion = { ...validState };
    delete (noVersion as Record<string, unknown>).version;
    expect(PersistedStateSchema.safeParse(noVersion).success).toBe(false);
  });

  it('rejects missing simulation', () => {
    const noSimulation = { ...validState };
    delete (noSimulation as Record<string, unknown>).simulation;
    expect(PersistedStateSchema.safeParse(noSimulation).success).toBe(false);
  });

  it('rejects extra top-level keys', () => {
    const withExtra = { ...validState, extraField: 'value' };
    expect(PersistedStateSchema.safeParse(withExtra).success).toBe(false);
  });
});

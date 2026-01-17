/**
 * Aquarium preset configurations for quick setup.
 */

import type { SimulationConfig, HardscapeItem } from '../simulation/state.js';

export type PresetId = 'bare' | 'betta' | 'planted' | 'community' | 'angelfish';

export interface PresetDefinition {
  id: PresetId;
  name: string;
  description: string;
  config: SimulationConfig;
}

// Helper to create hardscape items with unique IDs
function createHardscapeItems(items: Array<{ type: HardscapeItem['type'] }>): HardscapeItem[] {
  return items.map((item, index) => ({
    id: `preset-${item.type}-${index}`,
    type: item.type,
  }));
}

export const PRESETS: PresetDefinition[] = [
  {
    id: 'bare',
    name: 'Bare Tank',
    description: 'Empty tank with no equipment',
    config: {
      tankCapacity: 40, // 10 gal default
      heater: { enabled: false },
      filter: { enabled: false },
      light: { enabled: false },
      substrate: { type: 'none' },
      hardscape: { items: [] },
      lid: { type: 'none' },
      ato: { enabled: false },
      co2Generator: { enabled: false },
      powerhead: { enabled: false },
    },
  },
  {
    id: 'betta',
    name: 'Betta Cube',
    description: '5 gal nano tank for bettas',
    config: {
      tankCapacity: 20, // 5 gal
      roomTemperature: 22,
      tapWaterTemperature: 18,
      tapWaterPH: 7.0,
      heater: {
        enabled: true,
        targetTemperature: 26,
        wattage: 50,
      },
      filter: {
        enabled: true,
        type: 'hob',
      },
      light: {
        enabled: true,
        wattage: 5,
        schedule: { startHour: 8, duration: 8 },
      },
      substrate: { type: 'gravel' },
      hardscape: {
        items: createHardscapeItems([
          { type: 'neutral_rock' },
          { type: 'driftwood' },
        ]),
      },
      lid: { type: 'mesh' },
      ato: { enabled: false },
      co2Generator: { enabled: false },
      powerhead: { enabled: false },
    },
  },
  {
    id: 'planted',
    name: 'Planted Tank',
    description: '10 gal planted aquarium with CO2',
    config: {
      tankCapacity: 40, // 10 gal
      heater: { enabled: false },
      filter: {
        enabled: true,
        type: 'canister',
      },
      light: {
        enabled: true,
        wattage: 10,
        schedule: { startHour: 8, duration: 12 },
      },
      substrate: { type: 'aqua_soil' },
      hardscape: {
        items: createHardscapeItems([
          { type: 'neutral_rock' },
          { type: 'driftwood' },
          { type: 'driftwood' },
        ]),
      },
      lid: { type: 'none' },
      ato: { enabled: true },
      co2Generator: {
        enabled: true,
        bubbleRate: 1.0,
        schedule: { startHour: 7, duration: 10 },
      },
      powerhead: { enabled: false },
    },
  },
  {
    id: 'community',
    name: 'Balanced Community',
    description: '40 gal community tank',
    config: {
      tankCapacity: 150, // 40 gal
      heater: {
        enabled: true,
        targetTemperature: 27,
        wattage: 200,
      },
      filter: {
        enabled: true,
        type: 'canister',
      },
      light: {
        enabled: true,
        wattage: 50,
        schedule: { startHour: 8, duration: 10 },
      },
      substrate: { type: 'aqua_soil' },
      hardscape: {
        items: createHardscapeItems([
          { type: 'neutral_rock' },
          { type: 'neutral_rock' },
          { type: 'neutral_rock' },
          { type: 'driftwood' },
          { type: 'driftwood' },
          { type: 'driftwood' },
          { type: 'driftwood' },
        ]),
      },
      lid: { type: 'none' },
      ato: { enabled: false },
      co2Generator: { enabled: false },
      powerhead: { enabled: false },
    },
  },
  {
    id: 'angelfish',
    name: 'Big Angelfish Tank',
    description: '75 gal angelfish display',
    config: {
      tankCapacity: 300, // 75 gal
      heater: {
        enabled: true,
        targetTemperature: 26,
        wattage: 200,
      },
      filter: {
        enabled: true,
        type: 'canister',
      },
      light: {
        enabled: true,
        wattage: 100,
        schedule: { startHour: 8, duration: 12 }, // Default duration
      },
      substrate: { type: 'sand' },
      hardscape: {
        items: createHardscapeItems([
          { type: 'neutral_rock' },
          { type: 'neutral_rock' },
          { type: 'neutral_rock' },
        ]),
      },
      lid: { type: 'none' },
      ato: { enabled: false },
      co2Generator: { enabled: false },
      powerhead: { enabled: false },
    },
  },
];

export const DEFAULT_PRESET_ID: PresetId = 'planted';

export function getPresetById(id: PresetId): PresetDefinition | undefined {
  return PRESETS.find((p) => p.id === id);
}

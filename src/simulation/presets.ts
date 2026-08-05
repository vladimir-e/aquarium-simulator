/**
 * Aquarium preset configurations for quick setup.
 */

import type { SimulationConfig, SimulationState } from './state.js';
import type { HardscapeItem } from './equipment/hardscape.js';
import { createSimulation } from './state.js';
import type { PresetSeed } from './seed.js';

export type PresetId = 'bare' | 'betta' | 'planted' | 'community' | 'angelfish';

export interface PresetDefinition {
  id: PresetId;
  name: string;
  config: SimulationConfig;
  /** State the tank starts at — a colony, a roster, a scape. */
  seed?: PresetSeed;
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
        type: 'sponge',
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
    seed: { bacteria: 'cycled' },
  },
  {
    id: 'planted',
    name: 'Planted Tank',
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
    seed: { bacteria: 'cycled' },
  },
  {
    id: 'community',
    name: 'Balanced Community',
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
    seed: { bacteria: 'cycled' },
  },
  {
    id: 'angelfish',
    name: 'Big Angelfish Tank',
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
    seed: { bacteria: 'cycled' },
  },
];

export const DEFAULT_PRESET_ID: PresetId = 'planted';

export function getPresetById(id: PresetId): PresetDefinition | undefined {
  return PRESETS.find((p) => p.id === id);
}

/**
 * The tank a preset builds: its configuration and the state it starts at.
 * The one place both halves of a preset are read together.
 */
export function createPresetSimulation(
  preset: PresetDefinition,
  rngSeed?: number
): SimulationState {
  return createSimulation(preset.config, preset.seed, rngSeed);
}

/** The one place a preset id becomes the words every surface shows for it. */
export function presetName(id: PresetId): string {
  return getPresetById(id)?.name ?? id;
}

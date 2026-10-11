import { describe, it, expect } from 'vitest';
import {
  PRESETS,
  createPresetSimulation,
  getPresetById,
  presetName,
  type PresetDefinition,
} from './presets.js';
import { cycledColony } from './seed.js';
import { DEFAULT_CONFIG, withTunable } from './config/index.js';
import { plantParams } from './flora/params.js';
import { wellFed } from './systems/reserve.js';

describe('presets', () => {
  it('resolves every shipped preset by id, and nothing else', () => {
    for (const preset of PRESETS) {
      expect(getPresetById(preset.id)).toBe(preset);
      expect(presetName(preset.id)).toBe(preset.name);
    }
    expect(PRESETS.map((p) => p.id)).toHaveLength(new Set(PRESETS.map((p) => p.id)).size);
  });

  it('builds the tank each preset describes, at tick 0', () => {
    for (const preset of PRESETS) {
      const state = createPresetSimulation(preset);

      expect(state.tick).toBe(0);
      expect(state.tank.capacity).toBe(preset.config.tankCapacity);
    }
  });

  it('stocks nothing — a preset ships a tank, not its livestock', () => {
    for (const preset of PRESETS) {
      const state = createPresetSimulation(preset);

      expect(state.fish).toEqual([]);
      expect(state.plants).toEqual([]);
    }
  });

  it('opens the established tanks on a working biofilter, and the bare one on none', () => {
    for (const id of ['betta', 'planted', 'community', 'angelfish'] as const) {
      const state = createPresetSimulation(getPresetById(id)!);
      const cycled = cycledColony(state);

      expect(state.resources.aob).toBe(cycled.aob);
      expect(state.resources.nob).toBe(cycled.nob);
    }

    const bare = createPresetSimulation(getPresetById('bare')!);
    expect(bare.resources.aob).toBe(0);
    expect(bare.resources.nob).toBe(0);
  });

  const seeded: PresetDefinition = {
    id: 'community',
    name: 'Seeded',
    config: { tankCapacity: 150 },
    seed: { bacteria: { aob: 1500, nob: 900 }, fish: [{ species: 'guppy', count: 4, sex: 'female' }] },
  };

  it('honours a seed when the preset carries one', () => {
    const state = createPresetSimulation(seeded);

    expect(state.resources.aob).toBe(1500);
    expect(state.fish).toHaveLength(4);
    expect(state.fish.every((f) => f.sex === 'female')).toBe(true);
  });

  it('stocks its seeded plants on the plants config it will run on, and reads its first day through that config’s optics', () => {
    const planted: PresetDefinition = { ...seeded, seed: { plants: [{ species: 'java_fern', count: 1 }] } };
    const tuned = withTunable(withTunable(DEFAULT_CONFIG, 'plants.reserveCapacity', 0.4), 'optics.waterAttenuationPerCm', 0.04);
    const [plant] = createPresetSimulation(planted, tuned, 1).plants;
    const [stock] = createPresetSimulation(planted, DEFAULT_CONFIG, 1).plants;

    expect(wellFed(plant.budget, plantParams('java_fern', tuned.plants))).toBe(1);
    expect(plant.budget.reserve).toBeCloseTo(2 * stock.budget.reserve, 12);
    expect(createPresetSimulation(planted, tuned, 1).resources.lightByHour).not.toEqual(
      createPresetSimulation(planted, DEFAULT_CONFIG, 1).resources.lightByHour
    );
  });

  it('opens the tank on the stream its caller names, or on one of its own', () => {
    const named = createPresetSimulation(seeded, DEFAULT_CONFIG, 2026);

    expect(named).toEqual(createPresetSimulation(seeded, DEFAULT_CONFIG, 2026));
    expect(named).not.toEqual(createPresetSimulation(seeded, DEFAULT_CONFIG, 9001));
    expect(createPresetSimulation(seeded).fish).not.toEqual(createPresetSimulation(seeded).fish);
  });
});

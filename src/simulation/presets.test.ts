import { describe, it, expect } from 'vitest';
import {
  PRESETS,
  createPresetSimulation,
  getPresetById,
  presetName,
  type PresetDefinition,
} from './presets.js';
import { cycledColony } from './seed.js';

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
      const cycled = cycledColony(state.tank.capacity);

      expect(state.resources.aob).toBe(cycled.aob);
      expect(state.resources.nob).toBe(cycled.nob);
    }

    const bare = createPresetSimulation(getPresetById('bare')!);
    expect(bare.resources.aob).toBe(0);
    expect(bare.resources.nob).toBe(0);
  });

  it('opens the tank on the stream its caller names, or on one of its own', () => {
    const preset: PresetDefinition = {
      id: 'community',
      name: 'Stocked',
      config: { tankCapacity: 150 },
      seed: { fish: [{ species: 'guppy', count: 3 }] },
    };

    expect(createPresetSimulation(preset, 2026)).toEqual(createPresetSimulation(preset, 2026));
    expect(createPresetSimulation(preset, 2026)).not.toEqual(createPresetSimulation(preset, 9001));
    expect(createPresetSimulation(preset).fish).not.toEqual(createPresetSimulation(preset).fish);
  });

  it('honours a seed when the preset carries one', () => {
    const seeded = createPresetSimulation({
      id: 'community',
      name: 'Seeded',
      config: { tankCapacity: 150 },
      seed: { bacteria: cycledColony(150), fish: [{ species: 'guppy', count: 4, sex: 'female' }] },
    });

    expect(seeded.resources.aob).toBe(cycledColony(150).aob);
    expect(seeded.fish).toHaveLength(4);
    expect(seeded.fish.every((f) => f.sex === 'female')).toBe(true);
  });
});

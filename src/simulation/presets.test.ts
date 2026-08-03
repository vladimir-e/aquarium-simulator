import { describe, it, expect } from 'vitest';
import { PRESETS, createPresetSimulation, getPresetById, presetName } from './presets.js';
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

  it('builds an empty tank for a preset that ships no seed', () => {
    for (const preset of PRESETS) {
      const state = createPresetSimulation(preset);

      expect(state.fish).toEqual([]);
      expect(state.plants).toEqual([]);
      expect(state.resources.aob).toBe(0);
    }
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

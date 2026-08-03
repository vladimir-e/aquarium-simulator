import { describe, it, expect } from 'vitest';

import { resolvePreset } from '../sim.js';
import { createPresetSimulation, getPresetById } from '../../simulation/presets.js';

describe('resolvePreset', () => {
  it('opens a preset on the biofilter it ships, and --no-seed opens it uncycled', () => {
    const cycled = createPresetSimulation(resolvePreset('planted', { seeded: true }));
    const fresh = createPresetSimulation(resolvePreset('planted', { seeded: false }));

    expect(getPresetById('planted')?.seed).toBeDefined();
    expect(cycled.resources.aob).toBeGreaterThan(0);
    expect(fresh.resources.aob).toBe(0);
    expect(fresh.equipment).toEqual(cycled.equipment);
  });

  it('resizes the tank the seed then sizes itself against', () => {
    const preset = resolvePreset('planted', { capacity: 200, seeded: true });
    const built = createPresetSimulation(preset);
    const shipped = createPresetSimulation(resolvePreset('planted', { seeded: true }));

    expect(built.tank.capacity).toBe(200);
    expect(built.resources.aob / 200).toBeCloseTo(
      shipped.resources.aob / shipped.tank.capacity
    );
  });

  it('leaves the shipped preset untouched', () => {
    resolvePreset('planted', { capacity: 200, seeded: false });
    const planted = getPresetById('planted');

    expect(planted?.seed).toBeDefined();
    expect(planted?.config.tankCapacity).toBe(40);
  });

  it('names the presets it knows when asked for one it does not', () => {
    expect(() => resolvePreset('reef' as never, { seeded: true })).toThrow(/Known: bare, betta/);
  });
});

import { describe, it, expect } from 'vitest';
import { createPlant, DEFAULT_PLANT_SIZE } from './create-plant.js';
import { createRng } from '../core/rng.js';

describe('createPlant', () => {
  it('builds a plant at full condition with an empty bank', () => {
    const plant = createPlant({ species: 'anubias', size: 140, rng: createRng(1) });

    expect(plant.species).toBe('anubias');
    expect(plant.size).toBe(140);
    expect(plant.condition).toBe(100);
    expect(plant.surplus).toBe(0);
  });

  it('falls back to the default size', () => {
    expect(createPlant({ species: 'java_fern', rng: createRng(1) }).size).toBe(DEFAULT_PLANT_SIZE);
  });

  it('names every plant off the stream, never twice the same', () => {
    const rng = createRng(1);
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(createPlant({ species: 'anubias', rng }).id);
    expect(ids.size).toBe(1000);
  });

  it('gives two tanks on one seed the same plant', () => {
    const first = createPlant({ species: 'anubias', rng: createRng(7) });
    const second = createPlant({ species: 'anubias', rng: createRng(7) });

    expect(first).toEqual(second);
  });
});

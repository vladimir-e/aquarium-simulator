import { describe, it, expect } from 'vitest';
import { createPlant, generatePlantId, DEFAULT_PLANT_SIZE } from './create-plant.js';

describe('createPlant', () => {
  it('builds a plant at full condition with an empty bank', () => {
    const plant = createPlant({ species: 'anubias', size: 140 });

    expect(plant.species).toBe('anubias');
    expect(plant.size).toBe(140);
    expect(plant.condition).toBe(100);
    expect(plant.surplus).toBe(0);
  });

  it('falls back to the default size', () => {
    expect(createPlant({ species: 'java_fern' }).size).toBe(DEFAULT_PLANT_SIZE);
  });

  it('generates unique ids', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(generatePlantId());
    expect(ids.size).toBe(1000);
  });
});

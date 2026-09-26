import { describe, it, expect } from 'vitest';
import { createOffshoot, createPlant, DEFAULT_PLANT_SIZE, VIGOUR_SPAN } from './create-plant.js';
import { createRng } from '../core/rng.js';

describe('createPlant', () => {
  it('builds a plant at full condition with an empty bank, as a fish arrives', () => {
    const plant = createPlant({ species: 'anubias', size: 80, rng: createRng(1) });

    expect(plant.species).toBe('anubias');
    expect(plant.size).toBe(80);
    expect(plant.condition).toBe(100);
    expect(plant.surplus).toBe(0);
  });

  it('falls back to the default size', () => {
    const plant = createPlant({ species: 'java_fern', rng: createRng(1) });

    expect(plant.size).toBe(DEFAULT_PLANT_SIZE);
  });

  it('names every plant off the stream, never twice the same', () => {
    const rng = createRng(1);
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(createPlant({ species: 'anubias', rng }).id);
    }

    expect(ids.size).toBe(1000);
  });

  it('founds its own family, with no parent, at the age it is given', () => {
    const plant = createPlant({ species: 'amazon_sword', rng: createRng(1) });
    expect(plant.parentId).toBeNull();
    expect(plant.familyId).toBe(plant.id);
    expect(plant.age).toBe(0);
    expect(createPlant({ species: 'amazon_sword', age: 720, rng: createRng(1) }).age).toBe(720);
  });

  it('draws every vigour inside the span, and spreads them across it', () => {
    const rng = createRng(3);
    const vigours = Array.from({ length: 1000 }, () => createPlant({ species: 'monte_carlo', rng }).vigour);
    expect(Math.min(...vigours)).toBeGreaterThanOrEqual(-VIGOUR_SPAN);
    expect(Math.max(...vigours)).toBeLessThan(VIGOUR_SPAN);
    expect(Math.min(...vigours)).toBeLessThan(-0.9 * VIGOUR_SPAN);
    expect(Math.max(...vigours)).toBeGreaterThan(0.9 * VIGOUR_SPAN);
  });

  it('gives two tanks on one seed the same plant', () => {
    const born = (): ReturnType<typeof createPlant> =>
      createPlant({ species: 'anubias', rng: createRng(7) });

    expect(born()).toEqual(born());
  });
});

describe('createOffshoot', () => {
  const rng = createRng(5);
  const founder = createPlant({ species: 'amazon_sword', size: 90, age: 1000, rng });
  const parent = { ...founder, condition: 100, surplus: 0 };
  const child = createOffshoot(parent, 20, rng);
  const grandchild = createOffshoot(child, 20, rng);

  it('is a new unit of its parent\'s species at the size its bank bought, full on an empty bank', () => {
    expect(child.id).not.toBe(parent.id);
    expect(child.species).toBe(parent.species);
    expect(child.size).toBe(20);
    expect(child.condition).toBe(100);
    expect(child.surplus).toBe(0);
    expect(child.age).toBe(0);
  });

  it('names its parent and joins the founder\'s family, down the line', () => {
    expect(child.parentId).toBe(founder.id);
    expect(child.familyId).toBe(founder.id);
    expect(grandchild.parentId).toBe(child.id);
    expect(grandchild.familyId).toBe(founder.id);
  });

  it('draws a vigour of its own inside the span', () => {
    expect(child.vigour).not.toBe(parent.vigour);
    expect(Math.abs(child.vigour)).toBeLessThanOrEqual(VIGOUR_SPAN);
  });
});

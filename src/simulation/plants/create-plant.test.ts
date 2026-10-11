import { describe, it, expect } from 'vitest';
import {
  createOffshoot,
  createPlant,
  DEFAULT_PLANT_SIZE,
  isPlantableSize,
  offshootShare,
  offshootStructure,
  VIGOUR_SPAN,
} from './create-plant.js';
import { createRng } from '../core/rng.js';
import { plantsDefaults as plantsConfig } from '../config/plants.js';
import { NUTRIENTS } from '../config/nutrients.js';
import { plantParams } from '../flora/params.js';
import { storeFill } from '../systems/flora-budget.js';
import { wellFed } from '../systems/reserve.js';
import { sizeOf, tissueMass } from './canopy.js';
import { growthFormOf, PLANT_SPECIES_DATA, type PlantSpecies } from './species.js';
import { withBudget } from '../tests/plant.js';

describe('createPlant', () => {
  it('builds a plant at full condition, fed and stocked as a shop sells it', () => {
    const plant = createPlant({ species: 'anubias', size: 80, rng: createRng(1), plantsConfig });
    const p = plantParams('anubias', plantsConfig);

    expect(plant.species).toBe('anubias');
    expect(sizeOf(plant)).toBeCloseTo(80, 12);
    expect(plant.condition).toBe(100);
    expect(wellFed(plant.budget, p)).toBeCloseTo(1, 12);
    for (const n of NUTRIENTS) expect(storeFill(plant.budget, p)[n]).toBeCloseTo(1, 12);
    expect(plant.budget.offshootBuffer).toBe(0);
  });

  it('falls back to the default size', () => {
    const plant = createPlant({ species: 'java_fern', rng: createRng(1), plantsConfig });

    expect(sizeOf(plant)).toBeCloseTo(DEFAULT_PLANT_SIZE, 12);
  });

  it('names every plant off the stream, never twice the same', () => {
    const rng = createRng(1);
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(createPlant({ species: 'anubias', rng, plantsConfig }).id);
    }

    expect(ids.size).toBe(1000);
  });

  it('founds its own family, with no parent, at the age it is given', () => {
    const plant = createPlant({ species: 'amazon_sword', rng: createRng(1), plantsConfig });
    expect(plant.parentId).toBeNull();
    expect(plant.familyId).toBe(plant.id);
    expect(plant.age).toBe(0);
    expect(createPlant({ species: 'amazon_sword', age: 720, rng: createRng(1), plantsConfig }).age).toBe(720);
  });

  it('draws every vigour inside the span, and spreads them across it', () => {
    const rng = createRng(3);
    const vigours = Array.from({ length: 1000 }, () => createPlant({ species: 'monte_carlo', rng, plantsConfig }).vigour);
    expect(Math.min(...vigours)).toBeGreaterThanOrEqual(-VIGOUR_SPAN);
    expect(Math.max(...vigours)).toBeLessThan(VIGOUR_SPAN);
    expect(Math.min(...vigours)).toBeLessThan(-0.9 * VIGOUR_SPAN);
    expect(Math.max(...vigours)).toBeGreaterThan(0.9 * VIGOUR_SPAN);
  });

  it('gives two tanks on one seed the same plant', () => {
    const born = (): ReturnType<typeof createPlant> =>
      createPlant({ species: 'anubias', rng: createRng(7), plantsConfig });

    expect(born()).toEqual(born());
  });
});

describe('createOffshoot', () => {
  const rng = createRng(5);
  const founder = createPlant({ species: 'amazon_sword', size: 90, age: 1000, rng, plantsConfig });
  const budget = { structure: 0.1, reserve: 0.02, offshootBuffer: 0, stores: founder.budget.stores };
  const child = createOffshoot(founder, budget, rng);
  const grandchild = createOffshoot(child, budget, rng);

  it('is a new unit of its parent\'s species on the budget its buffer bought, at full condition', () => {
    expect(child.id).not.toBe(founder.id);
    expect(child.species).toBe(founder.species);
    expect(child.budget).toBe(budget);
    expect(child.condition).toBe(100);
    expect(child.age).toBe(0);
  });

  it('names its parent and joins the founder\'s family, down the line', () => {
    expect(child.parentId).toBe(founder.id);
    expect(child.familyId).toBe(founder.id);
    expect(grandchild.parentId).toBe(child.id);
    expect(grandchild.familyId).toBe(founder.id);
  });

  it('draws a vigour of its own inside the span', () => {
    expect(child.vigour).not.toBe(founder.vigour);
    expect(Math.abs(child.vigour)).toBeLessThanOrEqual(VIGOUR_SPAN);
  });
});

describe('offshoots as the buffer buys them', () => {
  it('are born at their growth form’s offshoot size, never under the least a plant is planted at', () => {
    for (const species of Object.keys(PLANT_SPECIES_DATA) as PlantSpecies[]) {
      const { offshootSize } = growthFormOf(species);
      expect(offshootStructure(species)).toBeCloseTo(tissueMass(species, offshootSize), 15);
      expect(isPlantableSize(offshootSize)).toBe(true);
    }
  });

  it('read the buffer as a share of the next one, full once it holds it', () => {
    const plant = createPlant({ species: 'java_fern', size: 60, rng: createRng(2), plantsConfig });
    const unit = offshootStructure('java_fern');
    const holding = (buffer: number): number => offshootShare(withBudget(plant, { offshootBuffer: buffer }));
    expect(holding(0)).toBe(0);
    expect(holding(unit / 4)).toBeCloseTo(0.25, 12);
    expect(holding(2 * unit)).toBe(1);
  });
});

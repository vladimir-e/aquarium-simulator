import { describe, it, expect } from 'vitest';
import { createPlant, DEFAULT_PLANT_SIZE, establishmentSurplus } from './create-plant.js';
import { plantsDefaults, type PlantsConfig } from '../config/plants.js';
import { createRng } from '../core/rng.js';
import { createSimulation, type Plant } from '../state.js';
import { computePlantVitality } from '../systems/plant-vitality.js';

const RESOURCES = createSimulation({ tankCapacity: 40 }).resources;

/**
 * Banked units a plant's own upkeep has already spoken for, read off the
 * engine's arithmetic rather than restated here — the species' hardiness and
 * the tank's temperature are both in it, and a copy would forget them.
 */
const reserveOwed = (plant: Plant, plantsConfig: PlantsConfig): number =>
  computePlantVitality({
    plant,
    resources: RESOURCES,
    waterVolume: RESOURCES.water,
    plantsConfig,
    nutrientSufficiency: 1,
    algaeMass: 0,
  }).breakdown.reserved;

describe('createPlant', () => {
  it('builds a plant at full condition with the reserve it arrives on', () => {
    const plant = createPlant({
      species: 'anubias',
      size: 140,
      plantsConfig: plantsDefaults,
      rng: createRng(1),
    });

    expect(plant.species).toBe('anubias');
    expect(plant.size).toBe(140);
    expect(plant.condition).toBe(100);
    expect(plant.surplus).toBe(establishmentSurplus(plantsDefaults));
  });

  it('arrives provisioned at the cap the tank was tuned to', () => {
    // `surplusCap` is a live slider, and half the shipped bank is not half this
    // tank's: at a cap of 20 a plant reading defaults is born over it.
    for (const surplusCap of [20, 80]) {
      const plantsConfig = { ...plantsDefaults, surplusCap };
      const plant = createPlant({ species: 'anubias', plantsConfig, rng: createRng(1) });

      expect(plant.surplus).toBe(surplusCap / 2);
      expect(plant.surplus).toBeGreaterThan(reserveOwed(plant, plantsConfig));
    }
  });

  it('falls back to the default size', () => {
    const plant = createPlant({
      species: 'java_fern',
      plantsConfig: plantsDefaults,
      rng: createRng(1),
    });

    expect(plant.size).toBe(DEFAULT_PLANT_SIZE);
  });

  it('names every plant off the stream, never twice the same', () => {
    const rng = createRng(1);
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(createPlant({ species: 'anubias', plantsConfig: plantsDefaults, rng }).id);
    }

    expect(ids.size).toBe(1000);
  });

  it('gives two tanks on one seed the same plant', () => {
    const born = (): ReturnType<typeof createPlant> =>
      createPlant({ species: 'anubias', plantsConfig: plantsDefaults, rng: createRng(7) });

    expect(born()).toEqual(born());
  });
});

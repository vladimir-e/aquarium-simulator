import { describe, it, expect } from 'vitest';
import { createPlant, DEFAULT_PLANT_SIZE, establishmentSurplus } from './create-plant.js';
import { plantsDefaults } from '../config/plants.js';
import { createRng } from '../core/rng.js';

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
    // `surplusCap` is a live slider, and half the shipped bank is not half
    // this tank's: at a cap of 20 a plant reading defaults is born over it,
    // and at a low enough one it is born short of the reserve it owes its own
    // upkeep — with nothing spare to meet a bad night on.
    const reserve = plantsDefaults.maintenanceCost * plantsDefaults.upkeepReserveHours;

    for (const surplusCap of [20, 80]) {
      const plant = createPlant({
        species: 'anubias',
        plantsConfig: { ...plantsDefaults, surplusCap },
        rng: createRng(1),
      });

      expect(plant.surplus).toBe(surplusCap / 2);
      expect(plant.surplus).toBeLessThanOrEqual(surplusCap);
      expect(plant.surplus).toBeGreaterThan(reserve);
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

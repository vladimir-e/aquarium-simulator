/**
 * The reserve a plant runs on, read at the tank.
 *
 * A thriving plant has to end a run holding photosynthate it didn't spend on
 * height — the buffer that carries it through a dark spell and, later, the
 * energy propagation runs on. A plant at its species ceiling has nowhere to put
 * that income but the bank, so it fills rather than burns. And neither claim is
 * worth anything if the planting stopped growing to pay for them.
 */

import { describe, it, expect } from 'vitest';
import type { SimulationConfig, SimulationState } from '../state.js';
import type { PresetSeed } from '../seed.js';
import { plantsDefaults } from '../config/plants.js';
import { getSpeciesMaxSize } from '../systems/plant-growth.js';
import { runTank, totalSize } from './metrics.js';

/** A dosed, lit, cycled 150 L — the water a plant has no excuse in. */
const TANK: SimulationConfig = {
  tankCapacity: 150,
  heater: { enabled: true, targetTemperature: 25, wattage: 150 },
  filter: { enabled: true, type: 'canister' },
  substrate: { type: 'aqua_soil' },
  light: { enabled: true, par: 90, schedule: { startHour: 8, duration: 12 } },
  co2Generator: { enabled: true, bubbleRate: 2, schedule: { startHour: 8, duration: 10 } },
  autoDoser: { enabled: true, doseAmountMl: 3, schedule: { startHour: 8, duration: 1 } },
  ato: { enabled: true },
};

const GROWING: PresetSeed = {
  bacteria: 'cycled',
  plants: [
    { species: 'java_fern', count: 2, size: 35 },
    { species: 'anubias', count: 1, size: 35 },
    { species: 'amazon_sword', count: 1, size: 35 },
  ],
};

const MAXED: PresetSeed = {
  bacteria: 'cycled',
  plants: [
    { species: 'java_fern', count: 2, size: getSpeciesMaxSize('java_fern') },
    { species: 'anubias', count: 1, size: getSpeciesMaxSize('anubias') },
  ],
};

const meanBank = (state: SimulationState): number =>
  state.plants.reduce((sum, plant) => sum + plant.surplus, 0) / state.plants.length;

const grow = (seed: PresetSeed, days: number): ReturnType<typeof runTank> =>
  runTank({ setup: TANK, seed, days, sampleEvery: 24, sampleHour: 0 });

describe('the bank a plant runs on', () => {
  it('fills on a thriving planting, and keeps filling', () => {
    const { final, samples } = grow(GROWING, 30);

    expect(final.plants).toHaveLength(4);
    for (const plant of final.plants) {
      expect(plant.condition).toBe(100);
      expect(plant.surplus).toBeGreaterThan(0);
    }

    const [start, early] = [samples[0]!, samples[6]!];
    expect(start.totalSize).toBeLessThan(early.totalSize);
    expect(meanBank(final)).toBeGreaterThan(0);
  });

  it('still grows the planting while it banks', () => {
    const { final, samples } = grow(GROWING, 30);
    expect(totalSize(final)).toBeGreaterThan(samples[0]!.totalSize * 1.5);
  });

  it('saturates a plant that has nowhere left to grow', () => {
    const brief = grow(MAXED, 5);
    const settled = grow(MAXED, 40);

    expect(meanBank(brief.final)).toBeGreaterThan(0);
    expect(meanBank(settled.final)).toBeGreaterThan(meanBank(brief.final));
    expect(meanBank(settled.final)).toBeCloseTo(plantsDefaults.surplusCap, 5);
  });

  it('holds a maxed plant at its ceiling rather than shrinking it', () => {
    const { final } = grow(MAXED, 20);
    for (const plant of final.plants) {
      expect(plant.size).toBe(getSpeciesMaxSize(plant.species));
    }
  });

  it('banks faster the less of its income a plant can spend on height', () => {
    const days = 20;
    expect(meanBank(grow(MAXED, days).final)).toBeGreaterThan(
      meanBank(grow(GROWING, days).final)
    );
  });
});

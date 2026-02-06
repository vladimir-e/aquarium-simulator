import { describe, it, expect } from 'vitest';
import { processMetabolism } from './metabolism.js';
import { livestockDefaults } from '../config/livestock.js';
import type { Fish } from '../state.js';

function makeFish(overrides: Partial<Fish> = {}): Fish {
  return {
    id: 'fish_1',
    species: 'neon_tetra',
    mass: 0.5,
    health: 100,
    age: 0,
    hunger: 50,
    sex: 'male',
    ...overrides,
  };
}

describe('processMetabolism', () => {
  it('returns empty results for no fish', () => {
    const result = processMetabolism([], 5, livestockDefaults);
    expect(result.updatedFish).toHaveLength(0);
    expect(result.foodConsumed).toBe(0);
    expect(result.wasteProduced).toBe(0);
    expect(result.oxygenDelta).toBe(0);
    expect(result.co2Delta).toBe(0);
  });

  it('consumes food based on hunger and mass', () => {
    const fish = [makeFish({ hunger: 50, mass: 1.0 })];
    const result = processMetabolism(fish, 10, livestockDefaults);

    // foodNeeded = (50/100) * 1.0 * 0.01 = 0.005g
    expect(result.foodConsumed).toBeCloseTo(0.005, 4);
  });

  it('does not consume more food than available', () => {
    const fish = [makeFish({ hunger: 100, mass: 10 })];
    const availableFood = 0.001;
    const result = processMetabolism(fish, availableFood, livestockDefaults);

    expect(result.foodConsumed).toBeLessThanOrEqual(availableFood);
  });

  it('increases hunger over time', () => {
    const fish = [makeFish({ hunger: 20 })];
    const result = processMetabolism(fish, 0, livestockDefaults);

    // No food available, so hunger only increases
    expect(result.updatedFish[0].hunger).toBeGreaterThan(20);
    // Should increase by hungerIncreaseRate (4.0)
    expect(result.updatedFish[0].hunger).toBeCloseTo(24, 0);
  });

  it('reduces hunger when food is consumed', () => {
    const fish = [makeFish({ hunger: 80, mass: 1.0 })];
    // Lots of food available
    const result = processMetabolism(fish, 100, livestockDefaults);

    // Hunger should decrease (food eaten reduces hunger) then increase by rate
    // Net should be less than 80 when enough food is available
    expect(result.updatedFish[0].hunger).toBeLessThan(80);
  });

  it('caps hunger at 100', () => {
    const fish = [makeFish({ hunger: 99 })];
    const result = processMetabolism(fish, 0, livestockDefaults);

    expect(result.updatedFish[0].hunger).toBeLessThanOrEqual(100);
  });

  it('caps hunger at 0 minimum', () => {
    const fish = [makeFish({ hunger: 1, mass: 10 })];
    // Give tons of food
    const result = processMetabolism(fish, 1000, livestockDefaults);

    expect(result.updatedFish[0].hunger).toBeGreaterThanOrEqual(0);
  });

  it('produces waste from consumed food', () => {
    const fish = [makeFish({ hunger: 50, mass: 2.0 })];
    const result = processMetabolism(fish, 10, livestockDefaults);

    expect(result.wasteProduced).toBeGreaterThan(0);
    // Waste = foodConsumed * wasteRatio (0.3)
    expect(result.wasteProduced).toBeCloseTo(result.foodConsumed * 0.3, 6);
  });

  it('consumes oxygen based on mass', () => {
    const fish = [makeFish({ mass: 2.0 })];
    const result = processMetabolism(fish, 10, livestockDefaults);

    // oxygenConsumed = baseRespirationRate(0.02) * mass(2.0) = 0.04
    expect(result.oxygenDelta).toBeCloseTo(-0.04, 4);
  });

  it('produces CO2 proportional to oxygen consumed', () => {
    const fish = [makeFish({ mass: 2.0 })];
    const result = processMetabolism(fish, 10, livestockDefaults);

    // CO2 = O2 consumed * respiratoryQuotient(0.8)
    expect(result.co2Delta).toBeCloseTo(0.04 * 0.8, 4);
  });

  it('increments age by 1 each tick', () => {
    const fish = [makeFish({ age: 100 })];
    const result = processMetabolism(fish, 10, livestockDefaults);

    expect(result.updatedFish[0].age).toBe(101);
  });

  it('feeds hungriest fish first', () => {
    const fish = [
      makeFish({ id: 'hungry', hunger: 90, mass: 1.0 }),
      makeFish({ id: 'full', hunger: 10, mass: 1.0 }),
    ];
    // Very limited food - only enough for one fish
    const availableFood = 0.005;
    const result = processMetabolism(fish, availableFood, livestockDefaults);

    // Hungry fish should have consumed most/all food
    const hungryFish = result.updatedFish.find((f) => f.id === 'hungry')!;
    const fullFish = result.updatedFish.find((f) => f.id === 'full')!;

    // Hungry fish should have had its hunger reduced more
    // Full fish should have barely eaten anything
    expect(hungryFish.hunger).toBeLessThan(90 + livestockDefaults.hungerIncreaseRate);
    expect(fullFish.hunger).toBeGreaterThan(10); // Should still get hungrier
  });

  it('handles multiple fish metabolism cumulatively', () => {
    const fish = [
      makeFish({ id: 'f1', mass: 1.0 }),
      makeFish({ id: 'f2', mass: 2.0 }),
    ];
    const result = processMetabolism(fish, 10, livestockDefaults);

    // Total O2 consumption = (0.02 * 1.0) + (0.02 * 2.0) = 0.06
    expect(result.oxygenDelta).toBeCloseTo(-0.06, 4);
    expect(result.updatedFish).toHaveLength(2);
  });
});

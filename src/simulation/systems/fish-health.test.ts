import { describe, it, expect } from 'vitest';
import { calculateStress, processHealth } from './fish-health.js';
import { livestockDefaults } from '../config/livestock.js';
import type { Fish, Resources } from '../state.js';

function makeFish(overrides: Partial<Fish> = {}): Fish {
  return {
    id: 'fish_1',
    species: 'neon_tetra',
    mass: 0.5,
    health: 100,
    age: 0,
    hunger: 20,
    sex: 'male',
    ...overrides,
  };
}

function makeResources(overrides: Partial<Resources> = {}): Resources {
  return {
    water: 100,
    temperature: 25,
    surface: 1000,
    flow: 100,
    light: 0,
    aeration: true,
    food: 1,
    waste: 0,
    algae: 0,
    ammonia: 0,
    nitrite: 0,
    nitrate: 0,
    phosphate: 0,
    potassium: 0,
    iron: 0,
    oxygen: 8.0,
    co2: 4.0,
    ph: 7.0,
    aob: 0,
    nob: 0,
    ...overrides,
  };
}

describe('calculateStress', () => {
  it('returns 0 stress in ideal conditions', () => {
    const fish = makeFish();
    const resources = makeResources();
    const stress = calculateStress(fish, resources, 100, 100, livestockDefaults);
    expect(stress).toBe(0);
  });

  it('applies temperature stress below safe range', () => {
    const fish = makeFish({ species: 'neon_tetra' }); // range: 22-28°C
    const resources = makeResources({ temperature: 18 });
    const stress = calculateStress(fish, resources, 100, 100, livestockDefaults);

    // deviation = 22 - 18 = 4°C, hardiness = 0.5, factor = 0.5
    // stress = 2.0 * 4 * 0.5 = 4
    expect(stress).toBeCloseTo(4, 1);
  });

  it('applies temperature stress above safe range', () => {
    const fish = makeFish({ species: 'neon_tetra' }); // range: 22-28°C
    const resources = makeResources({ temperature: 32 });
    const stress = calculateStress(fish, resources, 100, 100, livestockDefaults);

    // deviation = 32 - 28 = 4°C
    expect(stress).toBeGreaterThan(0);
  });

  it('applies pH stress outside safe range', () => {
    const fish = makeFish({ species: 'neon_tetra' }); // pH: 6.0-7.5
    const resources = makeResources({ ph: 8.5 });
    const stress = calculateStress(fish, resources, 100, 100, livestockDefaults);

    // deviation = 8.5 - 7.5 = 1.0, severity = 3.0, hardiness factor = 0.5
    expect(stress).toBeCloseTo(1.5, 1);
  });

  it('applies ammonia stress', () => {
    const fish = makeFish();
    // 5mg ammonia in 100L water = 0.05 ppm
    const resources = makeResources({ ammonia: 5 });
    const stress = calculateStress(fish, resources, 100, 100, livestockDefaults);

    // ammoniaPpm = 5/100 = 0.05, severity = 50, factor = 0.5
    // stress = 50 * 0.05 * 0.5 = 1.25
    expect(stress).toBeCloseTo(1.25, 1);
  });

  it('applies nitrite stress', () => {
    const fish = makeFish();
    const resources = makeResources({ nitrite: 100 }); // 1 ppm in 100L
    const stress = calculateStress(fish, resources, 100, 100, livestockDefaults);

    expect(stress).toBeGreaterThan(0);
  });

  it('applies nitrate stress only above 40 ppm', () => {
    const fish = makeFish();
    // 30 ppm = 3000mg in 100L - should have no stress
    const resources30 = makeResources({ nitrate: 3000 });
    const stress30 = calculateStress(fish, resources30, 100, 100, livestockDefaults);
    expect(stress30).toBe(0);

    // 60 ppm = 6000mg in 100L - should have stress from 20 ppm over
    const resources60 = makeResources({ nitrate: 6000 });
    const stress60 = calculateStress(fish, resources60, 100, 100, livestockDefaults);
    expect(stress60).toBeGreaterThan(0);
  });

  it('applies hunger stress above 50%', () => {
    const fish = makeFish({ hunger: 80 });
    const resources = makeResources();
    const stress = calculateStress(fish, resources, 100, 100, livestockDefaults);

    // (80 - 50) * 0.1 * 0.5 = 1.5
    expect(stress).toBeCloseTo(1.5, 1);
  });

  it('does not apply hunger stress at 50% or below', () => {
    const fish = makeFish({ hunger: 40 });
    const resources = makeResources();
    const stress = calculateStress(fish, resources, 100, 100, livestockDefaults);
    expect(stress).toBe(0);
  });

  it('applies oxygen stress below 5 mg/L', () => {
    const fish = makeFish();
    const resources = makeResources({ oxygen: 3 });
    const stress = calculateStress(fish, resources, 100, 100, livestockDefaults);

    // (5-3) * 3.0 * 0.5 = 3.0
    expect(stress).toBeCloseTo(3.0, 1);
  });

  it('applies water level stress below 50%', () => {
    const fish = makeFish();
    const resources = makeResources({ water: 30 }); // 30% of 100L capacity
    const stress = calculateStress(fish, resources, 30, 100, livestockDefaults);

    // waterPercent = 30%, deviation = 50 - 30 = 20
    // 20 * 0.2 * 0.5 = 2.0
    expect(stress).toBeCloseTo(2.0, 1);
  });

  it('applies flow stress above species max', () => {
    // Betta has maxFlow=150
    const fish = makeFish({ species: 'betta' });
    const resources = makeResources({ flow: 400 });
    const stress = calculateStress(fish, resources, 100, 100, livestockDefaults);

    // deviation = 400-150=250, severity=0.01, hardiness factor = 1-0.6=0.4
    // stress = 0.01 * 250 * 0.4 = 1.0
    expect(stress).toBeCloseTo(1.0, 1);
  });

  it('does not apply flow stress within species tolerance', () => {
    const fish = makeFish({ species: 'corydoras' }); // maxFlow=500
    const resources = makeResources({ flow: 300 });
    const stress = calculateStress(fish, resources, 100, 100, livestockDefaults);
    expect(stress).toBe(0);
  });

  it('applies max stress for toxins when water volume is 0', () => {
    const fish = makeFish();
    const resources = makeResources({ ammonia: 1 });
    const stressNoWater = calculateStress(fish, resources, 0, 100, livestockDefaults);

    // With 0 water, ammonia should be 100 ppm (lethal)
    expect(stressNoWater).toBeGreaterThan(0);

    // Should be much higher than with 100L water (which gives 0.01 ppm)
    const stressWithWater = calculateStress(fish, resources, 100, 100, livestockDefaults);
    expect(stressNoWater).toBeGreaterThan(stressWithWater);
  });

  it('no toxin stress at zero volume when no toxins present', () => {
    const fish = makeFish();
    const resources = makeResources({ ammonia: 0, nitrite: 0, nitrate: 0 });
    const stress = calculateStress(fish, resources, 0, 100, livestockDefaults);
    // Only water level stress expected (0% water)
    expect(stress).toBeGreaterThan(0); // from water level
  });

  it('reduces stress for hardy fish', () => {
    // Guppy (hardiness 0.8) vs Angelfish (hardiness 0.4)
    const guppy = makeFish({ species: 'guppy' });
    const angel = makeFish({ species: 'angelfish' });
    const resources = makeResources({ temperature: 18 }); // Below both ranges

    const guppyStress = calculateStress(guppy, resources, 100, 100, livestockDefaults);
    const angelStress = calculateStress(angel, resources, 100, 100, livestockDefaults);

    // Hardy guppy should have less stress
    expect(guppyStress).toBeLessThan(angelStress);
  });
});

describe('processHealth', () => {
  it('recovers health in ideal conditions', () => {
    const fish = [makeFish({ health: 80 })];
    const resources = makeResources();
    const result = processHealth(fish, resources, 100, 100, livestockDefaults);

    expect(result.survivingFish).toHaveLength(1);
    expect(result.survivingFish[0].health).toBeGreaterThan(80);
    expect(result.deadFishNames).toHaveLength(0);
  });

  it('caps health at 100', () => {
    const fish = [makeFish({ health: 100 })];
    const resources = makeResources();
    const result = processHealth(fish, resources, 100, 100, livestockDefaults);

    expect(result.survivingFish[0].health).toBe(100);
  });

  it('kills fish when health reaches 0', () => {
    const fish = [makeFish({ health: 1 })];
    // Very bad conditions - high ammonia
    const resources = makeResources({ ammonia: 1000 }); // 10 ppm

    const result = processHealth(fish, resources, 100, 100, livestockDefaults);

    expect(result.survivingFish).toHaveLength(0);
    expect(result.deadFishNames).toHaveLength(1);
    expect(result.deathWaste).toBeGreaterThan(0);
  });

  it('produces waste from dead fish', () => {
    const fish = [makeFish({ health: 1, mass: 5.0 })];
    const resources = makeResources({ ammonia: 5000 }); // lethal ammonia

    const result = processHealth(fish, resources, 100, 100, livestockDefaults);

    // waste = mass(5.0) * deathDecayFactor(0.5) = 2.5
    expect(result.deathWaste).toBeCloseTo(2.5, 1);
  });

  it('handles old age death with deterministic random', () => {
    const maxAge = 24 * 365 * 5; // 5 years for neon_tetra
    const fish = [makeFish({ age: maxAge + 100, health: 100 })];
    const resources = makeResources();

    // Test with random that always triggers death (< 0.01)
    const result = processHealth(fish, resources, 100, 100, livestockDefaults, () => 0.005);

    expect(result.survivingFish).toHaveLength(0);
    expect(result.deadFishNames[0]).toContain('old age');
  });

  it('fish survives old age with high random value', () => {
    const maxAge = 24 * 365 * 5;
    const fish = [makeFish({ age: maxAge + 100, health: 100 })];
    const resources = makeResources();

    // Test with random that never triggers death (> 0.01)
    const result = processHealth(fish, resources, 100, 100, livestockDefaults, () => 0.5);

    expect(result.survivingFish).toHaveLength(1);
  });

  it('does not trigger old age death before max age', () => {
    const fish = [makeFish({ age: 100, health: 100 })];
    const resources = makeResources();

    const result = processHealth(fish, resources, 100, 100, livestockDefaults, () => 0.001);

    expect(result.survivingFish).toHaveLength(1);
  });

  it('handles empty fish array', () => {
    const resources = makeResources();
    const result = processHealth([], resources, 100, 100, livestockDefaults);

    expect(result.survivingFish).toHaveLength(0);
    expect(result.deadFishNames).toHaveLength(0);
    expect(result.deathWaste).toBe(0);
  });

  it('processes multiple fish independently', () => {
    const fish = [
      makeFish({ id: 'healthy', health: 100 }),
      makeFish({ id: 'sick', health: 1 }),
    ];
    // High ammonia kills the sick fish
    const resources = makeResources({ ammonia: 2000 });

    const result = processHealth(fish, resources, 100, 100, livestockDefaults);

    // Healthy fish may survive, sick fish dies
    expect(result.deadFishNames.length).toBeGreaterThanOrEqual(1);
  });
});

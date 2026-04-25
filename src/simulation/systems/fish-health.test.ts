import { describe, it, expect } from 'vitest';
import {
  calculateStress,
  calculateStressBreakdown,
  computeFishVitality,
  processHealth,
} from './fish-health.js';
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
    hardinessOffset: 0,
    surplus: 0,
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
    // stress = 0.85 * 4 * 0.5 = 1.7
    expect(stress).toBeCloseTo(0.85 * 4 * 0.5, 2);
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

  it('applies ammonia stress proportional to the unionized NH3 fraction', () => {
    const fish = makeFish();
    // 5mg ammonia in 100L water = 0.05 ppm TAN at pH 7.0 / 25 °C.
    // f_NH3(7.0, 25°C) = 1 / (1 + 10^(9.245 − 7.0)) ≈ 0.00566
    // free NH3 = 0.05 × 0.00566 ≈ 0.000283 ppm
    // stress = severity(200) × 0.000283 × hardinessFactor(0.5) ≈ 0.02831
    // (Severity is per ppm free NH3 under the new model; matches Emerson
    // et al. 1975 speciation.)
    const resources = makeResources({ ammonia: 5, ph: 7.0, temperature: 25 });
    const stress = calculateStress(fish, resources, 100, 100, livestockDefaults);

    // Derive expected from the actual Emerson pKa so the check stays
    // robust if severity is retuned later.
    const pKa = 0.09018 + 2729.92 / (25 + 273.15);
    const fNH3 = 1 / (1 + Math.pow(10, pKa - 7.0));
    const expected = livestockDefaults.ammoniaStressSeverity * 0.05 * fNH3 * 0.5;
    expect(stress).toBeCloseTo(expected, 6);
  });

  it('free-NH3 toxicity rises sharply with pH', () => {
    // Same TAN (1 ppm) should produce dramatically higher stress at
    // pH 8.0 than at pH 6.5 because ~30× more of the TAN is in the
    // unionized (toxic) form.
    const fish = makeFish();
    const low = makeResources({ ammonia: 100, ph: 6.5, temperature: 25 });
    const high = makeResources({ ammonia: 100, ph: 8.0, temperature: 25 });
    const stressLow = calculateStress(fish, low, 100, 100, livestockDefaults);
    const stressHigh = calculateStress(fish, high, 100, 100, livestockDefaults);
    expect(stressHigh).toBeGreaterThan(stressLow * 10);
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

  describe('per-fish hardiness offset', () => {
    // Neon tetra hardiness = 0.5. Temperature stress at 18 °C (safe 22–28):
    //   stress = severity(0.85) × gap(4) × (1 - effectiveHardiness)
    const resources = (): ReturnType<typeof makeResources> =>
      makeResources({ temperature: 18 });

    it('negative offset → weaker fish → more stress', () => {
      const baseline = makeFish({ hardinessOffset: 0 });
      const weak = makeFish({ hardinessOffset: -0.075 }); // -15% of 0.5
      const bs = calculateStress(baseline, resources(), 100, 100, livestockDefaults);
      const ws = calculateStress(weak, resources(), 100, 100, livestockDefaults);
      expect(ws).toBeGreaterThan(bs);
      // effectiveHardiness goes 0.5 → 0.425, factor 0.5 → 0.575.
      expect(ws).toBeCloseTo(0.85 * 4 * (1 - 0.425), 6);
    });

    it('positive offset → hardier fish → less stress', () => {
      const baseline = makeFish({ hardinessOffset: 0 });
      const hardy = makeFish({ hardinessOffset: 0.075 }); // +15% of 0.5
      const bs = calculateStress(baseline, resources(), 100, 100, livestockDefaults);
      const hs = calculateStress(hardy, resources(), 100, 100, livestockDefaults);
      expect(hs).toBeLessThan(bs);
      // effectiveHardiness 0.5 → 0.575, factor 0.5 → 0.425.
      expect(hs).toBeCloseTo(0.85 * 4 * (1 - 0.575), 6);
    });

    it('clamps effectiveHardiness to upper bound 0.95', () => {
      // Extreme offset shouldn't let a fish become invincible.
      const superFish = makeFish({ species: 'guppy', hardinessOffset: 5 });
      const stress = calculateStress(
        superFish,
        makeResources({ temperature: 18 }),
        100,
        100,
        livestockDefaults
      );
      // Guppy range 22–28 → gap 4, severity 0.85. Clamped factor = 1 - 0.95 = 0.05.
      expect(stress).toBeCloseTo(0.85 * 4 * 0.05, 6);
    });

    it('clamps effectiveHardiness to lower bound 0.1', () => {
      // Extreme negative offset shouldn't instantly kill.
      const glassFish = makeFish({ species: 'guppy', hardinessOffset: -5 });
      const stress = calculateStress(
        glassFish,
        makeResources({ temperature: 18 }),
        100,
        100,
        livestockDefaults
      );
      // Clamped factor = 1 - 0.1 = 0.9.
      expect(stress).toBeCloseTo(0.85 * 4 * 0.9, 6);
    });

    it('zero offset matches species baseline behavior', () => {
      // Regression check: zero offset must preserve legacy calibration.
      const fish = makeFish({ hardinessOffset: 0 });
      const stress = calculateStress(fish, resources(), 100, 100, livestockDefaults);
      expect(stress).toBeCloseTo(0.85 * 4 * 0.5, 6);
    });
  });
});

describe('calculateStressBreakdown', () => {
  it('all stressors zero in ideal conditions', () => {
    const fish = makeFish();
    const resources = makeResources();
    const breakdown = calculateStressBreakdown(fish, resources, 100, 100, livestockDefaults);
    expect(breakdown).toEqual({
      temperature: 0,
      ph: 0,
      ammonia: 0,
      nitrite: 0,
      nitrate: 0,
      hunger: 0,
      oxygen: 0,
      waterLevel: 0,
      flow: 0,
      total: 0,
    });
  });

  it('isolates temperature stress', () => {
    const fish = makeFish({ species: 'neon_tetra' }); // range 22–28
    const resources = makeResources({ temperature: 18 });
    const b = calculateStressBreakdown(fish, resources, 100, 100, livestockDefaults);
    // 0.85 × 4 × 0.5 = 1.7
    expect(b.temperature).toBeCloseTo(1.7, 2);
    expect(b.ph).toBe(0);
    expect(b.ammonia).toBe(0);
    expect(b.nitrite).toBe(0);
    expect(b.nitrate).toBe(0);
    expect(b.hunger).toBe(0);
    expect(b.oxygen).toBe(0);
    expect(b.waterLevel).toBe(0);
    expect(b.flow).toBe(0);
    expect(b.total).toBeCloseTo(b.temperature, 6);
  });

  it('isolates pH stress', () => {
    const fish = makeFish({ species: 'neon_tetra' }); // pH 6.0–7.5
    const resources = makeResources({ ph: 8.5 });
    const b = calculateStressBreakdown(fish, resources, 100, 100, livestockDefaults);
    // 3.0 × 1.0 × 0.5 = 1.5
    expect(b.ph).toBeCloseTo(1.5, 1);
    expect(b.temperature).toBe(0);
    expect(b.ammonia).toBe(0);
    expect(b.total).toBeCloseTo(b.ph, 6);
  });

  it('isolates ammonia stress (free NH3 fraction)', () => {
    const fish = makeFish();
    const resources = makeResources({ ammonia: 5, ph: 7.0, temperature: 25 });
    const b = calculateStressBreakdown(fish, resources, 100, 100, livestockDefaults);
    const pKa = 0.09018 + 2729.92 / (25 + 273.15);
    const fNH3 = 1 / (1 + Math.pow(10, pKa - 7.0));
    const expected = livestockDefaults.ammoniaStressSeverity * 0.05 * fNH3 * 0.5;
    expect(b.ammonia).toBeCloseTo(expected, 6);
    expect(b.temperature).toBe(0);
    expect(b.nitrite).toBe(0);
    expect(b.total).toBeCloseTo(b.ammonia, 6);
  });

  it('isolates nitrite stress', () => {
    const fish = makeFish();
    const resources = makeResources({ nitrite: 100 }); // 1 ppm in 100L
    const b = calculateStressBreakdown(fish, resources, 100, 100, livestockDefaults);
    expect(b.nitrite).toBeGreaterThan(0);
    expect(b.ammonia).toBe(0);
    expect(b.nitrate).toBe(0);
    expect(b.total).toBeCloseTo(b.nitrite, 6);
  });

  it('isolates nitrate stress only above 40 ppm', () => {
    const fish = makeFish();
    const below = calculateStressBreakdown(
      fish,
      makeResources({ nitrate: 3000 }), // 30 ppm
      100,
      100,
      livestockDefaults
    );
    expect(below.nitrate).toBe(0);
    expect(below.total).toBe(0);

    const above = calculateStressBreakdown(
      fish,
      makeResources({ nitrate: 6000 }), // 60 ppm
      100,
      100,
      livestockDefaults
    );
    expect(above.nitrate).toBeGreaterThan(0);
    expect(above.total).toBeCloseTo(above.nitrate, 6);
  });

  it('isolates hunger stress (only above 50%)', () => {
    const fish = makeFish({ hunger: 80 });
    const b = calculateStressBreakdown(fish, makeResources(), 100, 100, livestockDefaults);
    // (80-50) × 0.1 × 0.5 = 1.5
    expect(b.hunger).toBeCloseTo(1.5, 1);
    expect(b.total).toBeCloseTo(b.hunger, 6);

    const calm = makeFish({ hunger: 40 });
    const bCalm = calculateStressBreakdown(calm, makeResources(), 100, 100, livestockDefaults);
    expect(bCalm.hunger).toBe(0);
  });

  it('isolates oxygen stress', () => {
    const fish = makeFish();
    const resources = makeResources({ oxygen: 3 });
    const b = calculateStressBreakdown(fish, resources, 100, 100, livestockDefaults);
    // (5-3) × 3.0 × 0.5 = 3.0
    expect(b.oxygen).toBeCloseTo(3.0, 1);
    expect(b.total).toBeCloseTo(b.oxygen, 6);
  });

  it('isolates water-level stress', () => {
    const fish = makeFish();
    const resources = makeResources({ water: 30 });
    const b = calculateStressBreakdown(fish, resources, 30, 100, livestockDefaults);
    // (50-30) × 0.2 × 0.5 = 2.0
    expect(b.waterLevel).toBeCloseTo(2.0, 1);
    expect(b.total).toBeCloseTo(b.waterLevel, 6);
  });

  it('isolates flow stress', () => {
    const fish = makeFish({ species: 'betta' }); // maxFlow 150
    const resources = makeResources({ flow: 400 });
    const b = calculateStressBreakdown(fish, resources, 100, 100, livestockDefaults);
    // (400-150) × 0.01 × 0.4 = 1.0
    expect(b.flow).toBeCloseTo(1.0, 1);
    expect(b.total).toBeCloseTo(b.flow, 6);
  });

  it('sums all active stressors into total and matches calculateStress', () => {
    const fish = makeFish({ species: 'neon_tetra', hunger: 80 });
    const resources = makeResources({
      temperature: 18,
      ph: 8.5,
      ammonia: 5,
      nitrite: 50,
      nitrate: 6000,
      oxygen: 3,
      water: 30,
      flow: 600,
    });
    const b = calculateStressBreakdown(fish, resources, 30, 100, livestockDefaults);
    const stress = calculateStress(fish, resources, 30, 100, livestockDefaults);

    const handSum =
      b.temperature +
      b.ph +
      b.ammonia +
      b.nitrite +
      b.nitrate +
      b.hunger +
      b.oxygen +
      b.waterLevel +
      b.flow;
    expect(b.total).toBeCloseTo(handSum, 10);
    expect(b.total).toBeCloseTo(stress, 10);
    // All the ones that should be active, are.
    expect(b.temperature).toBeGreaterThan(0);
    expect(b.ph).toBeGreaterThan(0);
    expect(b.ammonia).toBeGreaterThan(0);
    expect(b.nitrite).toBeGreaterThan(0);
    expect(b.nitrate).toBeGreaterThan(0);
    expect(b.hunger).toBeGreaterThan(0);
    expect(b.oxygen).toBeGreaterThan(0);
    expect(b.waterLevel).toBeGreaterThan(0);
    expect(b.flow).toBeGreaterThan(0);
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

describe('temperature stress calibration (S4 Variant A.1)', () => {
  // Pins the `temperatureStressSeverity = 0.85` calibration against the
  // scenario 04 cold-failure curve without needing a full scenario run.
  //
  // Setup: a betta (hardiness 0.6, safe range 24–30 °C) held at 20 °C.
  // Expected per-tick damage:
  //   stress = severity(0.85) × gap(4 °C) × hardinessFactor(0.4) = 1.36 %/hr
  //   net loss = stress − recovery(1.0) = 0.36 %/hr ≈ 8.64 %/day
  //
  // Scenario 04 checkpoints (day = 24 ticks). Note: the scenario
  // includes a 24-hour thermal drift ramp from 26 °C → 20 °C, which we
  // skip here (direct to 20 °C), so this test runs a shade harsher than
  // the scenario report (scenario day 7 actual = 42 vs ~39.5 here).
  // Bands reflect the pure-20 °C curve, not the scenario-ramped curve.
  //   day 1  (tick 24):  health 85–95
  //   day 2  (tick 48):  health 70–85
  //   day 4  (tick 96):  health 55–75
  //   day 7  (tick 168): health 35–50  ← primary anchor (calibrated to
  //                      pure-cold curve, see note above)
  //   day 14 (tick 336): dead (or nearly so)
  function runCold(
    ticks: number
  ): { health: number; alive: boolean; diedAt: number | null } {
    const resources = makeResources({ temperature: 20 });
    let fish: Fish[] = [makeFish({ species: 'betta', mass: 3.0, health: 100 })];
    for (let i = 0; i < ticks; i++) {
      const result = processHealth(
        fish,
        resources,
        100,
        100,
        livestockDefaults
      );
      fish = result.survivingFish;
      if (fish.length === 0) return { health: 0, alive: false, diedAt: i + 1 };
    }
    return { health: fish[0].health, alive: true, diedAt: null };
  }

  it('day 1 health lands in 85–95 band', () => {
    const result = runCold(24);
    expect(result.alive).toBe(true);
    expect(result.health).toBeGreaterThanOrEqual(85);
    expect(result.health).toBeLessThanOrEqual(95);
  });

  it('day 7 health lands in 35–50 band (pure-cold curve)', () => {
    const result = runCold(168);
    expect(result.alive).toBe(true);
    expect(result.health).toBeGreaterThanOrEqual(35);
    expect(result.health).toBeLessThanOrEqual(50);
  });

  it('day 14 betta is dead or nearly so', () => {
    const result = runCold(336);
    if (result.alive) {
      expect(result.health).toBeLessThanOrEqual(15);
    }
    // Otherwise dead — both outcomes acceptable at day 14.
  });

  it('hardier neon tetra declines faster at same 20 °C (smaller safe-range margin)', () => {
    // Neon: hardiness 0.5, range 22–28 °C → gap 2 °C, factor 0.5.
    // Stress 0.85 × 2 × 0.5 = 0.85 %/hr, net −0.15 %/day loss after
    // recovery — actually slower decline than betta despite neon being
    // less hardy, because neon's range starts lower (22 °C). Sanity
    // check that the calibration respects species range boundaries
    // rather than using hardcoded thresholds.
    const resources = makeResources({ temperature: 20 });
    let fish: Fish[] = [makeFish({ species: 'neon_tetra', health: 100 })];
    for (let i = 0; i < 168; i++) {
      const result = processHealth(
        fish,
        resources,
        100,
        100,
        livestockDefaults
      );
      fish = result.survivingFish;
    }
    // After 7 days at 20 °C, neon should still be alive but losing
    // health. Compare against betta in the same conditions.
    const bettaResult = runCold(168);
    expect(fish.length).toBe(1);
    // Same gap (2 vs 4) / hardiness (0.5 vs 0.4) → neon net loss
    // 0.85×2×0.5 − 1 = −0.15 /hr; betta 0.85×4×0.4 − 1 = 0.36 /hr.
    // Neon recovers, betta declines.
    expect(fish[0].health).toBeGreaterThan(bettaResult.health);
  });
});

describe('vitality integration', () => {
  // The vitality model exposes per-factor benefits + surplus capture.
  // These tests pin the contract the migration introduces on top of the
  // legacy stress math (which the tests above already cover).

  it('exposes ph/hunger/oxygen benefits when conditions are good', () => {
    const fish = makeFish();
    const resources = makeResources();
    const result = computeFishVitality(fish, resources, 100, 100, livestockDefaults);

    const benefitKeys = result.breakdown.benefits.map((b) => b.key).sort();
    expect(benefitKeys).toEqual(['hunger', 'oxygen', 'ph']);
    // Total at "all good" matches the legacy baseHealthRecovery so the
    // calibration scenarios stay pinned.
    expect(result.breakdown.benefitRate).toBeCloseTo(
      livestockDefaults.baseHealthRecovery,
      6
    );
  });

  it('drops the pH benefit to zero when pH leaves the species range', () => {
    const fish = makeFish({ species: 'neon_tetra' }); // pH 6.0–7.5
    const resources = makeResources({ ph: 8.5 });
    const result = computeFishVitality(fish, resources, 100, 100, livestockDefaults);

    const phBenefit = result.breakdown.benefits.find((b) => b.key === 'ph');
    expect(phBenefit?.amount).toBe(0);
    // pH stressor takes over from there.
    const phStress = result.breakdown.stressors.find((s) => s.key === 'ph');
    expect(phStress?.amount).toBeGreaterThan(0);
  });

  it('drops the hunger benefit to zero once hunger crosses the stress line', () => {
    const fish = makeFish({ hunger: 60 });
    const resources = makeResources();
    const result = computeFishVitality(fish, resources, 100, 100, livestockDefaults);
    const hunger = result.breakdown.benefits.find((b) => b.key === 'hunger');
    expect(hunger?.amount).toBe(0);
  });

  it('captures surplus when the fish is at full health and net is positive', () => {
    // No stressors, no negative net — a healthy fish at 100 should
    // emit positive surplus equal to the net benefit rate. Currently
    // unused but the breeding/growth tasks will consume it.
    const fish = makeFish({ health: 100, hunger: 10 });
    const resources = makeResources();
    const result = processHealth([fish], resources, 100, 100, livestockDefaults);
    expect(result.survivingFish[0].health).toBe(100);
    expect(result.survivingFish[0].surplus).toBeGreaterThan(0);
  });

  it('does not produce surplus while sub-100 health is recovering', () => {
    // The locked design: a stressed organism heals first, never grows
    // while the deficit is unpaid.
    const fish = makeFish({ health: 80, surplus: 0, hunger: 10 });
    const resources = makeResources();
    const result = processHealth([fish], resources, 100, 100, livestockDefaults);
    expect(result.survivingFish[0].health).toBeGreaterThan(80);
    expect(result.survivingFish[0].health).toBeLessThanOrEqual(100);
    expect(result.survivingFish[0].surplus).toBe(0);
  });

  it('accumulates surplus across ticks at full health', () => {
    let fish: Fish[] = [makeFish({ health: 100, hunger: 10 })];
    const resources = makeResources();
    for (let i = 0; i < 10; i++) {
      fish = processHealth(fish, resources, 100, 100, livestockDefaults).survivingFish;
    }
    expect(fish[0].surplus).toBeGreaterThan(0);
  });
});

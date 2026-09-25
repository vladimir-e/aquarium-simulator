import { describe, it, expect } from 'vitest';
import { computeFishVitality, processHealth } from './fish-health.js';
import type { VitalityResult } from './vitality.js';
import { livestockDefaults } from '../config/livestock.js';
import { FISH_SPECIES_DATA } from '../livestock/species.js';
import type { Fish, Plant, Resources } from '../state.js';
import { withPh, type ResourceOverrides } from '../tests/resources.js';
import type { FishSpecies } from '../livestock/species.js';

const STRESSORS = [
  'temperature',
  'ph',
  'ammonia',
  'nitrite',
  'nitrate',
  'satiation',
  'oxygen',
  'waterLevel',
  'flow',
];

const stressorAmount = (v: VitalityResult, key: string): number =>
  v.breakdown.stressors.find((s) => s.key === key)?.amount ?? 0;

const benefitAmount = (v: VitalityResult, key: string): number =>
  v.breakdown.benefits.find((b) => b.key === key)?.amount ?? 0;

const totalStress = (v: VitalityResult): number =>
  v.breakdown.stressors.reduce((sum, s) => sum + s.amount, 0);

function makeFish(overrides: Partial<Fish> = {}): Fish {
  return {
    id: 'fish_1',
    species: 'neon_tetra',
    mass: 0.5,
    health: 100,
    age: 0,
    satiation: 87,
    sex: 'male',
    stage: 'adult',
    hardinessOffset: 0,
    surplus: 0,
    ...overrides,
  };
}

function makeResources(overrides: ResourceOverrides = {}): Resources {
  return withPh({
    water: 100,
    temperature: 25,
    surface: 1000,
    flow: 100,
    light: 0,
    aeration: true,
    food: 1,
    waste: 0,
    ammonia: 0,
    nitrite: 0,
    nitrate: 0,
    phosphate: 0,
    potassium: 0,
    iron: 0,
    oxygen: 8.0,
    co2: 4.0,
    kh: 0,
    aob: 0,
    nob: 0,
  }, { ph: 7.0, ...overrides });
}

function makePlant(overrides: Partial<Plant> = {}): Plant {
  return {
    id: 'plant_1',
    species: 'java_fern',
    size: 100,
    condition: 100,
    surplus: 0,
    ...overrides,
  };
}

function vitality(
  fish: Partial<Fish> = {},
  resources: ResourceOverrides = {},
  { plants = [], water = resources.water ?? 100, capacity = 100, config = livestockDefaults } = {} as {
    plants?: Plant[];
    water?: number;
    capacity?: number;
    config?: typeof livestockDefaults;
  }
): VitalityResult {
  return computeFishVitality(makeFish(fish), makeResources(resources), plants, water, capacity, config);
}

function health(
  fish: Fish[],
  resources: ResourceOverrides = {},
  plants: Plant[] = []
): ReturnType<typeof processHealth> {
  return processHealth(fish, makeResources(resources), plants, 100, 100, livestockDefaults);
}

interface Circulating {
  flow: number;
  water: number;
  capacity?: number;
}

const flowStressOf = (species: FishSpecies, { flow, water, capacity = water }: Circulating): number =>
  stressorAmount(vitality({ species }, { flow, water }, { water, capacity }), 'flow');

describe('stressors', () => {
  it('are all zero in ideal water', () => {
    const v = vitality();
    for (const key of STRESSORS) expect(stressorAmount(v, key)).toBe(0);
    expect(totalStress(v)).toBe(0);
  });

  it.each<[string, ResourceOverrides, Partial<Fish>]>([
    ['temperature', { temperature: 18 }, {}],
    ['temperature', { temperature: 32 }, {}],
    ['ph', { ph: 8.5 }, {}],
    ['ammonia', { ammonia: 5 }, {}],
    ['nitrite', { nitrite: 100 }, {}],
    ['nitrate', { nitrate: 6000 }, {}],
    ['satiation', {}, { satiation: 20 }],
    ['oxygen', { oxygen: 3 }, {}],
  ])('isolates %s stress to its own key', (key, resources, fish) => {
    const v = vitality(fish, resources);
    expect(stressorAmount(v, key)).toBeGreaterThan(0);
    expect(totalStress(v)).toBeCloseTo(stressorAmount(v, key), 10);
  });

  it('charges water level on a low tank', () => {
    const v = vitality({}, { water: 30 });
    expect(stressorAmount(v, 'waterLevel')).toBeGreaterThan(0);
  });

  it('grows temperature stress linearly with distance past the range', () => {
    const [minTemp] = FISH_SPECIES_DATA.neon_tetra.temperatureRange;
    const two = stressorAmount(vitality({}, { temperature: minTemp - 2 }), 'temperature');
    const four = stressorAmount(vitality({}, { temperature: minTemp - 4 }), 'temperature');
    expect(two).toBeGreaterThan(0);
    expect(four).toBeCloseTo(2 * two, 10);
  });

  it('charges free NH3, so the same TAN hurts far more at high pH', () => {
    const low = stressorAmount(vitality({}, { ammonia: 100, ph: 6.5 }), 'ammonia');
    const high = stressorAmount(vitality({}, { ammonia: 100, ph: 8.0 }), 'ammonia');
    expect(high).toBeGreaterThan(low * 10);
  });

  it('leaves nitrate alone below its threshold', () => {
    expect(stressorAmount(vitality({}, { nitrate: 3000 }), 'nitrate')).toBe(0);
  });

  it('reads toxins at full strength in a drained tank', () => {
    const drained = totalStress(vitality({}, { ammonia: 1 }, { water: 0 }));
    const full = totalStress(vitality({}, { ammonia: 1 }));
    expect(drained).toBeGreaterThan(full);
  });

  it('sums every active stressor into the total', () => {
    const v = vitality(
      { satiation: 20 },
      {
        temperature: 18,
        ph: 8.5,
        ammonia: 5,
        nitrite: 50,
        nitrate: 6000,
        oxygen: 3,
        water: 30,
        flow: 600,
      }
    );
    for (const key of STRESSORS) expect(stressorAmount(v, key)).toBeGreaterThan(0);
    const handSum = STRESSORS.reduce((sum, key) => sum + stressorAmount(v, key), 0);
    expect(totalStress(v)).toBeCloseTo(handSum, 10);
  });
});

describe('hardiness', () => {
  const cold = { temperature: 18 };

  it('spares a hardier species', () => {
    expect(totalStress(vitality({ species: 'guppy' }, cold))).toBeLessThan(
      totalStress(vitality({ species: 'angelfish' }, cold))
    );
  });

  it('moves stress against the per-fish offset', () => {
    const base = totalStress(vitality({ hardinessOffset: 0 }, cold));
    expect(totalStress(vitality({ hardinessOffset: -0.075 }, cold))).toBeGreaterThan(base);
    expect(totalStress(vitality({ hardinessOffset: 0.075 }, cold))).toBeLessThan(base);
  });

  it('clamps an extreme offset so no fish is invincible or made of glass', () => {
    const invincible = totalStress(vitality({ hardinessOffset: 5 }, cold));
    const glass = totalStress(vitality({ hardinessOffset: -5 }, cold));
    expect(invincible).toBeGreaterThan(0);
    expect(invincible).toBe(totalStress(vitality({ hardinessOffset: 50 }, cold)));
    expect(glass).toBe(totalStress(vitality({ hardinessOffset: -50 }, cold)));
  });
});

describe('flow is a turnover', () => {
  it('charges the same damage at any volume, given the same turnover', () => {
    const stress = [20, 40, 150, 300].map((water) =>
      flowStressOf('neon_tetra', { flow: 12 * water, water })
    );

    expect(stress.every((s) => s > 0)).toBe(true);
    expect(new Set(stress).size).toBe(1);
  });

  it('is gentler in a bigger tank for the same pump', () => {
    const stress = [20, 40, 75, 150, 300].map((water) =>
      flowStressOf('neon_tetra', { flow: 908, water })
    );

    expect(stress[0]).toBeGreaterThan(0);
    expect(stress.at(-1)).toBe(0);
    for (let i = 1; i < stress.length; i++) {
      if (stress[i - 1]! > 0) expect(stress[i]).toBeLessThan(stress[i - 1]!);
      else expect(stress[i]).toBe(0);
    }
  });

  it('doubles when the excess over tolerance doubles', () => {
    const { maxTurnover } = FISH_SPECIES_DATA.neon_tetra;
    const single = flowStressOf('neon_tetra', { flow: (maxTurnover + 3) * 100, water: 100 });
    const double = flowStressOf('neon_tetra', { flow: (maxTurnover + 6) * 100, water: 100 });

    expect(double).toBeCloseTo(2 * single, 10);
  });

  it('switches on exactly at each species’ own tolerance', () => {
    for (const species of Object.keys(FISH_SPECIES_DATA) as FishSpecies[]) {
      const { maxTurnover } = FISH_SPECIES_DATA[species];
      expect(flowStressOf(species, { flow: maxTurnover * 100, water: 100 })).toBe(0);
      expect(flowStressOf(species, { flow: (maxTurnover + 1) * 100, water: 100 })).toBeGreaterThan(
        0
      );
    }
  });

  it('divides by the water in the tank, so half of it is the same as twice the pump', () => {
    const evaporated = flowStressOf('neon_tetra', { flow: 600, water: 50, capacity: 100 });
    const doubled = flowStressOf('neon_tetra', { flow: 1200, water: 100, capacity: 100 });

    expect(evaporated).toBeGreaterThan(0);
    expect(evaporated).toBe(doubled);
  });

  it('leaves a drained tank to the water-level stressor', () => {
    const v = vitality({}, { flow: 1000, water: 0 }, { water: 0 });

    expect(stressorAmount(v, 'flow')).toBe(0);
    expect(stressorAmount(v, 'waterLevel')).toBeGreaterThan(0);
  });
});

describe('satiation bands', () => {
  it.each<[number, 'stress' | 'benefit' | 'neither', string?]>([
    [99.5, 'stress', 'Overfed'],
    [82, 'benefit'],
    [60, 'neither'],
    [30, 'stress', 'Hungry'],
    [10, 'stress', 'Starving'],
  ])('satiation %d → %s', (satiation, expected, label) => {
    const v = vitality({ satiation });
    expect(stressorAmount(v, 'satiation') > 0).toBe(expected === 'stress');
    expect(benefitAmount(v, 'satiation') > 0).toBe(expected === 'benefit');
    if (label) {
      expect(v.breakdown.stressors.find((s) => s.key === 'satiation')!.label).toBe(label);
    }
  });

  it('starving is steeper than hungry', () => {
    expect(stressorAmount(vitality({ satiation: 10 }), 'satiation')).toBeGreaterThan(
      stressorAmount(vitality({ satiation: 30 }), 'satiation')
    );
  });
});

describe('benefits', () => {
  it('lists every benefit key every tick, even at zero', () => {
    const v = vitality();
    expect(v.breakdown.benefits.map((b) => b.key).sort()).toEqual([
      'oxygen',
      'ph',
      'plants',
      'satiation',
    ]);
    expect(benefitAmount(v, 'plants')).toBe(0);
  });

  it('swaps the pH benefit for the pH stressor outside the species range', () => {
    const v = vitality({}, { ph: 8.5 });
    expect(benefitAmount(v, 'ph')).toBe(0);
    expect(stressorAmount(v, 'ph')).toBeGreaterThan(0);
  });
});

describe('plant-presence benefit', () => {
  const net = (plants: Plant[]): number => vitality({}, {}, { plants }).breakdown.net;
  const baseline = net([]);
  const lift = (plants: Plant[]): number => net(plants) - baseline;
  const plants = (count: number, overrides: Partial<Plant> = {}): Plant[] =>
    Array.from({ length: count }, (_, i) => makePlant({ id: `p_${i}`, ...overrides }));
  const peak = lift(plants(10));

  it('grows with the plants and saturates', () => {
    expect(lift(plants(1))).toBeGreaterThan(0);
    expect(lift(plants(2))).toBeGreaterThan(lift(plants(1)));
    expect(lift(plants(20))).toBeCloseTo(peak, 10);
  });

  it('counts biomass by size and condition, summed across plants', () => {
    expect(lift(plants(1, { condition: 0 }))).toBeCloseTo(0, 10);
    expect(lift(plants(1, { size: 10 }))).toBeCloseTo(lift(plants(1)) / 10, 10);
    expect(lift(plants(10, { size: 10 }))).toBeCloseTo(lift(plants(1)), 10);
  });
});

describe('processHealth', () => {
  it('recovers health in ideal conditions, capped at 100', () => {
    expect(health([makeFish({ health: 80 })]).survivingFish[0].health).toBeGreaterThan(80);
    expect(health([makeFish({ health: 100 })]).survivingFish[0].health).toBe(100);
  });

  it('kills a fish whose health reaches 0 and leaves its body as waste', () => {
    const light = health([makeFish({ health: 1, mass: 1 })], { ammonia: 5000 });
    const heavy = health([makeFish({ health: 1, mass: 2 })], { ammonia: 5000 });

    expect(light.survivingFish).toHaveLength(0);
    expect(light.deadFishNames).toHaveLength(1);
    expect(heavy.deathWaste).toBeCloseTo(2 * light.deathWaste, 10);
  });

  it('handles an empty roster', () => {
    const result = health([]);
    expect(result.survivingFish).toHaveLength(0);
    expect(result.deadFishNames).toHaveLength(0);
    expect(result.deathWaste).toBe(0);
  });

  it('processes each fish independently', () => {
    const result = health(
      [makeFish({ id: 'healthy', health: 100 }), makeFish({ id: 'sick', health: 1 })],
      { ammonia: 2000 }
    );
    expect(result.survivingFish.map((f) => f.id)).toEqual(['healthy']);
  });
});

describe('age', () => {
  const { maxAge } = FISH_SPECIES_DATA.neon_tetra;

  it('charges nothing up to maxAge and linearly past it', () => {
    expect(stressorAmount(vitality({ age: 100 }), 'age')).toBe(0);
    expect(stressorAmount(vitality({ age: maxAge }), 'age')).toBe(0);
    const day = stressorAmount(vitality({ age: maxAge + 24 }), 'age');
    expect(day).toBeGreaterThan(0);
    expect(stressorAmount(vitality({ age: maxAge + 48 }), 'age')).toBeCloseTo(2 * day, 10);
  });

  it('attributes a death past maxAge to old age', () => {
    const result = health([makeFish({ age: maxAge + 24, health: 1 })], { ammonia: 5000 });
    expect(result.survivingFish).toHaveLength(0);
    expect(result.deadFishNames[0]).toContain('old age');
  });
});

describe('surplus', () => {
  const cold = { temperature: 18 };

  it('banks at full health and not while recovering', () => {
    expect(health([makeFish({ health: 100 })]).survivingFish[0].surplus).toBeGreaterThan(0);
    expect(health([makeFish({ health: 80 })]).survivingFish[0].surplus).toBe(0);
  });

  it('banks faster in a planted tank', () => {
    const planted = health([makeFish()], {}, [makePlant()]).survivingFish[0].surplus;
    const bare = health([makeFish()]).survivingFish[0].surplus;
    expect(planted).toBeGreaterThan(bare);
  });

  it('saturates at the cap, clamping an over-cap bank', () => {
    const { surplusCap } = livestockDefaults;
    expect(health([makeFish({ surplus: surplusCap - 0.01 })]).survivingFish[0].surplus).toBe(
      surplusCap
    );
    expect(health([makeFish({ surplus: surplusCap * 2 })]).survivingFish[0].surplus).toBe(
      surplusCap
    );
  });

  it('burns the reserve to hold health at 100 under stress, then health falls', () => {
    const buffered = health([makeFish({ surplus: 10 })], cold).survivingFish[0];
    expect(buffered.health).toBe(100);
    expect(buffered.surplus).toBeLessThan(10);

    const spent = health([makeFish({ surplus: 0.01 })], cold).survivingFish[0];
    expect(spent.surplus).toBe(0);
    expect(spent.health).toBeLessThan(100);
  });

  it('floors at zero when the cap is negative', () => {
    const config = { ...livestockDefaults, surplusCap: -50 };
    expect(vitality({ surplus: 0 }, {}, { config }).surplus).toBe(0);
    expect(vitality({ surplus: 20 }, {}, { config }).surplus).toBe(0);
  });
});

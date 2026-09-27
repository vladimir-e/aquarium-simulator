import { describe, it, expect } from 'vitest';
import { computeFishVitality, fishHealingRate, processHealth } from './fish-health.js';
import type { VitalityResult } from './vitality.js';
import { livestockDefaults } from '../config/livestock.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { FISH_SPECIES_DATA } from '../livestock/species.js';
import { createSimulation, type Fish, type Plant, type Resources, type SimulationState } from '../state.js';
import {
  highAmmoniaAlert,
  highNitrateAlert,
  highNitriteAlert,
  lowOxygenAlert,
  type Alert,
} from '../alerts/index.js';
import { withPh, type ResourceOverrides } from '../tests/resources.js';
import { getGhMass } from '../resources/helpers.js';
import type { FishSpecies } from '../livestock/species.js';
import {
  FREE_AMMONIA_EDGE,
  HARDY_TOLERANCE,
  NITRATE_EDGE,
  NITRITE_EDGE,
  OXYGEN_COMFORT,
  OXYGEN_EDGE,
  OXYGEN_LOG_OFFSET,
  toleranceFactor,
} from '../livestock/tolerance.js';
import { freeAmmoniaPpm } from './nitrogen-cycle.js';
import { plantRecord } from '../tests/plant.js';
import { maintenance, nourishment } from './digestion.js';

const STRESSORS = [
  'temperature',
  'ph',
  'gh',
  'ammonia',
  'nitrite',
  'nitrate',
  'hunger',
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
    gut: 0,
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
    lightByHour: new Array(24).fill(0),
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
    gh: getGhMass(6, 100),
    aob: 0,
    nob: 0,
  }, { ph: 7.0, ...overrides });
}

function makePlant(overrides: Partial<Plant> = {}): Plant {
  return plantRecord({
    id: 'plant_1',
    species: 'java_fern',
    size: 100,
    condition: 100,
    surplus: 0,
    ...overrides,
  });
}

const NEED = maintenance(makeFish(), livestockDefaults);
/** A fish digesting three times its maintenance ration, and the share of its benefits that earns. */
const FED = 3 * NEED;
const EARNING = nourishment(FED, NEED);

function vitality(
  fish: Partial<Fish> = {},
  resources: ResourceOverrides = {},
  {
    plants = [],
    water = resources.water ?? 100,
    capacity = 100,
    config = livestockDefaults,
    digested = FED,
  } = {} as {
    plants?: Plant[];
    water?: number;
    capacity?: number;
    config?: typeof livestockDefaults;
    digested?: number;
  }
): VitalityResult {
  return computeFishVitality(makeFish(fish), makeResources(resources), plants, water, capacity, config, digested);
}

function health(
  fish: Fish[],
  resources: ResourceOverrides = {},
  plants: Plant[] = []
): ReturnType<typeof processHealth> {
  return processHealth(fish, makeResources(resources), plants, 100, 100, livestockDefaults, fish.map(() => FED));
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
    ['gh', { gh: getGhMass(FISH_SPECIES_DATA.neon_tetra.ghRange[1] + 5, 100) }, {}],
    ['ammonia', { ammonia: 2000 }, {}],
    ['nitrite', { nitrite: 100 }, {}],
    ['nitrate', { nitrate: 20000 }, {}],
    ['oxygen', { oxygen: 2 }, {}],
  ])('isolates %s stress to its own key', (key, resources, fish) => {
    const v = vitality(fish, resources);
    expect(stressorAmount(v, key)).toBeGreaterThan(0);
    expect(totalStress(v)).toBeCloseTo(stressorAmount(v, key), 10);
  });

  it('isolates hunger stress to its own key', () => {
    const v = vitality({}, {}, { digested: NEED / 2 });
    expect(stressorAmount(v, 'hunger')).toBeGreaterThan(0);
    expect(totalStress(v)).toBeCloseTo(stressorAmount(v, 'hunger'), 10);
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

  it('charges no toxin or flow in a drained tank', () => {
    const v = vitality({}, { ammonia: 1000, nitrite: 1000, nitrate: 1000, flow: 1000, water: 0 });
    for (const key of ['ammonia', 'nitrite', 'nitrate', 'flow']) expect(stressorAmount(v, key)).toBe(0);
    expect(stressorAmount(v, 'waterLevel')).toBeGreaterThan(0);
  });

  it('sums every active stressor into the total', () => {
    const v = vitality(
      {},
      {
        temperature: 18,
        ph: 8.5,
        gh: getGhMass(30, 30),
        ammonia: 2000,
        nitrite: 50,
        nitrate: 20000,
        oxygen: 2,
        water: 30,
        flow: 600,
      },
      { digested: 0 }
    );
    for (const key of STRESSORS) expect(stressorAmount(v, key)).toBeGreaterThan(0);
    const handSum = STRESSORS.reduce((sum, key) => sum + stressorAmount(v, key), 0);
    expect(totalStress(v)).toBeCloseTo(handSum, 10);
  });
});

describe('water quality', () => {
  const neonTolerance = toleranceFactor(FISH_SPECIES_DATA.neon_tetra.hardiness);
  const at: Record<string, (reading: number, ph: number) => ResourceOverrides> = {
    ammonia: (free, ph) => ({ ammonia: (100 * free) / freeAmmoniaPpm(makeResources({ ammonia: 100, ph })) }),
    nitrite: (ppm) => ({ nitrite: ppm * 100 }),
    nitrate: (ppm) => ({ nitrate: ppm * 100 }),
    oxygen: (oxygen) => ({ oxygen }),
  };
  const bandCentre = (key: string, reading: number, species: FishSpecies = 'neon_tetra'): ResourceOverrides => {
    const [lo, hi] = FISH_SPECIES_DATA[species].phRange;
    const ph = (lo + hi) / 2;
    return { ph, ...at[key](reading, ph) };
  };
  const atBandCentre = (key: string, reading: number, fish: Partial<Fish> = {}): VitalityResult =>
    vitality(fish, bandCentre(key, reading, fish.species));

  it.each<[string, number]>([
    ['nitrite', NITRITE_EDGE],
    ['nitrate', NITRATE_EDGE],
  ])('grows %s harm from the fish’s own edge by the same step per doubling', (key, edge) => {
    const own = edge * neonTolerance;
    const charge = (ppm: number): number => stressorAmount(atBandCentre(key, ppm), key);
    expect(charge(own)).toBe(0);
    expect(charge(own * 2)).toBeGreaterThan(0);
    expect(charge(own * 4)).toBeCloseTo(2 * charge(own * 2), 10);
    expect(charge(own * 8)).toBeCloseTo(3 * charge(own * 2), 10);
  });

  it('grows oxygen harm by the same step each time oxygen plus its log offset halves, finite and rising to zero', () => {
    const own = OXYGEN_EDGE / neonTolerance;
    const charge = (oxygen: number): number => stressorAmount(vitality({}, { oxygen }), 'oxygen');
    const halved = (times: number): number => (own + OXYGEN_LOG_OFFSET) / 2 ** times - OXYGEN_LOG_OFFSET;
    expect(charge(own)).toBe(0);
    expect(charge(halved(2))).toBeCloseTo(2 * charge(halved(1)), 10);
    expect(Number.isFinite(charge(0))).toBe(true);
    expect(charge(0)).toBeGreaterThan(charge(OXYGEN_LOG_OFFSET / 2));
  });

  it('moves a hardier fish’s edge out rather than flattening its slope', () => {
    const charge = (species: FishSpecies, ppm: number): number =>
      stressorAmount(vitality({ species }, { nitrate: ppm * 100 }), 'nitrate');
    const hardy = toleranceFactor(FISH_SPECIES_DATA.guppy.hardiness);
    expect(charge('guppy', NITRATE_EDGE * hardy)).toBe(0);
    expect(charge('neon_tetra', NITRATE_EDGE * hardy)).toBeGreaterThan(0);
    expect(charge('guppy', 1000) - charge('guppy', 500)).toBeCloseTo(
      charge('neon_tetra', 1000) - charge('neon_tetra', 500),
      10
    );
  });

  it('raises the oxygen benefit from nothing at the edge to full at comfort', () => {
    const benefit = (oxygen: number): number => benefitAmount(vitality({}, { oxygen }), 'oxygen');
    const peak = EARNING * livestockDefaults.oxygenBenefitPeak;
    expect(benefit(OXYGEN_EDGE * 0.9)).toBe(0);
    expect(benefit(OXYGEN_EDGE)).toBe(0);
    expect(benefit(Math.sqrt(OXYGEN_EDGE * OXYGEN_COMFORT))).toBeCloseTo(peak / 2, 10);
    expect(benefit(OXYGEN_COMFORT)).toBeCloseTo(peak, 10);
    expect(benefit(OXYGEN_COMFORT * 2)).toBeCloseTo(peak, 10);
  });

  const channels: [string, number, number][] = [
    ['ammonia', FREE_AMMONIA_EDGE, livestockDefaults.ammoniaStressSeverity],
    ['nitrite', NITRITE_EDGE, livestockDefaults.nitriteStressSeverity],
    ['nitrate', NITRATE_EDGE, livestockDefaults.nitrateStressSeverity],
    ['oxygen', OXYGEN_EDGE, livestockDefaults.oxygenStressSeverity],
  ];
  const past = (key: string, edge: number, factor: number): number =>
    key === 'oxygen' ? edge / factor : edge * factor;

  const budget = (key: string): number =>
    EARNING * (livestockDefaults.phBenefitPeak + (key === 'oxygen' ? 0 : livestockDefaults.oxygenBenefitPeak));

  it.each(channels)('breaks a fish even on %s where its charge meets the clean-tank budget', (key, edge, severity) => {
    const ratio = Math.exp(budget(key) / severity);
    const breakEven =
      key === 'oxygen'
        ? (edge / neonTolerance + OXYGEN_LOG_OFFSET) / ratio - OXYGEN_LOG_OFFSET
        : edge * neonTolerance * ratio;
    const v = atBandCentre(key, breakEven);
    expect(v.breakdown.benefitRate).toBeCloseTo(budget(key), 10);
    expect(v.breakdown.net).toBeCloseTo(0, 10);
  });

  const alertOn: Record<string, Alert> = {
    ammonia: highAmmoniaAlert,
    nitrite: highNitriteAlert,
    nitrate: highNitrateAlert,
    oxygen: lowOxygenAlert,
  };

  it.each(channels)('alerts on %s at a reading that spares even the frailest fish', (key, edge) => {
    const reading = past(key, edge, 1.01);
    const tank: SimulationState = {
      ...createSimulation({ tankCapacity: 100 }),
      resources: makeResources(bandCentre(key, reading)),
    };
    expect(alertOn[key].check(tank, DEFAULT_CONFIG).log).not.toBeNull();
    expect(stressorAmount(atBandCentre(key, reading, { hardinessOffset: -1 }), key)).toBe(0);
  });

  it.each(channels)('still harms the hardiest fish on %s where hardiness 1 would start', (key, edge) => {
    const hardiest = atBandCentre(key, past(key, edge, HARDY_TOLERANCE), { species: 'guppy', hardinessOffset: 1 });
    expect(stressorAmount(hardiest, key)).toBeGreaterThan(0);
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
});

describe('hunger', () => {
  const hunger = (digested: number): number => stressorAmount(vitality({}, {}, { digested }), 'hunger');
  const hardening = 1 - FISH_SPECIES_DATA.neon_tetra.hardiness;

  it('starts at the maintenance ration and grows linearly to its severity on an empty gut', () => {
    expect(hunger(2 * NEED)).toBe(0);
    expect(hunger(NEED)).toBe(0);
    expect(hunger(NEED / 2)).toBeCloseTo((livestockDefaults.hungerSeverity * hardening) / 2, 12);
    expect(hunger(0)).toBeCloseTo(livestockDefaults.hungerSeverity * hardening, 12);
  });
});

describe('nourishment', () => {
  const benefits = (digested: number): number => vitality({}, {}, { digested }).breakdown.benefitRate;

  it('earns every benefit on what the fish digested: none on nothing, half at maintenance, more on more', () => {
    const full = benefits(FED) / EARNING;
    expect(benefits(0)).toBe(0);
    expect(benefits(NEED)).toBeCloseTo(full / 2, 12);
    expect(benefits(6 * NEED)).toBeGreaterThan(benefits(FED));
  });

  it('banks more on a bigger ration', () => {
    const banked = (digested: number): number => vitality({}, {}, { digested }).surplus;
    expect(banked(FED)).toBeGreaterThan(banked(NEED));
    expect(banked(0)).toBe(0);
  });
});

describe('benefits', () => {
  it('lists every benefit key every tick, even at zero', () => {
    const v = vitality();
    expect(v.breakdown.benefits.map((b) => b.key).sort()).toEqual([
      'oxygen',
      'ph',
      'plants',
    ]);
    expect(benefitAmount(v, 'plants')).toBe(0);
  });

  it('swaps the pH benefit for the pH stressor outside the species range', () => {
    const v = vitality({}, { ph: 8.5 });
    expect(benefitAmount(v, 'ph')).toBe(0);
    expect(stressorAmount(v, 'ph')).toBeGreaterThan(0);
  });

  it('grades the pH benefit from nothing at the edge to its peak at the band centre', () => {
    const [lo, hi] = FISH_SPECIES_DATA.neon_tetra.phRange;
    const earned = (ph: number): number => benefitAmount(vitality({}, { ph }), 'ph');
    expect(earned(hi)).toBe(0);
    expect(stressorAmount(vitality({}, { ph: hi }), 'ph')).toBe(0);
    expect(earned((lo + hi) / 2)).toBeCloseTo(EARNING * livestockDefaults.phBenefitPeak, 12);
    expect(earned((lo + 3 * hi) / 4)).toBeCloseTo(0.75 * EARNING * livestockDefaults.phBenefitPeak, 12);
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

  it('kills a fish whose health reaches 0 and leaves its body and its gut as waste', () => {
    const light = health([makeFish({ health: 1, mass: 1 })], { oxygen: 0 });
    const heavy = health([makeFish({ health: 1, mass: 2 })], { oxygen: 0 });
    const fed = health([makeFish({ health: 1, mass: 1, gut: 0.01 })], { oxygen: 0 });

    expect(light.survivingFish).toHaveLength(0);
    expect(light.deadFishNames).toHaveLength(1);
    expect(heavy.deathWaste).toBeCloseTo(2 * light.deathWaste, 10);
    expect(fed.deathWaste - light.deathWaste).toBeCloseTo(0.01, 12);
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
      { oxygen: 1 }
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
    const result = health([makeFish({ age: maxAge + 24, health: 1 })], { oxygen: 0 });
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

  it('heals from the bank at its rate over the hour, holding health a bare fish loses', () => {
    const buffered = vitality({ surplus: 10 }, cold);
    expect(buffered.breakdown.healed).toBeCloseTo(
      Math.min(-buffered.breakdown.net, 10 * -Math.expm1(-fishHealingRate(makeFish(), livestockDefaults))),
      12
    );
    expect(buffered.surplus).toBeCloseTo(10 - buffered.breakdown.healed, 12);
    expect(buffered.newCondition).toBeGreaterThan(vitality({ surplus: 0 }, cold).newCondition);
  });

  it('scales the healing rate by adult mass to the −¼ power', () => {
    const share = (species: FishSpecies): number => fishHealingRate(makeFish({ species }), livestockDefaults);
    const ratio = FISH_SPECIES_DATA.angelfish.adultMass / FISH_SPECIES_DATA.neon_tetra.adultMass;
    expect(share('neon_tetra') / share('angelfish')).toBeCloseTo(ratio ** 0.25, 12);
    expect(share('guppy')).toBeCloseTo(
      livestockDefaults.healingDrawRate * FISH_SPECIES_DATA.guppy.adultMass ** -0.25,
      12
    );
  });

  it('floors at zero when the cap is negative', () => {
    const config = { ...livestockDefaults, surplusCap: -50 };
    expect(vitality({ surplus: 0 }, {}, { config }).surplus).toBe(0);
    expect(vitality({ surplus: 20 }, {}, { config }).surplus).toBe(0);
  });
});

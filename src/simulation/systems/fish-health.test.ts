import { describe, it, expect } from 'vitest';
import { NO_ORGANICS } from '../core/organics.js';
import {
  computeFishVitality,
  healingAsked,
  healingPrice,
  preyVulnerability,
  predationStress,
  predatorMasses,
  predatorWeight,
  processHealth,
  speciesHardiness,
} from './fish-health.js';
import { starvation } from './reserve.js';
import type { VitalityResult } from './vitality.js';
import { livestockDefaults } from '../config/livestock.js';
import { hourlyDraw } from '../core/kinetics.js';
import { configRange, DEFAULT_CONFIG } from '../config/index.js';
import { debParams, FISH_SPECIES_DATA } from '../livestock/species.js';
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
import { gutCapacity, type Pace } from './digestion.js';
import { liveHour, type FishHour } from './metabolism.js';
import { NO_STRESS } from './deb.js';
import { fishMass, fishOrganics, fishSize } from './fish-body.js';
import { fishRecord } from '../tests/fish.js';

const STRESSORS = [
  'temperature',
  'ph',
  'gh',
  'ammonia',
  'nitrite',
  'nitrate',
  'oxygen',
  'starvation',
  'waterLevel',
  'flow',
  'hunted',
  'age',
];

const stressorAmount = (v: VitalityResult, key: string): number =>
  v.breakdown.stressors.find((s) => s.key === key)?.amount ?? 0;

const benefitAmount = (v: VitalityResult, key: string): number =>
  v.breakdown.benefits.find((b) => b.key === key)?.amount ?? 0;

const totalStress = (v: VitalityResult): number =>
  v.breakdown.stressors.reduce((sum, s) => sum + s.amount, 0);

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
    waste: NO_ORGANICS,
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

function makePlant(overrides: Partial<Omit<Plant, 'budget'>> & { size?: number } = {}): Plant {
  return plantRecord({ id: 'plant_1', species: 'java_fern', size: 100, ...overrides });
}

/** The defaults with no age damage and no paid repair: a young fish in clean water takes no damage, a sick one stays sick. */
const AGELESS = { ...livestockDefaults, hazardSeverity: 0, healingRate: 0 };
const HEALING = { ...AGELESS, healingRate: livestockDefaults.healingRate };

const REFERENCE: Pace = { tau: 1, omega: 1, stress: NO_STRESS };

/** A fish's hour of budget on a full reserve and an empty gut, repairing what it asks. */
const hourOf = (fish: Fish, config = AGELESS): FishHour =>
  liveHour(fish, REFERENCE, healingAsked(fish, REFERENCE, config), config);

function vitality(
  fish: Partial<Fish> = {},
  resources: ResourceOverrides = {},
  {
    plants = [],
    water = resources.water ?? 100,
    capacity = 100,
    config = AGELESS,
    predatorMass = 0,
  } = {} as {
    plants?: Plant[];
    water?: number;
    capacity?: number;
    config?: typeof livestockDefaults;
    predatorMass?: number;
  }
): VitalityResult {
  const record = fishRecord(fish);
  return computeFishVitality(
    record,
    hourOf(record, config),
    makeResources(resources),
    plants,
    water,
    capacity,
    config,
    predatorMass
  );
}

function health(
  fish: Fish[],
  resources: ResourceOverrides = {},
  plants: Plant[] = [],
  carried: number[] = fish.map(() => 0),
  config = AGELESS
): ReturnType<typeof processHealth> {
  const hours = fish.map((f) => hourOf(f, config));
  return processHealth(
    fish,
    hours,
    hours.map((hour) => hour.fish),
    makeResources(resources),
    plants,
    100,
    config,
    carried
  );
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

  it('isolates starvation stress to its own key', () => {
    const v = vitality({ deb: { ...fishRecord().deb, reserve: 0 } });
    expect(stressorAmount(v, 'starvation')).toBeGreaterThan(0);
    expect(totalStress(v)).toBeCloseTo(stressorAmount(v, 'starvation'), 10);
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
    const small = fishRecord({ size: 20 });
    const v = vitality(
      { ...small, deb: { ...small.deb, reserve: 0, hazard: 1e-4 } },
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
      { predatorMass: 1, config: livestockDefaults }
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
    const peak = livestockDefaults.oxygenBenefitPeak;
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
    livestockDefaults.phBenefitPeak + (key === 'oxygen' ? 0 : livestockDefaults.oxygenBenefitPeak);

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
    expect(earned((lo + hi) / 2)).toBeCloseTo(livestockDefaults.phBenefitPeak, 12);
    expect(earned((lo + 3 * hi) / 4)).toBeCloseTo(0.75 * livestockDefaults.phBenefitPeak, 12);
  });
});

describe('plant-presence benefit', () => {
  const net = (plants: Plant[]): number => vitality({}, {}, { plants }).breakdown.net;
  const baseline = net([]);
  const lift = (plants: Plant[]): number => net(plants) - baseline;
  const plants = (count: number, overrides: Partial<Omit<Plant, 'budget'>> & { size?: number } = {}): Plant[] =>
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
  /** What a fish leaves dead after the hour: its body and gut as the hour leaves them. */
  const remainsOf = (fish: Fish): number => {
    const { fish: after } = hourOf(fish);
    return fishOrganics(after) + after.gut;
  };

  it('recovers health in ideal conditions, capped at 100', () => {
    expect(health([fishRecord({ health: 80 })]).survivingFish[0].health).toBeGreaterThan(80);
    expect(health([fishRecord({ health: 100 })]).survivingFish[0].health).toBe(100);
  });

  it('kills a fish whose health reaches 0 and leaves its whole body and its gut as waste', () => {
    const small = fishRecord({ health: 1, size: 40 });
    const big = fishRecord({ health: 1, size: 80 });
    const fed = fishRecord({ health: 1, size: 40, gut: 0.001 });
    const [light, heavy, full] = [small, big, fed].map((fish) => health([fish], { oxygen: 0 }));

    expect(light.survivingFish).toHaveLength(0);
    expect(light.deadFishNames).toHaveLength(1);
    expect(light.deathWaste).toBeCloseTo(remainsOf(small), 15);
    expect(heavy.deathWaste).toBeCloseTo(remainsOf(big), 15);
    expect(full.deathWaste).toBeCloseTo(remainsOf(fed), 15);
  });

  it('kills a fish of old age when its survival falls below its draw, at any health', () => {
    const fish = fishRecord({ survival: 0.5, survivalDraw: 0.5, deb: { ...fishRecord().deb, hazard: 1e-3 } });
    const result = health([fish]);
    expect(result.survivingFish).toHaveLength(0);
    expect(result.vitalities[0].newCondition).toBeGreaterThan(0);
    expect(result.deadFishNames).toEqual(['Neon Tetra (old age)']);
    expect(health([{ ...fish, survivalDraw: 0.4 }]).survivingFish).toHaveLength(1);
  });

  it('labels a death mostly of age damage as old age too', () => {
    const frail = fishRecord({ health: 0.01, deb: { ...fishRecord().deb, hazard: 1e-3 } });
    expect(health([frail], {}, [], [0], livestockDefaults).deadFishNames).toEqual(['Neon Tetra (old age)']);
  });

  it('labels a death mostly of starvation as starved', () => {
    const starving = fishRecord({ health: 0.01, deb: { ...fishRecord().deb, reserve: 0 } });
    expect(health([starving]).deadFishNames).toEqual(['Neon Tetra (starved)']);
  });

  it('handles an empty roster', () => {
    const result = health([]);
    expect(result.survivingFish).toHaveLength(0);
    expect(result.deadFishNames).toHaveLength(0);
    expect(result.deathWaste).toBe(0);
  });

  it('processes each fish independently', () => {
    const result = health(
      [fishRecord({ id: 'healthy', health: 100 }), fishRecord({ id: 'sick', health: 1 })],
      { oxygen: 1 }
    );
    expect(result.survivingFish.map((f) => f.id)).toEqual(['healthy']);
  });

  it('returns the whole of every dead body, its buffer, its gut and its brood', () => {
    const grown = fishRecord({ id: 'dying', health: 0.001, gut: 0.001, sex: 'female' });
    const dying = { ...grown, deb: { ...grown.deb, broodBuffer: 0.002 } };
    const result = health([dying], { oxygen: 0 }, [], [0.003]);
    expect(result.deathWaste).toBeCloseTo(remainsOf(dying) + 0.003, 15);
    expect(remainsOf(dying)).toBeGreaterThan(remainsOf(grown) + 0.0019);
  });
});

describe('predation', () => {
  const fry = fishRecord({ id: 'fry', size: 15 });
  const angel = (id: string, size: number, fields: Partial<Fish> = {}): Fish =>
    fishRecord({ id, species: 'angelfish', size, ...fields });

  it('grows with the grams of predators per litre', () => {
    const one = predationStress(fishSize(fry), 1, 100, livestockDefaults);
    expect(one).toBeGreaterThan(0);
    expect(predationStress(fishSize(fry), 2, 100, livestockDefaults)).toBeCloseTo(2 * one, 12);
    expect(predationStress(fishSize(fry), 2, 200, livestockDefaults)).toBeCloseTo(one, 12);
    expect(predationStress(fishSize(fry), 1, 0, livestockDefaults)).toBe(0);
  });

  it('falls smoothly with the prey’s size, from whole at none to nothing grown', () => {
    const sizes = [0, 5, 20, 35, 50, 75, 99, 100];
    const exposure = sizes.map((size) => preyVulnerability(size, livestockDefaults));
    expect(exposure[0]).toBe(1);
    expect(exposure.at(-1)).toBe(0);
    for (let i = 1; i < exposure.length; i++) expect(exposure[i]).toBeLessThan(exposure[i - 1]);
  });

  it('weighs each fish in by the grams it outweighs the prey, nothing between equals', () => {
    expect(predatorWeight(3, 0.1)).toBeCloseTo(2.9, 12);
    expect(predatorWeight(0.1, 0.1)).toBe(0);
    expect(predatorWeight(0.05, 0.1)).toBe(0);
    const [onFry, onBig] = predatorMasses([0.1, 3, 0.1, 0.05]);
    expect(onFry).toBeCloseTo(2.9, 12);
    expect(onBig).toBe(0);
  });

  it('sums every predator weight on every fish, as a pairwise sum does', () => {
    const roster = [0.3, 0.01, 2, 0.3, 0.05, 1.2, 0.01, 0.7];
    const pairwise = roster.map((prey) => roster.reduce((sum, mass) => sum + predatorWeight(mass, prey), 0));
    predatorMasses(roster).forEach((mass, i) => expect(mass).toBeCloseTo(pairwise[i], 12));
  });

  it('is a hunted stressor, hardened as the body’s are', () => {
    const hunted = stressorAmount(vitality(fry, {}, { predatorMass: 1 }), 'hunted');
    const expected = predationStress(fishSize(fry), 1, 100, livestockDefaults) * (1 - speciesHardiness('neon_tetra'));
    expect(hunted).toBeCloseTo(expected, 12);
    expect(stressorAmount(vitality(fry), 'hunted')).toBe(0);
  });

  it('feeds what a fry it kills leaves to the larger fish by their weight on it, instead of the rot', () => {
    const prey = { ...fry, health: 0.001, gut: 0.00002 };
    const big = angel('big', 40);
    const bigger = angel('bigger', 70);
    const tiny = fishRecord({ id: 'tiny', size: 14 });
    const result = health([prey, big, bigger, tiny]);
    const hours = [prey, big, bigger, tiny].map((f) => hourOf(f));
    const remains = fishOrganics(hours[0].fish) + hours[0].fish.gut;

    const guts = new Map(result.survivingFish.map((f) => [f.id, f.gut]));
    expect(guts.has('fry')).toBe(false);
    expect(result.deathWaste).toBeCloseTo(0, 15);
    expect(guts.get('big')! - hours[1].fish.gut + guts.get('bigger')! - hours[2].fish.gut).toBeCloseTo(remains, 12);
    const outweighs = (i: number): number => fishMass([prey, big, bigger][i]) - fishMass(prey);
    expect((guts.get('bigger')! - hours[2].fish.gut) / (guts.get('big')! - hours[1].fish.gut)).toBeCloseTo(
      outweighs(2) / outweighs(1),
      10
    );
    expect(guts.get('tiny')).toBe(hours[3].fish.gut);
    expect(result.deadFishNames[0]).toContain('eaten');
  });

  it('feeds a predator only as far as its gut has room, the rest to waste', () => {
    const prey = { ...fry, health: 0.001 };
    const hungry = angel('hungry', 60);
    const stuffed = { ...hungry, gut: 2 * gutCapacity(hungry, REFERENCE) };
    const remains = fishOrganics(hourOf(prey).fish);

    const empty = health([prey, hungry]);
    expect(empty.survivingFish[0].gut - hourOf(hungry).fish.gut).toBeCloseTo(remains, 15);
    const full = health([prey, stuffed]);
    expect(full.survivingFish[0].gut).toBe(hourOf(stuffed).fish.gut);
    expect(full.deathWaste).toBeCloseTo(remains, 15);
  });

  it('feeds the brood an eaten mother carried to her predators with her', () => {
    const mother = { ...fry, health: 0.001 };
    const predator = angel('big', 60);
    const brood = 1e-5;
    const bare = health([mother, predator]);
    const carrying = health([mother, predator], {}, [], [brood, 0]);

    const gained = carrying.survivingFish[0].gut - bare.survivingFish[0].gut;
    expect(gained + carrying.deathWaste - bare.deathWaste).toBeCloseTo(brood, 15);
    expect(gained).toBeGreaterThan(0.9 * brood);
  });

  it('lets the share a hunter that died this hour did rot, not pass to the hunters that survive it', () => {
    const prey = { ...fry, health: 0.001 };
    const dying = angel('dying', 40, { health: 0.001 });
    const surviving = angel('surviving', 40);
    const result = health([prey, dying, surviving], { oxygen: 1 });

    expect(result.survivingFish.map((f) => f.id)).toEqual(['surviving']);
    const hunted = stressorAmount(result.vitalities[0], 'hunted') / result.vitalities[0].breakdown.damageRate;
    const [preyAfter, dyingAfter, survivorAfter] = [prey, dying, surviving].map((f) => hourOf(f).fish);
    const remains = fishOrganics(preyAfter) + preyAfter.gut;
    const gained = result.survivingFish[0].gut - survivorAfter.gut;
    expect(hunted).toBeGreaterThan(0);
    expect(gained).toBeCloseTo((hunted / 2) * remains, 12);
    expect(gained + result.deathWaste).toBeCloseTo(remains + fishOrganics(dyingAfter) + dyingAfter.gut, 12);
  });

  it('leaves a fry to rot when nothing larger survives to eat it', () => {
    const prey = { ...fry, health: 0.001 };
    const predator = angel('big', 60, { health: 0.001 });
    const result = health([prey, predator], { oxygen: 0 });
    expect(result.survivingFish).toHaveLength(0);
    const after = [prey, predator].map((f) => hourOf(f).fish);
    expect(result.deathWaste).toBeCloseTo(after.reduce((sum, f) => sum + fishOrganics(f) + f.gut, 0), 12);
  });
});

describe('starvation', () => {
  it('is the share of its upkeep the hour left unpaid', () => {
    const empty = fishRecord({ deb: { ...fishRecord().deb, reserve: 0 } });
    expect(starvation(hourOf(empty))).toBeCloseTo(1, 12);
    expect(starvation(hourOf(fishRecord()))).toBe(0);
  });

  it('charges starvationSeverity at a wholly unpaid upkeep, before hardiness', () => {
    const empty = { ...fishRecord(), deb: { ...fishRecord().deb, reserve: 0 } };
    const charged = stressorAmount(vitality(empty), 'starvation');
    expect(charged).toBeCloseTo(livestockDefaults.starvationSeverity * (1 - speciesHardiness('neon_tetra')), 12);
  });

  it('earns its benefits on its reserve density: in full on a full reserve, none on an empty one', () => {
    const full = fishRecord();
    const empty = { ...full, deb: { ...full.deb, reserve: 0 } };
    expect(vitality(full).breakdown.benefitRate).toBeGreaterThan(0);
    expect(vitality(empty).breakdown.benefitRate).toBe(0);
  });
});

describe('repair', () => {
  it('asks its deficit closing first order at healingRate × τ, at healingCost hours of its upkeep a point', () => {
    const fish = fishRecord({ health: 60 });
    const price = healingPrice(fish, livestockDefaults);
    expect(price).toBeCloseTo(livestockDefaults.healingCost * debParams('neon_tetra').pM * fish.deb.structure, 15);
    expect(healingAsked(fish, { ...REFERENCE, tau: 1.5 }, livestockDefaults)).toBeCloseTo(
      price * hourlyDraw(livestockDefaults.healingRate * 1.5) * 40,
      15
    );
    expect(healingAsked(fishRecord(), REFERENCE, livestockDefaults)).toBe(0);
  });

  it('heals the points its reserve paid for, on top of what it earns', () => {
    const fish = fishRecord({ health: 60 });
    const v = vitality(fish, {}, { config: HEALING });
    expect(v.breakdown.healed).toBeCloseTo(hourlyDraw(livestockDefaults.healingRate) * 40, 9);
    expect(v.newCondition).toBeCloseTo(60 + v.breakdown.net + v.breakdown.healed, 12);
  });

  it('repairs at the cheapest healing cost the config takes, which is never free', () => {
    const cheapest = { ...HEALING, healingCost: configRange('livestock.healingCost')!.min };
    expect(cheapest.healingCost).toBeGreaterThan(0);
    expect(vitality({ health: 60 }, {}, { config: cheapest }).breakdown.healed).toBeCloseTo(
      hourlyDraw(cheapest.healingRate) * 40,
      9
    );
  });

  it('heals nothing from an empty reserve, nor at no oxygen', () => {
    const fish = fishRecord({ health: 60 });
    expect(vitality({ ...fish, deb: { ...fish.deb, reserve: 0 } }, {}, { config: HEALING }).breakdown.healed).toBe(0);
    const record = fishRecord(fish);
    const breathless = liveHour(record, { ...REFERENCE, omega: 0 }, healingAsked(record, REFERENCE, HEALING), HEALING);
    const v = computeFishVitality(record, breathless, makeResources(), [], 100, 100, HEALING, 0);
    expect(v.breakdown.healed).toBe(0);
  });
});

describe('age', () => {
  it('damages health at hazardSeverity times the hazard, shielded by no hardiness', () => {
    const fish = fishRecord({ deb: { ...fishRecord().deb, hazard: 2e-5 } });
    const v = vitality(fish, {}, { config: livestockDefaults });
    expect(stressorAmount(v, 'age')).toBeCloseTo(livestockDefaults.hazardSeverity * 2e-5, 15);
    const hardy = vitality({ ...fish, hardinessOffset: 0.3 }, {}, { config: livestockDefaults });
    expect(stressorAmount(hardy, 'age')).toBe(stressorAmount(v, 'age'));
  });
});

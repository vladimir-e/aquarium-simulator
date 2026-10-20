import { describe, it, expect } from 'vitest';
import { NO_ORGANICS } from '../core/organics.js';
import {
  buildPlantStressors,
  buildPlantBenefits,
  computePlantVitality,
  type PlantVitalityContext,
} from './plant-vitality.js';
import { maxReserveDensity, repairPrice } from './reserve.js';
import { toleranceFactor } from '../livestock/tolerance.js';
import { plantsDefaults } from '../config/plants.js';
import { getGhMass, getMassFromPpm } from '../resources/helpers.js';
import type { Plant, Resources } from '../state.js';
import { lightAtHeight, unitOf, type CanopyLight } from '../plants/canopy.js';
import type { VitalityFactor } from './vitality.js';
import { withPh, type ResourceOverrides } from '../tests/resources.js';
import { PLANT_SPECIES_DATA, type PlantSpecies } from '../plants/species.js';
import { monodFactor } from '../core/kinetics.js';
import { plantRecord, withBudget, withStores } from '../tests/plant.js';
import { mapKinds } from '../algae/blooms.js';
import { plantParams } from '../flora/params.js';
import { droopFactor, fullDroopFactor, type FloraFluxes } from './flora-budget.js';

function makePlant(species: PlantSpecies, overrides: Partial<Omit<Plant, 'budget'>> = {}): Plant {
  return plantRecord({ id: `plant_${species}`, species, size: 50, ...overrides });
}

/** A day of `hours` lit at `par`, the rest dark. */
function litDay(par: number, hours: number): number[] {
  return Array.from({ length: 24 }, (_, hour) => (hour < hours ? par : 0));
}

function makeResources(overrides: ResourceOverrides = {}): Resources {
  return withPh({
    water: 100,
    temperature: 25,
    surface: 1000,
    flow: 100,
    light: 40,
    lightByHour: litDay(40, 8),
    aeration: true,
    food: NO_ORGANICS,
    waste: NO_ORGANICS,
    ammonia: 0,
    nitrite: 0,
    nitrate: getMassFromPpm(15, 100),
    phosphate: getMassFromPpm(1, 100),
    potassium: getMassFromPpm(7, 100),
    iron: getMassFromPpm(0.15, 100),
    oxygen: 8.0,
    co2: 20.0,
    kh: 0,
    gh: getGhMass(6, 100),
    aob: 0,
    nob: 0,
  }, { ph: 6.8, ...overrides });
}

const FULL_LIGHT: CanopyLight = { leaf: 1, top: 1, path: { water: 1, canopy: 1, blooms: mapKinds(() => 1) } };

/** An hour its budget paid in full and repaired nothing. */
const PAID: FloraFluxes = {
  returned: 0,
  assimilated: 0,
  mobilised: 0,
  toStructure: 0,
  fromStructure: 0,
  burned: { maintenance: 1, growth: 0, starvation: 0, healing: 0 },
  owed: 1,
  shortfall: 0,
  droopLimit: 1,
};

function ctx(
  plant: Plant,
  resources: Resources,
  fluxes: FloraFluxes = PAID,
  canopy: CanopyLight = FULL_LIGHT
): PlantVitalityContext {
  return {
    plant,
    params: plantParams(plant.species, plantsDefaults),
    fluxes,
    resources,
    waterVolume: resources.water,
    plantsConfig: plantsDefaults,
    light: lightAtHeight(unitOf(plant), canopy, resources, 50),
  };
}

const factor = (factors: VitalityFactor[], key: string): number => factors.find((f) => f.key === key)?.amount ?? 0;

/** The plant with its reserve at this density. */
function fedAt(plant: Plant, e: number): Plant {
  const p = plantParams(plant.species, plantsDefaults);
  return withBudget(plant, { reserve: e * maxReserveDensity(p) * plant.budget.structure });
}

describe('buildPlantStressors', () => {
  const amount = (species: PlantSpecies, key: string, resources: ResourceOverrides): number =>
    factor(buildPlantStressors(ctx(makePlant(species), makeResources(resources))), key);

  it('charges a fed Anubias in good conditions nothing', () => {
    for (const s of buildPlantStressors(ctx(makePlant('anubias'), makeResources()))) expect(s.amount).toBe(0);
  });

  it.each<[string, PlantSpecies, (gap: number) => ResourceOverrides]>([
    ['light', 'anubias', (gap): Partial<Resources> => ({ light: PLANT_SPECIES_DATA.anubias.tolerableLight[1] + gap })],
    ['temperature', 'amazon_sword', (gap): Partial<Resources> => ({ temperature: PLANT_SPECIES_DATA.amazon_sword.tolerableTemp[0] - gap })],
    ['ph', 'monte_carlo', (gap): ResourceOverrides => ({ ph: PLANT_SPECIES_DATA.monte_carlo.tolerablePH[1] + gap / 4 })],
    ['gh', 'amazon_sword', (gap): Partial<Resources> => ({ gh: getGhMass(PLANT_SPECIES_DATA.amazon_sword.tolerableGH[1] + gap, 100) })],
  ])('charges %s on %s in proportion to the gap outside its range', (key, species, at) => {
    expect(amount(species, key, at(0))).toBe(0);
    const one = amount(species, key, at(1));
    expect(one).toBeGreaterThan(0);
    expect(amount(species, key, at(2))).toBeCloseTo(2 * one, 10);
  });

  it('charges starvation on the share of upkeep the hour left unpaid, hardened', () => {
    const plant = makePlant('monte_carlo');
    const starved = (shortfall: number): number =>
      factor(buildPlantStressors(ctx(plant, makeResources(), { ...PAID, shortfall })), 'starvation');
    expect(starved(0)).toBe(0);
    expect(starved(0.5)).toBeCloseTo(
      0.5 * plantsDefaults.starvationSeverity * (1 - PLANT_SPECIES_DATA.monte_carlo.hardiness),
      12
    );
  });

  it('charges deficiency on its stores’ Droop limit under the edge, whatever the water holds', () => {
    const p = plantParams('monte_carlo', plantsDefaults);
    const charged = (fill: number, resources: ResourceOverrides = {}): number =>
      factor(buildPlantStressors(ctx(withStores(makePlant('monte_carlo'), fill), makeResources(resources))), 'nutrients');
    expect(charged(1, { potassium: 0 })).toBe(0);
    const empty = charged(0);
    expect(empty).toBeCloseTo(
      plantsDefaults.nutrientDeficiencySeverity * (1 - PLANT_SPECIES_DATA.monte_carlo.hardiness),
      12
    );
    const lean = withStores(makePlant('monte_carlo'), 0.05);
    const droop = droopFactor(lean.budget, p);
    const edge = plantsDefaults.droopEdge * fullDroopFactor(p);
    expect(droop).toBeLessThan(edge);
    expect(charged(0.05)).toBeCloseTo(empty * (1 - droop / edge), 12);
  });

  describe('nitrate, on log dose past an edge hardiness carries out', () => {
    const at = (species: PlantSpecies, ppm: number): number =>
      amount(species, 'nitrate', { nitrate: getMassFromPpm(ppm, 100) });
    const edge = (species: PlantSpecies): number =>
      plantsDefaults.nitrateEdge * toleranceFactor(PLANT_SPECIES_DATA[species].hardiness);

    it('is zero up to the edge and adds the same for every doubling past it', () => {
      const e = edge('amazon_sword');
      expect(at('amazon_sword', e)).toBe(0);
      expect(at('amazon_sword', 2 * e)).toBeCloseTo(plantsDefaults.nitrateStressSeverity * Math.LN2, 10);
      expect(at('amazon_sword', 4 * e) - at('amazon_sword', 2 * e)).toBeCloseTo(at('amazon_sword', 2 * e), 10);
    });

    it('moves the edge with hardiness rather than scaling the harm', () => {
      expect(edge('anubias')).toBeGreaterThan(edge('monte_carlo'));
      expect(at('anubias', 2 * edge('anubias'))).toBeCloseTo(at('monte_carlo', 2 * edge('monte_carlo')), 10);
    });
  });

  it('charges no damage for low CO2: carbon is income, not a threshold', () => {
    expect(amount('monte_carlo', 'co2', { co2: 0.5 })).toBe(0);
  });

  it('burns on the PAR at its crown top, whatever reaches its mean leaf', () => {
    const plant = makePlant('amazon_sword');
    const edge = PLANT_SPECIES_DATA.amazon_sword.tolerableLight[1];
    const burnt = (light: number, canopy: Pick<CanopyLight, 'leaf' | 'top'>): number =>
      factor(buildPlantStressors(ctx(plant, makeResources({ light }), PAID, { ...FULL_LIGHT, ...canopy })), 'light');

    expect(burnt(edge, { leaf: 2, top: 1 })).toBe(0);
    expect(burnt(edge, { leaf: 0.5, top: 1.2 })).toBeCloseTo(burnt(edge * 1.2, { leaf: 1, top: 1 }), 12);
    expect(burnt(edge, { leaf: 0.5, top: 1.2 })).toBeCloseTo(burnt(edge, { leaf: 3, top: 1.2 }), 12);
  });
});

describe('buildPlantBenefits', () => {
  const total = (plant: Plant, resources = makeResources()): number =>
    buildPlantBenefits(ctx(plant, resources)).reduce((sum, f) => sum + f.amount, 0);

  it('earns on its reserve density and its stores’ Droop limit, and nothing on a burned reserve', () => {
    const plant = makePlant('amazon_sword');
    const p = plantParams('amazon_sword', plantsDefaults);
    expect(total(fedAt(plant, 0.5))).toBeCloseTo(total(plant) / 2, 12);
    expect(total(fedAt(plant, 0))).toBe(0);
    const lean = withStores(plant, 0.2);
    expect(total(lean) / total(plant)).toBeCloseTo(droopFactor(lean.budget, p) / droopFactor(plant.budget, p), 12);
  });

  it('earns the same in the dark as in the light: the reserve carries the day', () => {
    expect(total(makePlant('anubias'), makeResources({ light: 0 }))).toBeCloseTo(total(makePlant('anubias')), 12);
  });

  it('earns the CO2 channel on the species carbon Monod, so a carpet earns less of it', () => {
    const co2Benefit = (species: PlantSpecies, co2: number): number =>
      factor(buildPlantBenefits(ctx(makePlant(species), makeResources({ co2 }))), 'co2');
    expect(co2Benefit('monte_carlo', 25)).toBeGreaterThan(co2Benefit('monte_carlo', 4));
    expect(co2Benefit('monte_carlo', 4)).toBeLessThan(co2Benefit('anubias', 4));
    expect(co2Benefit('monte_carlo', 4) / co2Benefit('monte_carlo', 25)).toBeCloseTo(
      monodFactor(4, plantsDefaults.highCo2HalfSaturation) / monodFactor(25, plantsDefaults.highCo2HalfSaturation),
      12
    );
  });
});

describe('computePlantVitality', () => {
  it('holds a fed plant at full condition at 100', () => {
    expect(computePlantVitality(ctx(makePlant('anubias'), makeResources())).newCondition).toBe(100);
  });

  it('heals the points its reserve paid for, at its price per point', () => {
    const plant = makePlant('amazon_sword', { condition: 50 });
    const price = repairPrice(plant.budget, plantParams('amazon_sword', plantsDefaults), plantsDefaults);
    const paid = { ...PAID, burned: { ...PAID.burned, healing: 3 * price } };
    const healed = computePlantVitality(ctx(plant, makeResources({ light: 0 }), paid));
    expect(healed.breakdown.healed).toBeCloseTo(3, 12);
    const unhealed = computePlantVitality(ctx(plant, makeResources({ light: 0 })));
    expect(healed.newCondition - unhealed.newCondition).toBeCloseTo(3, 12);
  });

  it('costs a fed plant nothing through a scheduled night', () => {
    const night = makeResources({ light: 0, lightByHour: litDay(90, 12) });
    const result = computePlantVitality(ctx(makePlant('monte_carlo'), night));
    expect(result.breakdown.damageRate).toBe(0);
    expect(result.newCondition).toBe(100);
  });

  it('Anubias holds at 100 even with low CO2 (low-tech tolerance)', () => {
    expect(computePlantVitality(ctx(makePlant('anubias'), makeResources({ co2: 2 }))).newCondition).toBe(100);
  });
});

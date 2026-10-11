import { describe, it, expect } from 'vitest';
import { bloomParams, plantParams, unitParams } from './params.js';
import { plantsDefaults, quotaMaxMeta, quotaMinMeta, type PlantsConfig } from '../config/plants.js';
import { NUTRIENTS, type Nutrient, type VectorMeta } from '../config/nutrients.js';
import { CO2_TO_CH2O_MASS_RATIO } from '../core/chemistry.js';
import { maxReserveDensity, structureOrganics } from '../systems/reserve.js';
import { offerCarbon, photosynthateOf, plantFixer } from '../systems/photosynthesis.js';
import { floraStressors, metabolicRateUnits } from '../systems/flora.js';
import { rateUnits, tissueMass } from '../plants/canopy.js';
import { PLANT_SPECIES_DATA, plantTraits, type PlantSpecies } from '../plants/species.js';
import { ALGAE, ALGAE_KINDS, bloomRateUnits, bloomTissue } from '../algae/index.js';
import { plantRecord } from '../tests/plant.js';
import { droopFactor, fullDroopFactor, stocked, type FloraParams } from '../systems/flora-budget.js';
import { createSimulation } from '../state.js';

const config = plantsDefaults;
const SPECIES = Object.keys(PLANT_SPECIES_DATA) as PlantSpecies[];

/** A unit's tissue in grams and the rate units it metabolises at. */
const units = [
  ...SPECIES.map((species) => ({
    name: species,
    p: plantParams(species, config),
    grams: tissueMass(species, 60),
    rated: metabolicRateUnits(rateUnits({ species, size: 60 }), plantTraits(species)),
  })),
  ...ALGAE_KINDS.map((kind) => ({
    name: kind,
    p: bloomParams(kind, config),
    grams: bloomTissue(40, 120, ALGAE[kind]),
    rated: bloomRateUnits(bloomTissue(40, 120, ALGAE[kind]), ALGAE[kind]),
  })),
];

const close = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 * Math.abs(b);

describe.each(units)('$name', ({ p, grams, rated }) => {
  it('assimilates at saturation the photosynthate its rate units fix', () => {
    const [offered] = offerCarbon(
      [{ metabolicRateUnits: rated, lightResponse: 1, omega: 1, co2HalfSaturation: 0 }],
      1e9,
      100,
      config
    );
    expect(close(p.pAm * grams, photosynthateOf(offered))).toBe(true);
  });

  it('owes in maintenance the base respiration rate’s share of what its rate units fix', () => {
    const fixed = rated * config.co2PerRateUnit * config.baseRespirationRate;
    expect(close(p.pM * grams, (fixed * CO2_TO_CH2O_MASS_RATIO) / 1000)).toBe(true);
  });

  it('holds a gram of organics in a gram of structure, built at κ_G of what it costs', () => {
    expect(structureOrganics(p)).toBeCloseTo(1, 12);
    expect(p.kappaG).toBeLessThan(1);
  });

  it('has room in every store above its structure’s own content', () => {
    expect(NUTRIENTS.every((n) => p.qMax[n] > p.qMin[n] && p.qMin[n] > 0 && p.storeFillRate[n] > 0)).toBe(true);
  });
});

describe('pace', () => {
  const slow = plantParams('anubias', config);
  const fast = plantParams('monte_carlo', config);
  const ratio = PLANT_SPECIES_DATA.monte_carlo.growthRate / PLANT_SPECIES_DATA.anubias.growthRate;
  const paced = ['pAm', 'v', 'pM'] as const;
  const unpaced: readonly (keyof FloraParams)[] = ['kappa', 'EG', 'kappaG', 'qMin', 'qMax', 'storeFillRate'];

  it('runs every carbon rate faster by its growth rate alone, and nothing else', () => {
    expect(paced.every((key) => close(fast[key], ratio * slow[key]))).toBe(true);
    expect(close(maxReserveDensity(fast), maxReserveDensity(slow))).toBe(true);
    expect(unpaced.every((key) => JSON.stringify(fast[key]) === JSON.stringify(slow[key]))).toBe(true);
  });

  it('fills every kind’s reserve to the plants’ E_m', () => {
    const everyKind = (plantsConfig: PlantsConfig): FloraParams[] => [
      plantParams('anubias', plantsConfig),
      ...ALGAE_KINDS.map((kind) => bloomParams(kind, plantsConfig)),
    ];
    const fills = (plantsConfig: PlantsConfig): boolean =>
      everyKind(plantsConfig).every((p) => close(maxReserveDensity(p), plantsConfig.reserveCapacity));
    expect(fills(config)).toBe(true);
    expect(fills({ ...config, reserveCapacity: 2 * config.reserveCapacity })).toBe(true);
  });
});

describe('vigour', () => {
  const vigour = 0.1;
  const own = unitParams({ species: 'amazon_sword', vigour }, config);
  const species = plantParams('amazon_sword', config);

  it('lifts a unit’s assimilation ceiling by 1 + vigour, its reserve filling to the same E_m on the same upkeep', () => {
    expect(close(own.pAm, (1 + vigour) * species.pAm)).toBe(true);
    expect(close(maxReserveDensity(own), maxReserveDensity(species))).toBe(true);
    expect(own.pM).toBe(species.pM);
  });

  it('is offered at saturation the photosynthate its own ceiling holds', () => {
    const unit = plantRecord({ id: 'sword', species: 'amazon_sword', size: 60, vigour });
    const [offered] = offerCarbon([{ ...plantFixer(unit, 1e9, 1, config), co2HalfSaturation: 0 }], 1e9, 100, config);
    expect(close(own.pAm * unit.budget.structure, photosynthateOf(offered))).toBe(true);
  });
});

describe('quotas', () => {
  it('come off the plants’ config for a plant and off its kind for a bloom', () => {
    const richer = { ...config, quotaMin: { ...config.quotaMin, nitrate: 2 * config.quotaMin.nitrate } };
    expect(close(plantParams('anubias', richer).qMin.nitrate, 2 * plantParams('anubias', config).qMin.nitrate)).toBe(true);
    expect(ALGAE_KINDS.every((kind) => bloomParams(kind, richer).qMin.nitrate === bloomParams(kind, config).qMin.nitrate)).toBe(
      true
    );
  });

  const range = (meta: VectorMeta<Nutrient>[], n: Nutrient): VectorMeta<Nutrient> => meta.find((m) => m.key === n)!;

  it('leave a store room above Q_min at every setting: each floor’s range sits below its ceiling’s', () => {
    expect(NUTRIENTS.every((n) => range(quotaMinMeta, n).max < range(quotaMaxMeta, n).min)).toBe(true);
  });

  it('leave full stores unharmed at the shipped Droop edge, at every corner of their bounds', () => {
    const ends = (meta: VectorMeta<Nutrient>[], n: Nutrient): number[] => [range(meta, n).min, range(meta, n).max];
    const corners = NUTRIENTS.reduce<PlantsConfig[]>(
      (configs, n) =>
        configs.flatMap((c) =>
          ends(quotaMinMeta, n).flatMap((least) =>
            ends(quotaMaxMeta, n).map((most) => ({
              ...c,
              quotaMin: { ...c.quotaMin, [n]: least },
              quotaMax: { ...c.quotaMax, [n]: most },
            }))
          )
        ),
      [config]
    );
    const harm = (p: FloraParams, plantsConfig: PlantsConfig): number =>
      floraStressors({
        traits: plantTraits('amazon_sword'),
        resources: createSimulation({ tankCapacity: 100 }).resources,
        plantsConfig: plantsConfig,
        wellFed: 1,
        droop: droopFactor(stocked(1, p), p),
        fullDroop: fullDroopFactor(p),
        starvation: 0,
        co2HalfSaturation: 0,
      }).find(({ key }) => key === 'nutrients')!.amount;

    expect(corners).toHaveLength(4 ** NUTRIENTS.length);
    expect(corners.every((c) => SPECIES.every((species) => harm(plantParams(species, c), c) === 0))).toBe(true);
    expect(Math.min(...corners.map((c) => fullDroopFactor(plantParams('amazon_sword', c))))).toBeLessThan(config.droopEdge);
  });
});

describe('the soma share', () => {
  it('leaves a plant a share for offshoots and a bloom none: its growth is its reproduction', () => {
    expect(SPECIES.every((species) => plantParams(species, config).kappa < 1)).toBe(true);
    expect(ALGAE_KINDS.every((kind) => bloomParams(kind, config).kappa === 1)).toBe(true);
  });
});

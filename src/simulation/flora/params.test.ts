import { describe, it, expect } from 'vitest';
import { bloomParams, plantParams } from './params.js';
import { plantsDefaults, quotaMaxMeta, quotaMinMeta, type PlantsConfig } from '../config/plants.js';
import { NUTRIENTS } from '../config/nutrients.js';
import { CO2_TO_CH2O_MASS_RATIO } from '../core/chemistry.js';
import { maxReserveDensity, structureOrganics } from '../systems/reserve.js';
import { calculatePhotosynthesis } from '../systems/photosynthesis.js';
import { calculateRespiration } from '../systems/respiration.js';
import { metabolicRateUnits } from '../systems/flora.js';
import { tissueMass } from '../systems/plant-lifecycle.js';
import { rateUnits } from '../plants/canopy.js';
import { PLANT_SPECIES_DATA, plantTraits, type PlantSpecies } from '../plants/species.js';
import { ALGAE, ALGAE_KINDS, bloomRateUnits, bloomTissue } from '../algae/index.js';
import type { FloraParams } from '../systems/flora-budget.js';

const config = plantsDefaults;
const SPECIES = Object.keys(PLANT_SPECIES_DATA) as PlantSpecies[];

/** A unit's tissue in grams and the rate units it metabolises at. */
const units = [
  ...SPECIES.map((species) => ({
    name: species,
    p: plantParams(species, config),
    grams: tissueMass(species, 60, config),
    rated: metabolicRateUnits(rateUnits({ species, size: 60 }), plantTraits(species)),
  })),
  ...ALGAE_KINDS.map((kind) => ({
    name: kind,
    p: bloomParams(kind, config),
    grams: bloomTissue(40, 120, ALGAE[kind]),
    rated: bloomRateUnits(40, 120, ALGAE[kind], config),
  })),
];

const photosynthate = (co2Mg: number): number => (co2Mg * CO2_TO_CH2O_MASS_RATIO) / 1000;
const close = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 * Math.abs(b);

describe.each(units)('$name', ({ p, grams, rated }) => {
  it('assimilates at saturation the photosynthate its rate units fix', () => {
    const { co2ConsumedMg } = calculatePhotosynthesis(
      [{ metabolicRateUnits: rated, lightResponse: 1, sufficiency: 1, co2HalfSaturation: 0 }],
      1e9,
      100,
      config
    );
    expect(close(p.pAm * grams, photosynthate(co2ConsumedMg))).toBe(true);
  });

  it('pays in maintenance what its rate units respire', () => {
    const { co2ProducedMg } = calculateRespiration(rated, config.respirationReferenceTemp, 1e12, config);
    expect(close(p.pM * grams, photosynthate(co2ProducedMg))).toBe(true);
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
    const everyKind = (c: PlantsConfig): FloraParams[] => [
      plantParams('anubias', c),
      ...ALGAE_KINDS.map((kind) => bloomParams(kind, c)),
    ];
    const fills = (c: PlantsConfig): boolean =>
      everyKind(c).every((p) => close(maxReserveDensity(p), c.reserveCapacity));
    expect(fills(config)).toBe(true);
    expect(fills({ ...config, reserveCapacity: 2 * config.reserveCapacity })).toBe(true);
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

  it('leave a store room above Q_min at every setting: each floor’s range sits below its ceiling’s', () => {
    expect(NUTRIENTS.every((n) => quotaMinMeta.find((m) => m.key === n)!.max < quotaMaxMeta.find((m) => m.key === n)!.min)).toBe(
      true
    );
  });
});

describe('the soma share', () => {
  it('leaves a plant a share for offshoots and a bloom none: its growth is its reproduction', () => {
    expect(SPECIES.every((species) => plantParams(species, config).kappa < 1)).toBe(true);
    expect(ALGAE_KINDS.every((kind) => bloomParams(kind, config).kappa === 1)).toBe(true);
  });
});

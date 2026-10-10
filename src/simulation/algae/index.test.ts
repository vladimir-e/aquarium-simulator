import { describe, it, expect } from 'vitest';
import {
  ALGAE,
  ALGAE_KINDS,
  bloomFeeder,
  bloomLight,
  bloomRateUnits,
  bloomTissue,
  EMPTY_BLOOM,
  landSpores,
  massOf,
  sporesBuilt,
} from './index.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { mapNutrients, NUTRIENTS } from '../config/nutrients.js';
import { dailyLightIntegral } from '../equipment/light.js';
import { dailyLightEdge, TISSUE_PER_RATE_UNIT } from '../systems/flora.js';
import { formHalfSaturations, poolDraws } from '../systems/nutrients.js';
import { stocked, type FloraState } from '../systems/flora-budget.js';
import { bloomParams } from '../flora/params.js';
import { PLANT_SPECIES_DATA, plantTraits, type PlantSpecies } from '../plants/species.js';

const config = DEFAULT_CONFIG;

describe.each(ALGAE_KINDS)('%s', (kind) => {
  const traits = ALGAE[kind];
  const p = bloomParams(kind, config.plants);

  it('lives in any water a plant does: its temperature and pH bands hold every species’ own', () => {
    for (const plant of (Object.keys(PLANT_SPECIES_DATA) as PlantSpecies[]).map(plantTraits)) {
      for (const band of ['tolerableTemp', 'tolerablePH'] as const) {
        expect(traits[band][0]).toBeLessThanOrEqual(plant[band][0]);
        expect(traits[band][1]).toBeGreaterThanOrEqual(plant[band][1]);
      }
    }
  });

  describe('bloomTissue', () => {
    it('scales with the mass and with the size of its habitat', () => {
      expect(bloomTissue(100, 100, traits)).toBeCloseTo(2 * bloomTissue(50, 100, traits), 12);
      expect(bloomTissue(100, 284, traits)).toBeGreaterThan(bloomTissue(100, 38, traits));
      expect(bloomTissue(100, 1, traits)).toBe(traits.tissueDensity);
      expect(bloomTissue(0, 284, traits)).toBe(0);
    });

    it('reads backwards as massOf, and no habitat holds any mass', () => {
      for (const mass of [0, 0.3, 42, 100]) expect(massOf(bloomTissue(mass, 284, traits), 284, traits)).toBeCloseTo(mass, 12);
      expect(massOf(1, 0, traits)).toBe(0);
    });
  });

  describe('bloomRateUnits', () => {
    it('rates its tissue on the plants’ relation, at its growth rate', () => {
      const units = bloomRateUnits(4, traits);
      expect(units).toBeCloseTo((4 / TISSUE_PER_RATE_UNIT) * traits.growthRate, 12);
      expect(bloomRateUnits(4, { ...traits, growthRate: 2 * traits.growthRate })).toBeCloseTo(2 * units, 12);
    });
  });

  describe('the bloom’s light', () => {
    it('reads the day and the hour through its habitat’s gain, and its need against its own edge', () => {
      const lightByHour = Array.from({ length: 24 }, (_, hour) => (hour < 8 ? 40 : 0));
      const gain = 0.8;
      const light = bloomLight({ light: 40, lightByHour }, gain, traits);
      expect(light.par).toBeCloseTo(40 * gain, 12);
      expect(light.dailyLight).toBeCloseTo(dailyLightIntegral(lightByHour) * gain, 12);
      expect(light.needShare).toBeCloseTo(light.dailyLight / dailyLightEdge(traits), 12);
    });
  });

  describe('bloomFeeder', () => {
    it('feeds from the water alone', () => {
      expect(bloomFeeder(traits, config.nutrients).rootShare).toBe(0);
      const water = { stock: { ammonia: 1, nitrate: 100, phosphate: 10, potassium: 100, iron: 1 }, volume: 10 };
      const [fromWater, fromBed] = poolDraws([water, water], bloomFeeder(traits, config.nutrients));
      expect(fromWater.weight).toBe(1);
      expect(fromBed.weight).toBe(0);
    });

    it('takes nitrogen and phosphorus on its own affinities, and every other nutrient as a plant of its demand tier does', () => {
      expect(bloomFeeder(traits, config.nutrients).halfSaturation).toEqual({
        ...formHalfSaturations(config.nutrients.demand[traits.nutrientDemand], config.nutrients),
        ammonia: traits.ammoniaHalfSaturation,
        nitrate: traits.nitrateHalfSaturation,
        phosphate: traits.phosphateHalfSaturation,
      });
    });
  });

  describe('sporesBuilt', () => {
    const asked = (structure: number): Record<(typeof NUTRIENTS)[number], number> => mapNutrients((n) => p.qMin[n] * structure);

    it('builds every gram asked for when the water delivers it all, unfed, with no stores', () => {
      const built = sporesBuilt(0.01, asked(0.01), p);
      expect(built.structure).toBeCloseTo(0.01, 15);
      expect(built.reserve).toBe(0);
      for (const n of NUTRIENTS) expect(built.stores[n]).toBeCloseTo(0, 15);
    });

    it('builds what its scarcest nutrient delivered, the rest of the delivery in its stores', () => {
      const delivered = { ...asked(0.01), phosphate: asked(0.004).phosphate };
      const built = sporesBuilt(0.01, delivered, p);
      expect(built.structure).toBeCloseTo(0.004, 15);
      for (const n of NUTRIENTS) expect(built.stores[n] + p.qMin[n] * built.structure).toBeCloseTo(delivered[n], 15);
    });
  });

  describe('landSpores', () => {
    const standing = (structure: number, condition: number): { budget: FloraState; condition: number } => ({
      budget: stocked(structure, p),
      condition,
    });

    it('lands them at condition 100, every pool beside the bloom’s own, diluting its deficit by structure', () => {
      const spores = stocked(1, p);
      const landed = landSpores(standing(3, 40), spores);
      expect(landed.budget.structure).toBeCloseTo(4, 15);
      expect(landed.budget.reserve).toBeCloseTo(stocked(4, p).reserve, 15);
      expect(landed.condition).toBeCloseTo((40 * 3 + 100 * 1) / 4, 12);
    });

    it('leaves a bloom with nothing landing as it was', () => {
      expect(landSpores(standing(5, 30), EMPTY_BLOOM.budget)).toEqual(standing(5, 30));
    });

    it('makes a bloom that died back what its spores are', () => {
      const spores = stocked(0.002, p);
      expect(landSpores(null, spores)).toEqual({ budget: spores, condition: 100 });
      expect(landSpores(null, EMPTY_BLOOM.budget)).toEqual(EMPTY_BLOOM);
    });
  });
});

describe('green water beside film', () => {
  it('is faster and hungrier: it grows faster, and every nitrogen and phosphorus form half-saturates it higher', () => {
    for (const key of ['growthRate', 'ammoniaHalfSaturation', 'nitrateHalfSaturation', 'phosphateHalfSaturation'] as const) {
      expect(ALGAE.greenWater[key]).toBeGreaterThan(ALGAE.film[key]);
    }
  });
});

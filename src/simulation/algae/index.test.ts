import { describe, it, expect } from 'vitest';
import {
  ALGAE,
  ALGAE_KINDS,
  allelopathy,
  bloomFeeder,
  bloomFixer,
  bloomLight,
  bloomRateUnits,
  bloomTissue,
  EMPTY_BLOOM,
  landSpores,
  massOf,
  sporesBuilt,
  sporesUptake,
  thrivingPlantDensity,
} from './index.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { mapNutrients, NUTRIENTS, ZERO_FORMS } from '../config/nutrients.js';
import { dailyLightIntegral } from '../equipment/light.js';
import { dailyLightEdge, TISSUE_PER_RATE_UNIT } from '../systems/flora.js';
import { formHalfSaturations, poolDraws } from '../systems/nutrients.js';
import { floraNutrients, stocked, type FloraState } from '../systems/flora-budget.js';
import type { CarbonFixer } from '../systems/photosynthesis.js';
import { bloomParams } from '../flora/params.js';
import { PLANT_SPECIES_DATA, plantTraits, type PlantSpecies } from '../plants/species.js';
import { getPlantPower } from '../systems/plant-power.js';
import { NO_STRESS } from '../systems/reserve.js';
import { plantRecord } from '../tests/plant.js';
import type { Plant } from '../state.js';

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

    it('builds what its scarcest nutrient delivered, its stores the rest of the delivery as far as full', () => {
      const delivered = {
        ...asked(0.01),
        nitrate: p.qMax.nitrate * 0.01,
        phosphate: asked(0.004).phosphate,
        iron: asked(0.0041).iron,
      };
      const built = sporesBuilt(0.01, delivered, p);
      expect(built.structure).toBeCloseTo(0.004, 15);
      expect(built.stores.phosphate).toBeCloseTo(0, 15);
      expect(built.stores.iron).toBeCloseTo(delivered.iron - p.qMin.iron * built.structure, 15);
      for (const n of NUTRIENTS) expect(built.stores[n]).toBeLessThanOrEqual((p.qMax[n] - p.qMin[n]) * built.structure * (1 + 1e-12));
      expect(built.stores.nitrate).toBeCloseTo((p.qMax.nitrate - p.qMin.nitrate) * built.structure, 15);
    });

    it('builds nothing, and holds nothing, with a nutrient absent', () => {
      const built = sporesBuilt(0.01, { ...asked(0.01), iron: 0 }, p);
      expect(built.structure).toBe(0);
      for (const n of NUTRIENTS) expect(built.stores[n]).toBe(0);
    });
  });

  describe('sporesUptake', () => {
    it('takes up each form at the share of its nutrient the spores hold, so the water keeps what they could not', () => {
      const delivered = mapNutrients((n) => p.qMax[n] * 0.01);
      const built = sporesBuilt(0.01, { ...delivered, phosphate: p.qMin.phosphate * 0.005 }, p);
      const uptake = { ammonia: 0.3, nitrate: 0.7, phosphate: p.qMin.phosphate * 0.005, potassium: delivered.potassium, iron: delivered.iron };
      const taken = sporesUptake(uptake, { ...delivered, phosphate: uptake.phosphate }, built, p);
      const held = floraNutrients(built, p);
      expect(taken.phosphate).toBeCloseTo(uptake.phosphate, 15);
      expect(taken.ammonia / uptake.ammonia).toBeCloseTo(held.nitrate / delivered.nitrate, 12);
      expect(taken.nitrate / uptake.nitrate).toBeCloseTo(held.nitrate / delivered.nitrate, 12);
      expect(taken.iron).toBeCloseTo(held.iron, 15);
      expect(sporesUptake(uptake, delivered, sporesBuilt(0.01, { ...delivered, iron: 0 }, p), p)).toEqual(ZERO_FORMS);
    });
  });

  describe('bloomFixer', () => {
    it('lowers the ceiling it fixes to by its assimilation stress, and with it its draw', () => {
      const bloom = { budget: stocked(2, p), condition: 100 };
      const light = { par: 30, dailyLight: 1, needShare: 1 };
      const fixer = (assimilation: number): CarbonFixer =>
        bloomFixer(bloom, light, 1, { ...NO_STRESS, assimilation }, traits, config.plants);
      expect(fixer(0.4).metabolicRateUnits).toBeCloseTo(0.4 * fixer(1).metabolicRateUnits, 15);
      expect({ ...fixer(0.4), metabolicRateUnits: 0 }).toEqual({ ...fixer(1), metabolicRateUnits: 0 });
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

describe('allelopathy', () => {
  const LITRES = 100;
  const sword = (condition: number, id = `s${condition}`): Plant =>
    plantRecord({ id, species: 'amazon_sword', size: 100, condition });
  const assimilation = (plants: Plant[], litres = LITRES, severity = config.algae.allelopathySeverity): number =>
    allelopathy(plants, litres, { allelopathySeverity: severity }).assimilation;

  it('doses the water with thriving plant per litre: a dying one adds nothing, a half-well one half', () => {
    expect(thrivingPlantDensity([sword(100)], LITRES)).toBeCloseTo(getPlantPower([sword(100)]) / LITRES, 12);
    expect(thrivingPlantDensity([sword(0)], LITRES)).toBe(0);
    expect(thrivingPlantDensity([sword(50)], LITRES)).toBeCloseTo(thrivingPlantDensity([sword(100)], LITRES) / 2, 12);
    expect(thrivingPlantDensity([sword(100)], 0)).toBe(0);
  });

  it('lowers assimilation alone, from 1 with no plants, falling with the dose and never reaching 0', () => {
    const one = allelopathy([sword(100)], LITRES, config.algae);
    expect({ ...one, assimilation: 1 }).toEqual(NO_STRESS);
    expect(assimilation([])).toBe(1);
    const doses = [1, 2, 4, 8, 64].map((n) => assimilation(Array.from({ length: n }, (_, i) => sword(100, `s${i}`))));
    for (let i = 1; i < doses.length; i++) expect(doses[i]).toBeLessThan(doses[i - 1]);
    expect(doses.at(-1)).toBeGreaterThan(0);
  });

  it('inhibits hyperbolically with the dose: halved where severity × dose is 1, and nothing at severity 0', () => {
    const dose = thrivingPlantDensity([sword(100)], LITRES);
    expect(assimilation([sword(100)], LITRES, 1 / dose)).toBeCloseTo(0.5, 12);
    expect(assimilation([sword(100)], LITRES, 3 / dose)).toBeCloseTo(0.25, 12);
    expect(assimilation([sword(100)], LITRES, 0)).toBe(1);
    expect(assimilation([sword(100)], 2 * LITRES)).toBeGreaterThan(assimilation([sword(100)]));
  });
});

describe('green water beside film', () => {
  it('is faster and hungrier: it grows faster, and every nitrogen and phosphorus form half-saturates it higher', () => {
    for (const key of ['growthRate', 'ammoniaHalfSaturation', 'nitrateHalfSaturation', 'phosphateHalfSaturation'] as const) {
      expect(ALGAE.greenWater[key]).toBeGreaterThan(ALGAE.film[key]);
    }
  });
});

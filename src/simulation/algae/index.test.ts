import { describe, it, expect } from 'vitest';
import {
  ALGAE,
  ALGAE_KINDS,
  bloomFeeder,
  bloomLight,
  bloomRateUnits,
  bloomTissue,
  landSpores,
  loseBloom,
  massBought,
  purchaseBloom,
  supplyBloom,
} from './index.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { plantsConfigMeta, type PlantsConfig } from '../config/plants.js';
import { dailyLightIntegral } from '../equipment/light.js';
import { bankConversion, bankDraw, dailyLightEdge, shedShare, tissuePerRateUnit } from '../systems/flora.js';
import { formHalfSaturations, poolDraws } from '../systems/nutrients.js';
import { PLANT_SPECIES_DATA, plantTraits, type PlantSpecies } from '../plants/species.js';
import type { AlgaeState } from '../state.js';

const config = DEFAULT_CONFIG;
const plants = config.plants;
const bloom = (fields: Partial<AlgaeState>): AlgaeState => ({ mass: 10, condition: 100, surplus: 0, ...fields });
const paid = ({ before, after }: { before: AlgaeState; after: AlgaeState }): number => before.surplus - after.surplus;

describe.each(ALGAE_KINDS)('%s', (kind) => {
  const traits = ALGAE[kind];
  const conversion = bankConversion(traits, plants);

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
  });

  describe('bloomRateUnits', () => {
    it('rates its tissue on the plants’ relation, at its growth rate', () => {
      const units = bloomRateUnits(40, 100, traits, plants);
      expect(units).toBeCloseTo((bloomTissue(40, 100, traits) / tissuePerRateUnit(plants)) * traits.growthRate, 12);
      expect(bloomRateUnits(40, 100, { ...traits, growthRate: 2 * traits.growthRate }, plants)).toBeCloseTo(2 * units, 12);
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

  describe('purchaseBloom', () => {
    it('grows the mass on the exact logistic, at the rate the plants’ draw buys on an empty habitat', () => {
      for (const mass of [0.01, 20, 80, 99.9]) {
        const { after } = purchaseBloom(bloom({ mass, surplus: 30 }), traits, plants);
        const r = (bankDraw(30, 0, plants) * conversion) / 100;
        expect(after.mass).toBeCloseTo((100 * mass) / (mass + (100 - mass) * Math.exp(-r)), 10);
      }
    });

    it('stays on the habitat at any rate, however far past the tunables, and an empty one stays empty', () => {
      for (const sizePerSurplus of [1e3, 1e6]) {
        for (const mass of [0, 0.01, 50, 99]) {
          const bought = purchaseBloom(bloom({ mass, surplus: 30 }), traits, { ...plants, sizePerSurplus });
          expect(bought.after.mass).toBeLessThanOrEqual(100);
          expect(bought.after.mass).toBeGreaterThanOrEqual(mass);
          expect(bought.after.mass > mass).toBe(mass > 0);
          expect(Number.isFinite(bought.after.surplus)).toBe(true);
        }
      }
    });

    it('buys mass in proportion to the mass standing, while the habitat is empty', () => {
      const grown = (mass: number): number => {
        const { before, after } = purchaseBloom(bloom({ mass, surplus: 10 }), traits, plants);
        return after.mass - before.mass;
      };
      expect(grown(0.02) / grown(0.01)).toBeCloseTo(2, 3);
    });

    it('buys the same e-fold with every bank point, and never pays more than the plants’ draw would', () => {
      for (const mass of [0.01, 20, 80]) {
        const bought = purchaseBloom(bloom({ mass, surplus: 10 }), traits, plants);
        expect(Math.log(bought.after.mass / mass) / paid(bought)).toBeCloseTo(conversion / 100, 10);
        expect(paid(bought)).toBeLessThanOrEqual(bankDraw(10, mass, plants));
      }
    });

    it('never fills its habitat, on the fullest bank at the fastest draw and conversion the tunables allow', () => {
      const max = (key: keyof PlantsConfig): number => plantsConfigMeta.find((knob) => knob.key === key)!.max;
      const fastest = { ...plants, growthDrawRate: max('growthDrawRate'), sizePerSurplus: max('sizePerSurplus') };
      for (const mass of [0.001, 10, 50, 90, 99.99, 100]) {
        const bought = purchaseBloom(bloom({ mass, surplus: max('surplusCap') }), traits, fastest);
        expect(bought.after.mass).toBeLessThanOrEqual(100);
        expect(bought.after.mass + bought.spores).toBeLessThanOrEqual(100);
        expect(bought.after.surplus).toBeGreaterThanOrEqual(0);
      }
    });

    it('buys and pays nothing on an empty bloom, and lands its spores through the taper after', () => {
      const empty = purchaseBloom(bloom({ mass: 0, surplus: 20 }), traits, plants);
      expect(empty.after).toEqual(empty.before);
      expect(empty.spores).toBe(traits.sporeRate);

      const standing = purchaseBloom(bloom({ mass: 40, surplus: 20 }), traits, plants);
      expect(standing.spores).toBeCloseTo(traits.sporeRate * (1 - standing.after.mass / 100), 15);
      expect(massBought(standing)).toBeCloseTo(standing.after.mass - 40 + standing.spores, 12);
    });

    it('buys nothing on a full habitat', () => {
      const full = purchaseBloom(bloom({ mass: 100, surplus: 10 }), traits, plants);
      expect(full.after).toEqual(full.before);
      expect(full.spores).toBe(0);
    });
  });

  describe('supplyBloom', () => {
    const bought = purchaseBloom(bloom({ mass: 20, surplus: 30 }), traits, plants);

    it('is the purchase at a full supply, and nothing at none', () => {
      const whole = supplyBloom(bought, 1, traits, plants);
      expect(whole.after.mass).toBeCloseTo(bought.after.mass, 12);
      expect(whole.after.surplus).toBeCloseTo(bought.after.surplus, 12);
      expect(whole.spores).toBe(bought.spores);
      expect(supplyBloom(bought, 0, traits, plants)).toEqual({ ...bought, after: bought.before, spores: 0 });
    });

    it('delivers that share of the tissue, and the bank pays for the e-folds that arrived', () => {
      const half = supplyBloom(bought, 0.5, traits, plants);
      expect(massBought(half)).toBeCloseTo(massBought(bought) / 2, 12);
      expect(Math.log(half.after.mass / bought.before.mass) / paid(half)).toBeCloseTo(conversion / 100, 10);
    });
  });

  describe('loseBloom', () => {
    it('sheds nothing at full condition, and more with the square of its deficit', () => {
      expect(loseBloom(bloom({ mass: 50 }), 100, traits, plants).shed).toBe(0);
      const at = (condition: number): number => loseBloom(bloom({ mass: 50, condition }), 100, traits, plants).shed;
      expect(at(50)).toBeCloseTo(4 * at(75), 12);
      expect(at(50)).toBeCloseTo(bloomTissue(50 * shedShare(50, plants), 100, traits), 12);
    });

    it('dies back at condition 0, bank and all, every gram of it to waste', () => {
      const { survivor: after, shed, died } = loseBloom(bloom({ mass: 50, condition: 0, surplus: 5 }), 100, traits, plants);
      expect(after).toBeNull();
      expect(shed + died).toBeCloseTo(bloomTissue(50, 100, traits), 12);
    });

    it('keeps every gram it holds: what is left and what is lost add up to what it was', () => {
      const before = bloom({ mass: 50, condition: 30 });
      const { survivor: after, shed, died } = loseBloom(before, 100, traits, plants);
      expect(bloomTissue(after!.mass, 100, traits) + shed + died).toBeCloseTo(bloomTissue(before.mass, 100, traits), 12);
    });
  });

  describe('landSpores', () => {
    it('lands them at condition 100 on an empty bank, blending both into the bloom by mass', () => {
      const landed = landSpores(bloom({ mass: 3, condition: 40, surplus: 7 }), 1);
      expect(landed.mass).toBe(4);
      expect(landed.condition).toBeCloseTo((40 * 3 + 100 * 1) / 4, 12);
      expect(landed.surplus).toBeCloseTo((7 * 3 + 0 * 1) / 4, 12);
    });

    it('leaves a healthy bloom whole and a bloom with nothing landing as it was', () => {
      expect(landSpores(bloom({ mass: 0.3, condition: 100 }), 0.1).condition).toBe(100);
      expect(landSpores(bloom({ mass: 5, condition: 30, surplus: 4 }), 0)).toEqual(bloom({ mass: 5, condition: 30, surplus: 4 }));
    });

    it('makes an empty bloom what its spores are, whatever came before it, bank and all', () => {
      const fresh = landSpores(bloom({ mass: 0, condition: 100 }), 0.002);
      expect(landSpores(null, 0.002)).toEqual(fresh);
      expect(landSpores(bloom({ mass: 0, condition: 3, surplus: 0.4 }), 0.002)).toEqual(fresh);
      expect(landSpores(null, 0)).toEqual(landSpores(bloom({ mass: 0, condition: 3, surplus: 0.4 }), 0));
      expect(landSpores(null, 0)).toEqual({ mass: 0, condition: 100, surplus: 0 });
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

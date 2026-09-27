import { describe, it, expect } from 'vitest';
import {
  ALGAE,
  bloomFeeder,
  bloomLight,
  bloomRateUnits,
  bloomTissue,
  columnGain,
  landSpores,
  loseBloom,
  massBought,
  purchaseBloom,
  supplyBloom,
} from './index.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { plantsConfigMeta, type PlantsConfig } from '../config/plants.js';
import { opticsDefaults } from '../config/optics.js';
import { dailyLightIntegral } from '../equipment/light.js';
import { bankConversion, bankDraw, dailyLightEdge, shedShare, tissuePerRateUnit } from '../systems/flora.js';
import { poolDraws } from '../systems/nutrients.js';
import type { AlgaeState } from '../state.js';

const config = DEFAULT_CONFIG;
const plants = config.plants;
const bloom = (fields: Partial<AlgaeState>): AlgaeState => ({ mass: 10, condition: 100, surplus: 0, ...fields });
const conversion = bankConversion(ALGAE, plants);
const paid = ({ before, after }: { before: AlgaeState; after: AlgaeState }): number => before.surplus - after.surplus;

describe('bloomTissue', () => {
  it('scales with the mass and with the litres of its habitat', () => {
    expect(bloomTissue(100, 100, ALGAE)).toBeCloseTo(2 * bloomTissue(50, 100, ALGAE), 12);
    expect(bloomTissue(100, 284, ALGAE)).toBeGreaterThan(bloomTissue(100, 38, ALGAE));
    expect(bloomTissue(100, 1, ALGAE)).toBe(ALGAE.tissuePerLitre);
    expect(bloomTissue(0, 284, ALGAE)).toBe(0);
  });
});

describe('bloomRateUnits', () => {
  it('rates its tissue on the plants’ relation, at its growth rate', () => {
    const units = bloomRateUnits(40, 100, ALGAE, plants);
    expect(units).toBeCloseTo((bloomTissue(40, 100, ALGAE) / tissuePerRateUnit(plants)) * ALGAE.growthRate, 12);
    expect(bloomRateUnits(40, 100, { ...ALGAE, growthRate: 2 * ALGAE.growthRate }, plants)).toBeCloseTo(2 * units, 12);
  });
});

describe('the bloom’s light', () => {
  it('is the mean of Beer–Lambert over the column, over the PAR at its floor', () => {
    const depth = 40;
    const k = opticsDefaults.waterAttenuationPerCm;
    const steps = 10_000;
    let sum = 0;
    for (let i = 0; i < steps; i++) sum += Math.exp(k * (depth - ((i + 0.5) / steps) * depth));
    expect(columnGain(depth, opticsDefaults)).toBeCloseTo(sum / steps, 6);
    expect(columnGain(depth, opticsDefaults)).toBeGreaterThan(1);
    expect(columnGain(depth, { ...opticsDefaults, waterAttenuationPerCm: 0 })).toBe(1);
  });

  it('reads the day and the hour through that gain, and its need against its own edge', () => {
    const lightByHour = Array.from({ length: 24 }, (_, hour) => (hour < 8 ? 40 : 0));
    const light = bloomLight({ light: 40, lightByHour }, 30, opticsDefaults, ALGAE);
    const gain = columnGain(30, opticsDefaults);
    expect(light.par).toBeCloseTo(40 * gain, 12);
    expect(light.dailyLight).toBeCloseTo(dailyLightIntegral(lightByHour) * gain, 12);
    expect(light.needShare).toBeCloseTo(light.dailyLight / dailyLightEdge(ALGAE), 12);
  });
});

describe('bloomFeeder', () => {
  it('feeds from the water alone', () => {
    expect(bloomFeeder(ALGAE, config.nutrients).rootShare).toBe(0);
    expect(bloomFeeder(ALGAE, config.nutrients).demand).toEqual(config.nutrients.demand[ALGAE.nutrientDemand]);
    const water = { stock: { nitrate: 100, phosphate: 10, potassium: 100, iron: 1 }, volume: 10 };
    const [fromWater, fromBed] = poolDraws([water, water], bloomFeeder(ALGAE, config.nutrients), config.nutrients);
    expect(fromWater.weight).toBe(1);
    expect(fromBed.weight).toBe(0);
  });
});

describe('purchaseBloom', () => {
  it('grows the mass on the exact logistic, at the rate the plants’ draw buys on an empty habitat', () => {
    for (const mass of [0.01, 20, 80, 99.9]) {
      const { after } = purchaseBloom(bloom({ mass, surplus: 30 }), ALGAE, plants);
      const r = (bankDraw(30, 0, plants) * conversion) / 100;
      expect(after.mass).toBeCloseTo((100 * mass) / (mass + (100 - mass) * Math.exp(-r)), 10);
    }
  });

  it('stays on the habitat at any rate, however far past the tunables, and an empty one stays empty', () => {
    for (const sizePerSurplus of [1e3, 1e6]) {
      for (const mass of [0, 0.01, 50, 99]) {
        const bought = purchaseBloom(bloom({ mass, surplus: 30 }), ALGAE, { ...plants, sizePerSurplus });
        expect(bought.after.mass).toBeLessThanOrEqual(100);
        expect(bought.after.mass).toBeGreaterThanOrEqual(mass);
        expect(bought.after.mass > mass).toBe(mass > 0);
        expect(Number.isFinite(bought.after.surplus)).toBe(true);
      }
    }
  });

  it('buys mass in proportion to the mass standing, while the habitat is empty', () => {
    const grown = (mass: number): number => {
      const { before, after } = purchaseBloom(bloom({ mass, surplus: 10 }), ALGAE, plants);
      return after.mass - before.mass;
    };
    expect(grown(0.02) / grown(0.01)).toBeCloseTo(2, 3);
  });

  it('buys the same e-fold with every bank point, and never pays more than the plants’ draw would', () => {
    for (const mass of [0.01, 20, 80]) {
      const bought = purchaseBloom(bloom({ mass, surplus: 10 }), ALGAE, plants);
      expect(Math.log(bought.after.mass / mass) / paid(bought)).toBeCloseTo(conversion / 100, 10);
      expect(paid(bought)).toBeLessThanOrEqual(bankDraw(10, mass, plants));
    }
  });

  it('never fills its habitat, on the fullest bank at the fastest draw and conversion the tunables allow', () => {
    const max = (key: keyof PlantsConfig): number => plantsConfigMeta.find((knob) => knob.key === key)!.max;
    const fastest = { ...plants, growthDrawRate: max('growthDrawRate'), sizePerSurplus: max('sizePerSurplus') };
    for (const mass of [0.001, 10, 50, 90, 99.99, 100]) {
      const bought = purchaseBloom(bloom({ mass, surplus: max('surplusCap') }), ALGAE, fastest);
      expect(bought.after.mass).toBeLessThanOrEqual(100);
      expect(bought.after.mass + bought.spores).toBeLessThanOrEqual(100);
      expect(bought.after.surplus).toBeGreaterThanOrEqual(0);
    }
  });

  it('buys and pays nothing on an empty bloom, and lands its spores through the taper after', () => {
    const empty = purchaseBloom(bloom({ mass: 0, surplus: 20 }), ALGAE, plants);
    expect(empty.after).toEqual(empty.before);
    expect(empty.spores).toBe(ALGAE.sporeRate);

    const standing = purchaseBloom(bloom({ mass: 40, surplus: 20 }), ALGAE, plants);
    expect(standing.spores).toBeCloseTo(ALGAE.sporeRate * (1 - standing.after.mass / 100), 15);
    expect(massBought(standing)).toBeCloseTo(standing.after.mass - 40 + standing.spores, 12);
  });

  it('buys nothing on a full habitat', () => {
    const full = purchaseBloom(bloom({ mass: 100, surplus: 10 }), ALGAE, plants);
    expect(full.after).toEqual(full.before);
    expect(full.spores).toBe(0);
  });
});

describe('supplyBloom', () => {
  const bought = purchaseBloom(bloom({ mass: 20, surplus: 30 }), ALGAE, plants);

  it('is the purchase at a full supply, and nothing at none', () => {
    const whole = supplyBloom(bought, 1, ALGAE, plants);
    expect(whole.after.mass).toBeCloseTo(bought.after.mass, 12);
    expect(whole.after.surplus).toBeCloseTo(bought.after.surplus, 12);
    expect(whole.spores).toBe(bought.spores);
    expect(supplyBloom(bought, 0, ALGAE, plants)).toEqual({ ...bought, after: bought.before, spores: 0 });
  });

  it('delivers that share of the tissue, and the bank pays for the e-folds that arrived', () => {
    const half = supplyBloom(bought, 0.5, ALGAE, plants);
    expect(massBought(half)).toBeCloseTo(massBought(bought) / 2, 12);
    expect(Math.log(half.after.mass / bought.before.mass) / paid(half)).toBeCloseTo(conversion / 100, 10);
  });
});

describe('loseBloom', () => {
  it('sheds nothing at full condition, and more with the square of its deficit', () => {
    expect(loseBloom(bloom({ mass: 50 }), 100, ALGAE, plants).shed).toBe(0);
    const at = (condition: number): number => loseBloom(bloom({ mass: 50, condition }), 100, ALGAE, plants).shed;
    expect(at(50)).toBeCloseTo(4 * at(75), 12);
    expect(at(50)).toBeCloseTo(bloomTissue(50 * shedShare(50, plants), 100, ALGAE), 12);
  });

  it('dies back at condition 0, bank and all, every gram of it to waste', () => {
    const { survivor: after, shed, died } = loseBloom(bloom({ mass: 50, condition: 0, surplus: 5 }), 100, ALGAE, plants);
    expect(after).toBeNull();
    expect(shed + died).toBeCloseTo(bloomTissue(50, 100, ALGAE), 12);
  });

  it('keeps every gram it holds: what is left and what is lost add up to what it was', () => {
    const before = bloom({ mass: 50, condition: 30 });
    const { survivor: after, shed, died } = loseBloom(before, 100, ALGAE, plants);
    expect(bloomTissue(after!.mass, 100, ALGAE) + shed + died).toBeCloseTo(bloomTissue(before.mass, 100, ALGAE), 12);
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

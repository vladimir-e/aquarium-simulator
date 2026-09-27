import { describe, it, expect } from 'vitest';
import {
  ALGAE,
  bloomFeeder,
  bloomLight,
  bloomRateUnits,
  bloomTissue,
  columnGain,
  loseBloom,
  massBought,
  purchaseBloom,
  supplyBloom,
} from './index.js';
import { algaeDailyLightEdge } from './traits.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { opticsDefaults } from '../config/optics.js';
import { dailyLightIntegral } from '../equipment/light.js';
import { shedShare, tissuePerRateUnit } from '../systems/plant-lifecycle.js';
import { poolDraws } from '../systems/nutrients.js';
import type { AlgaeState } from '../state.js';

const config = DEFAULT_CONFIG;
const bloom = (fields: Partial<AlgaeState>): AlgaeState => ({ mass: 10, condition: 100, surplus: 0, ...fields });
const noSpores = { ...config, algae: { ...config.algae, sporeRate: 0 } };

describe('bloomTissue', () => {
  it('scales with the mass and with the litres of its habitat', () => {
    expect(bloomTissue(100, 100, config.algae)).toBeCloseTo(2 * bloomTissue(50, 100, config.algae), 12);
    expect(bloomTissue(100, 284, config.algae)).toBeGreaterThan(bloomTissue(100, 38, config.algae));
    expect(bloomTissue(100, 1, config.algae)).toBe(config.algae.tissuePerLitre);
    expect(bloomTissue(0, 284, config.algae)).toBe(0);
  });
});

describe('bloomRateUnits', () => {
  it('rates its tissue on the plants’ relation, at its growth rate', () => {
    const units = bloomRateUnits(40, 100, ALGAE, config);
    expect(units).toBeCloseTo(
      (bloomTissue(40, 100, config.algae) / tissuePerRateUnit(config.plants)) * ALGAE.growthRate,
      12
    );
    expect(bloomRateUnits(40, 100, { ...ALGAE, growthRate: 2 * ALGAE.growthRate }, config)).toBeCloseTo(2 * units, 12);
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
    expect(light.needShare).toBeCloseTo(light.dailyLight / algaeDailyLightEdge(ALGAE), 12);
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
  it('buys mass in proportion to the mass standing, while the habitat is empty', () => {
    const small = massBought(purchaseBloom(bloom({ mass: 0.01, surplus: 10 }), ALGAE, noSpores));
    const double = massBought(purchaseBloom(bloom({ mass: 0.02, surplus: 10 }), ALGAE, noSpores));
    expect(double / small).toBeCloseTo(2, 3);
  });

  it('tapers the draw as its habitat fills, and buys nothing at a full one', () => {
    const share = (mass: number): number => {
      const bought = purchaseBloom(bloom({ mass, surplus: 10 }), ALGAE, noSpores);
      return massBought(bought) / mass;
    };
    expect(share(75) / share(25)).toBeCloseTo(0.25 / 0.75, 10);
    const full = purchaseBloom(bloom({ mass: 100, surplus: 10 }), ALGAE, config);
    expect(full.after).toEqual(full.before);
  });

  it('draws the bank at the plants’ rate, day and night, and pays only what it drew', () => {
    const { before, after } = purchaseBloom(bloom({ mass: 20, surplus: 10 }), ALGAE, noSpores);
    expect(before.surplus - after.surplus).toBeCloseTo(10 * config.plants.growthDrawRate * 0.8, 12);
    expect(massBought({ before, after })).toBeCloseTo(
      (20 * (before.surplus - after.surplus) * ALGAE.growthRate * config.plants.sizePerSurplus) / 100,
      12
    );
  });

  it('lands spores on an empty tank with an empty bank', () => {
    const { after } = purchaseBloom(bloom({ mass: 0, surplus: 0 }), ALGAE, config);
    expect(after.mass).toBe(config.algae.sporeRate);
    expect(after.surplus).toBe(0);
  });
});

describe('supplyBloom', () => {
  it('delivers the share of the purchase the water supplied', () => {
    const bought = purchaseBloom(bloom({ mass: 20, surplus: 10 }), ALGAE, config);
    expect(supplyBloom(bought, 1)).toEqual(bought.after);
    expect(supplyBloom(bought, 0)).toEqual(bought.before);
    const half = supplyBloom(bought, 0.5);
    expect(half.mass - bought.before.mass).toBeCloseTo(massBought(bought) / 2, 12);
    expect(bought.before.surplus - half.surplus).toBeCloseTo((bought.before.surplus - bought.after.surplus) / 2, 12);
  });
});

describe('loseBloom', () => {
  it('sheds nothing at full condition, and more with the square of its deficit', () => {
    expect(loseBloom(bloom({ mass: 50 }), 100, config).shed).toBe(0);
    const at = (condition: number): number => loseBloom(bloom({ mass: 50, condition }), 100, config).shed;
    expect(at(50)).toBeCloseTo(4 * at(75), 12);
    expect(at(50)).toBeCloseTo(bloomTissue(50 * shedShare(50, config.plants), 100, config.algae), 12);
  });

  it('dies back at condition 0, bank and all, every gram of it to waste', () => {
    const { bloom: after, shed, died } = loseBloom(bloom({ mass: 50, condition: 0, surplus: 5 }), 100, config);
    expect(after).toEqual({ mass: 0, condition: 0, surplus: 0 });
    expect(shed + died).toBeCloseTo(bloomTissue(50, 100, config.algae), 12);
  });

  it('keeps every gram it holds: what is left and what is lost add up to what it was', () => {
    const before = bloom({ mass: 50, condition: 30 });
    const { bloom: after, shed, died } = loseBloom(before, 100, config);
    expect(bloomTissue(after.mass, 100, config.algae) + shed + died).toBeCloseTo(
      bloomTissue(before.mass, 100, config.algae),
      12
    );
  });
});

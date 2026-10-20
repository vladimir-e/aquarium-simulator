import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { createSimulation, type Resources, type SimulationState } from '../state.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { decompositionDefaults, type DecompositionConfig } from '../config/decomposition.js';
import { ORGANIC_POOLS } from '../resources/types.js';
import { C_TO_CO2_MASS_RATIO, C_TO_O2_MASS_RATIO, MW_N, MW_NH3, MW_NO3 } from '../core/chemistry.js';
import { WASTE_NUTRIENTS } from '../config/nutrients.js';
import { addOrganics, NO_ORGANICS, portion, scaleOrganics, type Organics } from '../core/organics.js';
import { sum } from '../core/sum.js';
import { applyEffects, organicPool, type Effect } from '../core/effects.js';
import { LEAN, ofFood, organicsCloseTo } from '../tests/organics.js';
import {
  decompose,
  decompositionSystem,
  poolShares,
  rotPace,
  rotRates,
  settlingRate,
} from './decomposition.js';
import { nitrogenCycleSystem } from './nitrogen-cycle.js';
import { tierOxygen } from './index.js';

const config = decompositionDefaults;
const REF = config.referenceTemp;

function graveled(change: (draft: SimulationState) => void = () => {}): SimulationState {
  return produce(createSimulation({ tankCapacity: 100, substrate: { type: 'gravel' } }), (draft) => {
    draft.resources.flow = 0;
    change(draft);
  });
}

const water = (temperature: number, oxygen: number): Pick<Resources, 'temperature' | 'oxygen'> => ({ temperature, oxygen });
const totalRate = (rates: { aerobic: number; anaerobic: number }): number => rates.aerobic + rates.anaerobic;

describe('rotPace', () => {
  it('is 1 at the reference temperature and q10 per 10 °C either way', () => {
    expect(rotPace(config.referenceTemp)).toBeCloseTo(1, 12);
    expect(rotPace(config.referenceTemp + 10)).toBeCloseTo(config.q10, 12);
    expect(rotPace(config.referenceTemp - 10)).toBeCloseTo(1 / config.q10, 12);
  });
});

describe('rotRates', () => {
  it('scales every pool’s rate by the one pace', () => {
    for (const pool of ORGANIC_POOLS) {
      expect(totalRate(rotRates(pool, water(REF + 10, 8)))).toBeCloseTo(totalRate(rotRates(pool, water(REF, 8))) * config.q10, 12);
    }
  });

  it('runs the aerobic path at half its rate at the half-saturation constant', () => {
    for (const pool of ORGANIC_POOLS) {
      expect(rotRates(pool, water(REF, config.oxygenHalfSaturation)).aerobic).toBeCloseTo(config.rate[pool] / 2, 12);
    }
  });

  it('hands the anaerobic path the share of the rate oxygen leaves, at anaerobicShare of the pace', () => {
    for (const oxygen of [0, 0.05, 0.2, 1, 8]) {
      const { aerobic, anaerobic } = rotRates('waste', water(REF, oxygen));
      const full = config.rate.waste;
      expect(aerobic / full + anaerobic / (full * config.anaerobicShare)).toBeCloseTo(1, 12);
    }
  });

  it('rots on in water with no oxygen, slower, and draws none of it', () => {
    const anoxic = rotRates('mulm', water(REF, 0));
    expect(anoxic.aerobic).toBe(0);
    expect(anoxic.anaerobic).toBeCloseTo(config.rate.mulm * config.anaerobicShare, 12);
    expect(totalRate(anoxic)).toBeLessThan(totalRate(rotRates('mulm', water(REF, 8))));
  });

  it('slows smoothly as the water empties, never jumping', () => {
    let previous = Infinity;
    for (const oxygen of [8, 4, 2, 1, 0.5, 0.2, 0.1, 0.01, 0]) {
      const rate = totalRate(rotRates('food', water(REF, oxygen)));
      expect(rate).toBeLessThan(previous);
      previous = rate;
    }
  });
});

describe('settlingRate', () => {
  const at = (flow: number): number =>
    settlingRate(
      graveled((draft) => {
        draft.resources.flow = flow;
      })
    );

  it('halves at settlingHalfTurnover turnovers an hour', () => {
    expect(at(0)).toBe(config.settlingRate);
    expect(at(400)).toBeLessThan(at(0));
    expect(at(100 * config.settlingHalfTurnover)).toBeCloseTo(at(0) / 2, 12);
  });

  it('settles nothing without a bed or without water', () => {
    expect(settlingRate(createSimulation({ tankCapacity: 100 }))).toBe(0);
    expect(
      settlingRate(
        graveled((draft) => {
          draft.resources.water = 0;
        })
      )
    ).toBe(0);
  });
});

describe('poolShares', () => {
  const tank = graveled();

  it('takes 1 − e^−Σk of a pool, split between the paths by their rates', () => {
    for (const pool of ORGANIC_POOLS) {
      const rates = rotRates(pool, tank.resources);
      const settling = pool === 'mulm' ? 0 : settlingRate(tank);
      const shares = poolShares(pool, tank.resources, tank);
      const total = rates.aerobic + rates.anaerobic + settling;
      const perRate = (1 - Math.exp(-total)) / total;
      expect(shares.aerobic).toBeCloseTo(rates.aerobic * perRate, 12);
      expect(shares.anaerobic).toBeCloseTo(rates.anaerobic * perRate, 12);
      expect(shares.settling).toBeCloseTo(settling * perRate, 12);
    }
  });

  it('never takes more than the pool, however fast its paths are set', () => {
    const fierce: DecompositionConfig = { ...config, rate: { food: 50, waste: 50, mulm: 50 }, settlingRate: 50 };
    for (const pool of ORGANIC_POOLS) {
      const shares = poolShares(pool, tank.resources, tank, fierce);
      expect(shares.aerobic + shares.anaerobic + shares.settling).toBeLessThanOrEqual(1);
    }
  });

  it('settles food and waste on one law, and leaves the bed’s own mulm where it lies', () => {
    const settling = (pool: (typeof ORGANIC_POOLS)[number]): number =>
      poolShares(pool, tank.resources, tank, { ...config, rate: { food: 0, waste: 0, mulm: 0 } }).settling;
    expect(settling('food')).toBeGreaterThan(0);
    expect(settling('food')).toBe(settling('waste'));
    expect(settling('mulm')).toBe(0);
  });
});

describe('decompose', () => {
  const shares = poolShares('waste', water(REF, 8), graveled());

  it('takes the pool pro-rata, so what rots and what settles keep its composition', () => {
    const pool = portion(LEAN, 3);
    const hour = decompose(pool, shares);
    expect(hour.rotted).toEqual(organicsCloseTo(portion(pool, hour.rotted.grams), 12));
    expect(hour.settled).toEqual(organicsCloseTo(portion(pool, hour.settled.grams), 12));
  });

  it('turns all the carbon it rots to CO2 and draws oxygen for the aerobic share alone', () => {
    const pool = portion(LEAN, 3);
    const hour = decompose(pool, shares);
    const carbon = pool.carbon * 1000;
    expect(hour.co2).toBeCloseTo(hour.rotted.carbon * 1000 * C_TO_CO2_MASS_RATIO, 9);
    expect(hour.oxygen).toBeCloseTo(carbon * shares.aerobic * C_TO_O2_MASS_RATIO, 9);
  });

  it('makes CO2 and draws no oxygen in anoxic water', () => {
    const anoxic = poolShares('waste', water(REF, 0), graveled());
    const hour = decompose(ofFood(1), anoxic);
    expect(hour.oxygen).toBe(0);
    expect(hour.co2).toBeGreaterThan(0);
  });

  it('doubles with the pool', () => {
    const one = decompose(ofFood(1), shares);
    const two = decompose(ofFood(2), shares);
    expect(two.rotted).toEqual(organicsCloseTo(scaleOrganics(one.rotted, 2), 12));
    expect(two.co2).toBeCloseTo(2 * one.co2, 9);
    expect(two.oxygen).toBeCloseTo(2 * one.oxygen, 9);
  });
});

describe('decompositionSystem', () => {
  const tank = graveled((draft) => {
    draft.resources.food = ofFood(2);
    draft.resources.waste = portion(LEAN, 3);
    draft.equipment.substrate.organicReserve = addOrganics(draft.equipment.substrate.organicReserve, portion(LEAN, 1));
  });
  const effects = decompositionSystem.update(tank, DEFAULT_CONFIG, tierOxygen(tank, 'passive', DEFAULT_CONFIG));
  const after = applyEffects(tank, effects);
  const pools = (state: SimulationState): Organics => addOrganics(...ORGANIC_POOLS.map((pool) => organicPool(state, pool)));
  const total = (resource: Effect['resource']): number =>
    sum(effects.filter((effect) => effect.resource === resource).map((effect) => effect.delta as number));

  it('runs in the passive tier', () => {
    expect(decompositionSystem.tier).toBe('passive');
    expect(effects.every((effect) => effect.tier === 'passive')).toBe(true);
  });

  it('rots every pool', () => {
    for (const pool of ORGANIC_POOLS) {
      expect(effects.some((effect) => effect.resource === pool && typeof effect.delta !== 'number' && effect.delta.grams < 0)).toBe(true);
    }
  });

  it('sends the carbon it rots to the water as CO2, gram for gram', () => {
    const lost = pools(tank).carbon - pools(after).carbon;
    expect(lost).toBeGreaterThan(0);
    expect((total('co2') * tank.resources.water) / C_TO_CO2_MASS_RATIO / 1000).toBeCloseTo(lost, 12);
  });

  it('mints the nitrogen it rots as ammonia and hands the water every mineral', () => {
    const before = pools(tank).nutrients;
    const left = pools(after).nutrients;
    expect(total('ammonia') / MW_NH3).toBeCloseTo((before.nitrate - left.nitrate) / MW_NO3, 9);
    for (const n of WASTE_NUTRIENTS) expect(total(n)).toBeCloseTo(before[n] - left[n], 9);
  });

  it('returns KH on the ammonia it mints, so rot carried on to nitrate nets the 3.57 mg CaCO3 per mg N the wastewater texts quote', () => {
    const nitrifying = produce(tank, (draft) => {
      draft.resources.ammonia = 40;
      draft.resources.aob = 100;
    });
    const nitrified = nitrogenCycleSystem.update(nitrifying, DEFAULT_CONFIG, tierOxygen(nitrifying, 'passive', DEFAULT_CONFIG));
    const perNitrogen = (from: readonly Effect[], source: string): number => {
      const delta = (resource: 'kh' | 'ammonia'): number =>
        sum(from.filter((e) => e.resource === resource && e.source === source).map((e) => e.delta as number));
      return delta('kh') / Math.abs((delta('ammonia') * MW_N) / MW_NH3);
    };
    const returned = perNitrogen(effects, 'decomposition');

    expect(returned).toBeCloseTo(3.57, 2);
    expect(returned + perNitrogen(nitrified, 'nitrogen-cycle-aob')).toBeCloseTo(-3.57, 2);
  });

  it('settles food and waste into the bed', () => {
    const settled = effects.filter((effect) => effect.source === 'settling');
    expect(settled.length).toBeGreaterThan(0);
    expect(settled.every((effect) => effect.resource === 'mulm')).toBe(true);
  });

  it('moves nothing in a tank with no organics', () => {
    const empty = produce(createSimulation({ tankCapacity: 100 }), (draft) => {
      draft.resources.food = NO_ORGANICS;
      draft.resources.waste = NO_ORGANICS;
    });
    expect(decompositionSystem.update(empty, DEFAULT_CONFIG, empty.resources.oxygen)).toEqual([]);
  });
});

/**
 * What a planting does to the dissolved gases, read at the tank rather than at
 * the system.
 *
 * Three claims live here. A plant moves a *mass* of gas, so the same planting
 * has to move the concentration of a small tank further than a large one — the
 * term that was missing. The oxygen it releases is the oxygen its carbon paid
 * for, so a planting that wants more carbon than the column holds gets the
 * column and not a milligram past it. And between them, a planted tank can no
 * longer manufacture a night its fish don't survive.
 */

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import type { SimulationConfig, SimulationState } from '../state.js';
import type { PresetSeed } from '../seed.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { nutrientsDefaults } from '../config/nutrients.js';
import { plantsDefaults } from '../config/plants.js';
import { processPlants } from '../plants/index.js';
import { computeFishVitality } from '../systems/fish-health.js';
import { runTank } from './metrics.js';
import { DAY } from './tanks.js';

/** A lit, filtered, dosed planted tank at any volume. */
const plantedTank = (capacity: number): SimulationConfig => ({
  tankCapacity: capacity,
  heater: { enabled: true, targetTemperature: 25, wattage: Math.max(100, capacity) },
  filter: { enabled: true, type: 'canister' },
  light: { enabled: true, par: 90, schedule: { startHour: 8, duration: 12 } },
  substrate: { type: 'aqua_soil' },
  ato: { enabled: true },
  autoDoser: { enabled: true, doseAmountMl: capacity / 50, schedule: { startHour: 8, duration: 1 } },
});

/**
 * Water that takes nothing out of the light on its way down, so every tank in a
 * comparison reads the fixture's full 90 PAR at the substrate instead of the
 * PAR its own depth implies. The tick derives substrate PAR from capacity each
 * hour, so this is the only place it can be held still.
 */
const CLEAR_WATER = {
  ...DEFAULT_CONFIG,
  optics: { ...DEFAULT_CONFIG.optics, waterAttenuationPerCm: 0 },
};

/**
 * 200 total plant size, whatever the tank around it.
 *
 * Sized for the *smallest* tank in a comparison, which meets two ceilings the
 * larger ones never approach: the carbon clamp once an hour's demand outruns
 * the column, and `OxygenResource`'s own upper bound once the hour's release
 * outruns the water. A planting heavy enough to reach either reads flat with
 * volume for a reason that has nothing to do with the volume term. This one
 * clears both across every carbon yield the calibration sweep admits.
 */
const PLANTING: PresetSeed['plants'] = [
  { species: 'java_fern', count: 2, size: 50 },
  { species: 'anubias', count: 2, size: 50 },
];

const O2_HELD = 4;
/**
 * Carbon held where the rate has long since saturated, mg/L — the same three
 * times optimal the nutrients below are held at. Held *at* the optimum the
 * column would be barely larger than an hour's demand, and a comparison across
 * volumes would be reading the carbon clamp in its smallest tank.
 */
const CO2_HELD = plantsDefaults.optimalCo2 * 3;
/** A water column all but stripped of carbon, mg/L. */
const CO2_STARVED = 0.02;

/**
 * Hold every input the rate reads — carbon, nutrients, and the oxygen each hour
 * opens at — so what is left varying between two runs is the water volume.
 */
const holding =
  (co2: number) =>
  (state: SimulationState): SimulationState =>
    produce(state, (draft) => {
      const { water } = draft.resources;
      draft.resources.oxygen = O2_HELD;
      draft.resources.co2 = co2;
      draft.resources.nitrate = nutrientsDefaults.optimalNitratePpm * water * 3;
      draft.resources.phosphate = nutrientsDefaults.optimalPhosphatePpm * water * 3;
      draft.resources.potassium = nutrientsDefaults.optimalPotassiumPpm * water * 3;
      draft.resources.iron = nutrientsDefaults.optimalIronPpm * water * 3;
    });

/** Mean oxygen a tank gains in one lit hour, from O2 held at 4 mg/L. */
function read(capacity: number, plants: PresetSeed['plants'], co2 = CO2_HELD): number {
  const gains: number[] = [];

  runTank({
    setup: plantedTank(capacity),
    seed: { bacteria: 'cycled', plants },
    days: 3,
    rngSeed: 4242,
    routine: { hold: holding(co2), config: CLEAR_WATER },
    watch: (hour, before, after) => {
      if (hour > 2 * DAY && before.resources.light > 0) {
        gains.push(after.resources.oxygen - O2_HELD);
      }
    },
  });

  return gains.reduce((sum, gain) => sum + gain, 0) / gains.length;
}

/**
 * The oxygen the planting itself contributes, mg/L/h — the same tank read with
 * and without it, so surface exchange cancels out of the difference.
 */
const plantOxygen = (capacity: number, co2 = CO2_HELD, plants = PLANTING): number =>
  read(capacity, plants, co2) - read(capacity, undefined, co2);

/**
 * The share of the dissolved carbon photosynthesis takes in one lit hour, at
 * its narrowest and its widest across the run — 1 is a planting that took the
 * whole column. Read off the effects the tick would apply rather than off the
 * water afterwards, because respiration and the surface are moving the same
 * stock in the same hour.
 */
function carbonDrawn(
  capacity: number,
  plants: PresetSeed['plants'],
  co2 = CO2_HELD
): { least: number; most: number } {
  const shares: number[] = [];

  runTank({
    setup: plantedTank(capacity),
    seed: { bacteria: 'cycled', plants },
    days: 3,
    rngSeed: 4242,
    routine: { hold: holding(co2), config: CLEAR_WATER },
    watch: (hour, before) => {
      if (hour <= 2 * DAY || before.resources.light <= 0) return;
      const fixed = processPlants(before, CLEAR_WATER).effects.find(
        (effect) => effect.resource === 'co2' && effect.source === 'photosynthesis'
      );
      shares.push(-(fixed?.delta ?? 0) / before.resources.co2);
    },
  });

  if (shares.length === 0) throw new Error(`no lit hour to read in the ${capacity} L`);
  return { least: Math.min(...shares), most: Math.max(...shares) };
}

describe('a planting against the water it sits in', () => {
  it('moves a small tank as much further as it is smaller', () => {
    const nano = plantOxygen(10);

    expect(plantOxygen(20) / nano).toBeCloseTo(1 / 2, 3);
    expect(plantOxygen(40) / nano).toBeCloseTo(1 / 4, 3);
    expect(plantOxygen(300) / nano).toBeCloseTo(1 / 30, 3);
  });

  it('halves what it does to the water when the water doubles', () => {
    expect(plantOxygen(150) / plantOxygen(300)).toBeCloseTo(2, 3);
  });
});

describe('the carbon in the water is what pays for the oxygen', () => {
  /**
   * 4800 total plant size in a 10 L. An hour at full rate would fix seven times
   * the carbon the tank is holding, so what it actually gets is the column.
   */
  const JUNGLE: PresetSeed['plants'] = [
    { species: 'java_fern', count: 12, size: 200 },
    { species: 'anubias', count: 12, size: 200 },
  ];

  it('fixes the whole column in an hour it wants more than the column holds', () => {
    const { least, most } = carbonDrawn(10, JUNGLE);

    expect(least).toBeCloseTo(1, 10);
    expect(most).toBeCloseTo(1, 10);
  });

  it('leaves the rest of it standing in an hour it wants less', () => {
    expect(carbonDrawn(10, PLANTING).most).toBeLessThan(1);
  });

  it('takes more than it gives once the column is stripped', () => {
    expect(plantOxygen(10)).toBeGreaterThan(0);
    expect(plantOxygen(10, CO2_STARVED)).toBeLessThan(0);
  });
});

describe('a heavily planted tank of neon tetras', () => {
  /**
   * The tank the roster died in: a 982-size planting, a daily ration, and none
   * of the equipment a keeper would reach for once the fish looked distressed.
   */
  const unaided = (capacity: number): SimulationConfig => ({
    ...plantedTank(capacity),
    ato: { enabled: false },
    autoDoser: { enabled: false },
  });

  const HEAVY: PresetSeed = {
    bacteria: 'cycled',
    fish: [{ species: 'neon_tetra', count: 12, sex: 'female' }],
    plants: [
      { species: 'amazon_sword', count: 3, size: 164 },
      { species: 'java_fern', count: 3, size: 163 },
    ],
  };

  const DAYS = 20;

  /**
   * Survivors, the worst oxygen any hour of the run reached, and the worst any
   * fish in it was charged for that oxygen.
   */
  function watch(capacity: number): {
    survivors: number;
    minOxygen: number;
    peakOxygenStress: number;
  } {
    let minOxygen = Infinity;
    let peakOxygenStress = 0;
    const { final } = runTank({
      setup: unaided(capacity),
      seed: HEAVY,
      days: DAYS,
      rngSeed: 4242,
      routine: { feed: 0.5 },
      watch: (_hour, before, after) => {
        minOxygen = Math.min(minOxygen, after.resources.oxygen);
        for (const fish of before.fish) {
          const { breakdown } = computeFishVitality(
            fish,
            after.resources,
            after.plants,
            after.resources.water,
            after.tank.capacity,
            DEFAULT_CONFIG.livestock
          );
          peakOxygenStress = Math.max(
            peakOxygenStress,
            breakdown.stressors.find((stressor) => stressor.key === 'oxygen')?.amount ?? 0
          );
        }
      },
    });
    return { survivors: final.fish.length, minOxygen, peakOxygenStress };
  }

  const at150 = watch(150);

  it('keeps the whole roster through twenty days', () => {
    expect(at150.survivors).toBe(12);
    // Not merely alive: no fish was charged anything for the water at any hour
    // of the run, so the roster spent all twenty days on the benefit side.
    expect(at150.peakOxygenStress).toBe(0);
  });

  it('leaves a bigger tank more room still', () => {
    expect(watch(300).minOxygen).toBeGreaterThan(at150.minOxygen);
  });
});

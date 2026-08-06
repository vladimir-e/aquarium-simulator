/**
 * What a planting does to the dissolved gases, read at the tank rather than at
 * the system.
 *
 * Three claims live here. A plant moves a *mass* of gas, so the same planting
 * has to move the concentration of a small tank further than a large one — the
 * term that was missing. The oxygen it releases is the oxygen its carbon paid
 * for, so a planting with an empty water column has none to give. And between
 * them, a planted tank can no longer manufacture a night its fish don't survive.
 */

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import type { SimulationConfig, SimulationState } from '../state.js';
import type { PresetSeed } from '../seed.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { nutrientsDefaults } from '../config/nutrients.js';
import { CO2_TO_O2_MASS_RATIO } from '../core/chemistry.js';
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

/** 600 total plant size, whatever the tank around it. */
const PLANTING: PresetSeed['plants'] = [
  { species: 'java_fern', count: 3, size: 100 },
  { species: 'anubias', count: 3, size: 100 },
];

const O2_HELD = 4;
const CO2_HELD = 20;
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

  it('releases no more in an hour than the whole column could pay for', () => {
    expect(plantOxygen(10, CO2_HELD, JUNGLE)).toBeLessThanOrEqual(
      CO2_HELD * CO2_TO_O2_MASS_RATIO
    );
  });

  it('has none to give at all once the column is stripped', () => {
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

  /** Survivors and the worst oxygen any hour of the run reached. */
  function watch(capacity: number): { survivors: number; minOxygen: number } {
    let minOxygen = Infinity;
    const { final } = runTank({
      setup: unaided(capacity),
      seed: HEAVY,
      days: DAYS,
      rngSeed: 4242,
      routine: { feed: 0.5 },
      watch: (_hour, _before, after) => {
        minOxygen = Math.min(minOxygen, after.resources.oxygen);
      },
    });
    return { survivors: final.fish.length, minOxygen };
  }

  const at150 = watch(150);

  it('keeps the whole roster through twenty days', () => {
    expect(at150.survivors).toBe(12);
    expect(at150.minOxygen).toBeGreaterThan(6);
  });

  it('leaves a bigger tank more room still', () => {
    expect(watch(300).minOxygen).toBeGreaterThan(at150.minOxygen);
  });
});

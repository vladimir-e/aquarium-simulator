/**
 * What a planting does to the dissolved gases, read at the tank rather than at
 * the system.
 *
 * Two claims live here. A plant moves a *mass* of gas, so the same planting has
 * to move the concentration of a small tank further than a large one — the term
 * that was missing. And the oxygen it releases is the oxygen its carbon paid
 * for, so a planted tank can no longer manufacture a night its fish don't
 * survive.
 */

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { createSimulation, type SimulationConfig, type SimulationState } from '../state.js';
import type { PresetSeed } from '../seed.js';
import { nutrientsDefaults } from '../config/nutrients.js';
import { DAY, keep } from './tanks.js';

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

/** 600 total plant size, whatever the tank around it. */
const PLANTING: PresetSeed['plants'] = [
  { species: 'java_fern', count: 3, size: 100 },
  { species: 'anubias', count: 3, size: 100 },
];

const O2_HELD = 4;

/**
 * Hold every input the rate reads — carbon, nutrients, and the oxygen each hour
 * opens at — so what is left varying between two runs is the water volume.
 */
const pin = (state: SimulationState): SimulationState =>
  produce(state, (draft) => {
    const { water } = draft.resources;
    draft.resources.oxygen = O2_HELD;
    draft.resources.co2 = 20;
    draft.resources.nitrate = nutrientsDefaults.optimalNitratePpm * water * 3;
    draft.resources.phosphate = nutrientsDefaults.optimalPhosphatePpm * water * 3;
    draft.resources.potassium = nutrientsDefaults.optimalPotassiumPpm * water * 3;
    draft.resources.iron = nutrientsDefaults.optimalIronPpm * water * 3;
  });

/** Mean oxygen a tank gains in one lit hour, from O2 held at 4 mg/L. */
function litGain(capacity: number, plants: PresetSeed['plants']): number {
  const gains: number[] = [];
  keep(
    createSimulation(plantedTank(capacity), { bacteria: 'cycled', plants }, 4242),
    3,
    { hold: pin },
    (hour, before, after) => {
      if (hour > 2 * DAY && before.resources.light > 0) {
        gains.push(after.resources.oxygen - O2_HELD);
      }
    }
  );
  return gains.reduce((sum, gain) => sum + gain, 0) / gains.length;
}

/**
 * The oxygen the planting itself contributes, mg/L/h — the same tank read with
 * and without it, so surface exchange cancels out of the difference.
 */
const plantOxygen = (capacity: number): number =>
  litGain(capacity, PLANTING) - litGain(capacity, undefined);

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

  /** Survivors and the worst oxygen any hour of the run reached. */
  function watch(capacity: number, days: number): { survivors: number; minOxygen: number } {
    let minOxygen = Infinity;
    const final = keep(
      createSimulation(unaided(capacity), HEAVY, 4242),
      days,
      { feed: 0.5 },
      (_hour, _before, after) => {
        minOxygen = Math.min(minOxygen, after.resources.oxygen);
      }
    );
    return { survivors: final.fish.length, minOxygen };
  }

  it('keeps the whole roster through three weeks', () => {
    const { survivors, minOxygen } = watch(150, 20);

    expect(survivors).toBe(12);
    expect(minOxygen).toBeGreaterThan(6);
  });

  it('leaves a bigger tank more room still', () => {
    expect(watch(300, 20).minOxygen).toBeGreaterThan(watch(150, 20).minOxygen);
  });
});

/**
 * A tank started at a state behaves like one that reached it the long way.
 *
 * Seeding writes initial stock values and nothing else, so the claim is
 * not that a seeded tank is a special case the engine handles — it is that
 * there is no special case. Most assertions here are comparisons against
 * the tank that spent three weeks getting there, or against the same tank
 * without the seed.
 */

import { describe, it, expect } from 'vitest';
import { createSimulation, type SimulationConfig, type SimulationState } from '../state.js';
import { tick } from '../tick.js';
import { applyAction } from '../actions/index.js';
import { cycledColony, type PresetSeed } from '../seed.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import { getPpm } from '../resources/helpers.js';
import { DAY, colonyFill, cycledTank, doseClearance, run, seededCycledTank } from './tanks.js';

const ammoniaPpm = (s: SimulationState): number => getPpm(s.resources.ammonia, s.resources.water);
const nitritePpm = (s: SimulationState): number => getPpm(s.resources.nitrite, s.resources.water);
const nitratePpm = (s: SimulationState): number => getPpm(s.resources.nitrate, s.resources.water);
const totalPlantSize = (s: SimulationState): number =>
  s.plants.reduce((sum, plant) => sum + plant.size, 0);

/** Peak ammonia over `days` of a daily ration, fed from the first morning. */
function fedAmmoniaPeak(state: SimulationState, ration: number, days: number): number {
  let running = state;
  let peak = 0;

  for (let hour = 1; hour <= days * DAY; hour++) {
    if (hour % DAY === 9) running = applyAction(running, { type: 'feed', amount: ration }).state;
    running = tick(running, DEFAULT_CONFIG);
    peak = Math.max(peak, ammoniaPpm(running));
  }

  return peak;
}

/** Run a tank on a keeper's routine: fed every morning, a quarter changed weekly. */
function keeperRoutine(state: SimulationState, days: number, ration: number): SimulationState {
  let running = state;

  for (let day = 1; day <= days; day++) {
    for (let hour = 0; hour < DAY; hour++) {
      if (hour === 8) running = applyAction(running, { type: 'feed', amount: ration }).state;
      if (day % 7 === 0 && hour === 18)
        running = applyAction(running, { type: 'waterChange', amount: 0.25 }).state;
      running = tick(running, DEFAULT_CONFIG);
    }
  }

  return running;
}

describe('a seeded cycled tank', () => {
  it('clears a 2 ppm dose inside 24 h, at any volume', () => {
    for (const capacity of [20, 150, 1000]) {
      expect(doseClearance(seededCycledTank(capacity))).toBeLessThan(0.25);
    }
  });

  it('clears it at least as well as the tank that cycled the long way', () => {
    for (const capacity of [20, 150]) {
      expect(doseClearance(seededCycledTank(capacity))).toBeLessThanOrEqual(
        doseClearance(cycledTank(capacity))
      );
    }
  });

  it('holds the colony it was handed through its first week', () => {
    for (const capacity of [20, 150]) {
      const seeded = seededCycledTank(capacity);
      const after = run(seeded, 7 * DAY);

      expect(after.resources.aob / seeded.resources.aob).toBeGreaterThan(0.7);
      expect(after.resources.nob / seeded.resources.nob).toBeGreaterThan(0.7);
    }
  });

  it('sits nowhere near the surface ceiling, the way an ordinary tank does', () => {
    for (const capacity of [20, 150, 1000]) {
      expect(colonyFill(seededCycledTank(capacity), 'aob')).toBeLessThan(0.1);
    }
  });

  it('takes a feeding from its first day without an ammonia spike', () => {
    const fresh: SimulationConfig = {
      tankCapacity: 40,
      substrate: { type: 'aqua_soil' },
      ato: { enabled: true },
    };

    const seeded = fedAmmoniaPeak(seededCycledTank(40), 0.4, 7);
    const uncycled = fedAmmoniaPeak(createSimulation(fresh), 0.4, 7);

    expect(seeded).toBeLessThan(0.1);
    expect(uncycled).toBeGreaterThan(seeded * 10);
  });
});

describe('a seeded community tank', () => {
  const TANK: SimulationConfig = {
    tankCapacity: 150,
    substrate: { type: 'aqua_soil' },
    filter: { enabled: true, type: 'canister' },
    heater: { enabled: true, targetTemperature: 26, wattage: 200 },
    light: { enabled: true, wattage: 50, schedule: { startHour: 8, duration: 10 } },
    ato: { enabled: true },
  };

  /** Single-sex so the run measures the tank rather than the breeding curve. */
  const ROSTER: PresetSeed['fish'] = [{ species: 'neon_tetra', count: 12, sex: 'male' }];

  it('runs 90 days on a keeper routine without anything running away', () => {
    const state = keeperRoutine(
      createSimulation(TANK, { bacteria: cycledColony(150), fish: ROSTER }),
      90,
      0.15
    );

    expect(state.fish).toHaveLength(12);
    expect(Math.min(...state.fish.map((f) => f.health))).toBeGreaterThan(90);
    expect(ammoniaPpm(state)).toBeLessThan(0.1);
    expect(nitritePpm(state)).toBeLessThan(0.1);
    expect(nitratePpm(state)).toBeLessThan(40);
    expect(colonyFill(state, 'aob')).toBeLessThan(0.1);
  });

  it('starts planted rather than seedling, and grows from there', () => {
    const seed: PresetSeed = {
      bacteria: cycledColony(150),
      fish: ROSTER,
      plants: [
        { species: 'java_fern', count: 3, size: 100 },
        { species: 'anubias', count: 2, size: 100 },
      ],
    };
    const planted = createSimulation(TANK, seed);
    const after = keeperRoutine(planted, 30, 0.15);

    expect(planted.plants).toHaveLength(5);
    expect(Math.min(...planted.plants.map((p) => p.size))).toBe(100);
    expect(after.plants).toHaveLength(5);
    expect(totalPlantSize(after)).toBeGreaterThan(totalPlantSize(planted));
    expect(after.fish).toHaveLength(12);
  });
});

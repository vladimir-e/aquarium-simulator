/**
 * A tank started at a state behaves like one that reached it the long way.
 */

import { describe, it, expect } from 'vitest';
import { createSimulation, type SimulationConfig, type SimulationState } from '../state.js';
import { PRESETS, createPresetSimulation } from '../presets.js';
import { cycledColony, type PresetSeed } from '../seed.js';
import { getPpm } from '../resources/helpers.js';
import {
  DAY,
  colonyFill,
  cycledTank,
  doseClearance,
  fishlessTank,
  keep,
  run,
  seededCycledTank,
} from './tanks.js';

const ammoniaPpm = (s: SimulationState): number => getPpm(s.resources.ammonia, s.resources.water);
const nitritePpm = (s: SimulationState): number => getPpm(s.resources.nitrite, s.resources.water);
const nitratePpm = (s: SimulationState): number => getPpm(s.resources.nitrate, s.resources.water);
const totalPlantSize = (s: SimulationState): number =>
  s.plants.reduce((sum, plant) => sum + plant.size, 0);

interface FedRun {
  ammoniaPeakPpm: number;
  /** Nitrate the run produced — the proof the ration decayed at all. */
  nitrateGainPpm: number;
}

/** Feed a tank a daily ration and watch what the nitrogen does. */
function feedDaily(state: SimulationState, ration: number, days: number): FedRun {
  let ammoniaPeakPpm = 0;
  const final = keep(state, days, { feed: ration }, (_hour, _before, after) => {
    ammoniaPeakPpm = Math.max(ammoniaPeakPpm, ammoniaPpm(after));
  });

  return { ammoniaPeakPpm, nitrateGainPpm: nitratePpm(final) - nitratePpm(state) };
}

describe('a seeded cycled tank', () => {
  it('carries the colony a tank that cycled itself grew', () => {
    const perLitre = cycledColony(1);

    for (const capacity of [20, 150]) {
      const grown = cycledTank(capacity);

      expect(grown.resources.aob / capacity).toBeGreaterThan(perLitre.aob * 0.7);
      expect(grown.resources.aob / capacity).toBeLessThan(perLitre.aob * 1.3);
      expect(grown.resources.nob / capacity).toBeGreaterThan(perLitre.nob * 0.7);
      expect(grown.resources.nob / capacity).toBeLessThan(perLitre.nob * 1.3);
    }
  });

  it('clears a 2 ppm dose inside 24 h, at any volume', () => {
    for (const capacity of [20, 150, 1000]) {
      expect(doseClearance(seededCycledTank(capacity))).toBeLessThan(0.25);
    }
  });

  it('clears it at least as well as the same soil tank that cycled the long way', () => {
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

      for (const colony of ['aob', 'nob'] as const) {
        const ratio = after.resources[colony] / seeded.resources[colony];
        expect(ratio).toBeGreaterThan(0.7);
        expect(ratio).toBeLessThan(1.5);
      }
    }
  });

  it('sits nowhere near the surface ceiling, the way an ordinary tank does', () => {
    for (const capacity of [20, 150, 1000]) {
      expect(colonyFill(seededCycledTank(capacity), 'aob')).toBeLessThan(0.1);
    }
  });

  it('takes a feeding from its first day without an ammonia spike', () => {
    const seeded = feedDaily(seededCycledTank(40), 0.4, 7);
    const uncycled = feedDaily(fishlessTank('aqua_soil', { capacity: 40 }), 0.4, 7);

    expect(uncycled.ammoniaPeakPpm).toBeGreaterThan(1);
    expect(seeded.ammoniaPeakPpm).toBeLessThan(0.1);
    expect(seeded.nitrateGainPpm).toBeGreaterThan(1);
  });
});

describe('the tanks the presets ship', () => {
  const seeded = PRESETS.filter((preset) => preset.seed !== undefined);

  it('takes its first feeding without a spike, where the same tank unseeded spikes', () => {
    expect(seeded).not.toHaveLength(0);

    for (const preset of seeded) {
      const shipped = feedDaily(createPresetSimulation(preset), 0.2, 7);
      const uncycled = feedDaily(createSimulation(preset.config), 0.2, 7);

      expect(uncycled.ammoniaPeakPpm).toBeGreaterThan(0.2);
      expect(shipped.ammoniaPeakPpm).toBeLessThan(0.05);
      expect(shipped.nitrateGainPpm).toBeGreaterThan(1);
    }
  });
});

/**
 * Guards, not anchors, despite the directory: the bands below say nothing ran
 * away over three months, not what a community tank settles at. Deriving those
 * numbers is the calibration pass's job.
 */
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
    const state = keep(createSimulation(TANK, { bacteria: 'cycled', fish: ROSTER }), 90, {
      feed: 0.15,
      waterChange: 0.25,
    });

    expect(state.fish).toHaveLength(12);
    expect(Math.min(...state.fish.map((f) => f.health))).toBeGreaterThan(90);
    expect(ammoniaPpm(state)).toBeLessThan(0.1);
    expect(nitritePpm(state)).toBeLessThan(0.1);
    expect(nitratePpm(state)).toBeLessThan(40);
    expect(colonyFill(state, 'aob')).toBeLessThan(0.1);
  });

  it('starts planted rather than seedling, and grows from there', () => {
    const seed: PresetSeed = {
      bacteria: 'cycled',
      fish: ROSTER,
      plants: [
        { species: 'java_fern', count: 3, size: 100 },
        { species: 'anubias', count: 2, size: 100 },
      ],
    };
    const planted = createSimulation(TANK, seed);
    const after = keep(planted, 30, { feed: 0.15, waterChange: 0.25 });

    expect(planted.plants).toHaveLength(5);
    expect(Math.min(...planted.plants.map((p) => p.size))).toBe(100);
    expect(after.plants).toHaveLength(5);
    expect(totalPlantSize(after)).toBeGreaterThan(totalPlantSize(planted));
    expect(after.fish).toHaveLength(12);
  });
});

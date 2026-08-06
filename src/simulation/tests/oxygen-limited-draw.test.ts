/**
 * A tank that is running out of air, read at the tank rather than at the system.
 *
 * Two claims. Every aerobic process asks for less as the water empties, so the
 * carbon derived from that oxygen falls with it and a suffocating tank stops
 * manufacturing CO2 for oxygen it never had. And the oxygen a consumer takes is
 * the only thing that falls: a fish short of air goes on excreting ammonia,
 * which is what keeps the nitrogen budget out of this.
 */

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import type { SimulationConfig, SimulationState } from '../state.js';
import type { PresetSeed } from '../seed.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../config/index.js';
import { decaySystem } from '../systems/decay.js';
import { processPlants } from '../plants/index.js';
import { processLivestock } from '../livestock/index.js';
import { tuned } from './sweep.js';
import { runTank } from './metrics.js';

/** A small warm tank with nothing in it that moves water. */
const STAGNANT: SimulationConfig = {
  tankCapacity: 20,
  heater: { enabled: true, targetTemperature: 30, wattage: 100 },
  filter: { enabled: false },
  ato: { enabled: true },
  light: { enabled: true, par: 50, schedule: { startHour: 8, duration: 12 } },
  substrate: { type: 'aqua_soil' },
};

const STOCKED: PresetSeed = {
  bacteria: 'cycled',
  fish: [{ species: 'neon_tetra', count: 8, sex: 'female' }],
  plants: [{ species: 'java_fern', count: 4, size: 60 }],
};

/** Every half-saturation constant taken to nothing: the draw as it was. */
const UNBOUNDED: TunableConfig = tuned((draft) => {
  draft.decay.oxygenHalfSaturation = 0;
  draft.plants.respirationOxygenHalfSaturation = 0;
  draft.livestock.respirationOxygenHalfSaturation = 0;
});

const tank = runTank({ setup: STAGNANT, seed: STOCKED, days: 1, rngSeed: 4242 }).final;

/** The same tank rewritten to one dissolved oxygen, with food to work on. */
const holding = (oxygen: number): SimulationState =>
  produce(tank, (draft) => {
    draft.resources.oxygen = oxygen;
    draft.resources.food = 5;
  });

function hourly(
  state: SimulationState,
  config: TunableConfig = DEFAULT_CONFIG
): { oxygen: number; carbon: number; ammonia: number } {
  const effects = [
    ...decaySystem.update(state, config),
    ...processPlants(state, config).effects,
    ...processLivestock(state, config).effects,
  ];
  const total = (resource: string, sources: readonly string[]): number =>
    effects
      .filter((e) => e.resource === resource && sources.includes(e.source))
      .reduce((sum, e) => sum + e.delta, 0);

  return {
    oxygen: -total('oxygen', ['decay', 'fish-respiration', 'respiration']),
    carbon: total('co2', ['decay', 'fish-respiration', 'respiration']),
    ammonia: total('ammonia', ['fish-gill-excretion']),
  };
}

describe('an aerobic draw against the oxygen it is drawing from', () => {
  it('falls monotonically as the water empties, for every consumer at once', () => {
    let previous = Infinity;
    for (const oxygen of [8, 6, 4, 2, 1, 0.5, 0.25, 0.1]) {
      const drawn = hourly(holding(oxygen)).oxygen;
      expect(drawn).toBeGreaterThan(0);
      expect(drawn).toBeLessThan(previous);
      previous = drawn;
    }
  });

  it('asks for nothing at all once there is nothing to ask for', () => {
    const empty = hourly(holding(0));

    expect(empty.oxygen).toBeCloseTo(0, 12);
    expect(empty.carbon).toBeCloseTo(0, 12);
  });

  it('carries the carbon down with it, so an empty tank emits none', () => {
    const full = hourly(holding(8));
    const starved = hourly(holding(0.1));

    expect(full.carbon).toBeGreaterThan(0);
    expect(starved.carbon / full.carbon).toBeLessThan(0.5);
    expect(hourly(holding(0)).carbon).toBeCloseTo(0, 12);
  });

  it('leaves ammonia excretion alone — a fish stops breathing, not living', () => {
    const breathing = hourly(holding(8));
    const suffocating = hourly(holding(0));

    expect(breathing.ammonia).toBeGreaterThan(0);
    expect(suffocating.ammonia).toBeCloseTo(breathing.ammonia, 12);
  });
});

describe('the oxygen a stressed tank draws that was never in it', () => {
  /** mg/L asked for across six days beyond what the water was holding. */
  function unpaid(config: TunableConfig): number {
    let total = 0;
    runTank({
      setup: STAGNANT,
      seed: STOCKED,
      days: 6,
      rngSeed: 4242,
      routine: { config, feed: 1 },
      watch: (_hour, before) => {
        total += Math.max(0, hourly(before, config).oxygen - before.resources.oxygen);
      },
    });
    return total;
  }

  // Not to zero: a tick is an hour, so a consumer whose reduced demand still
  // outruns the standing stock overshoots inside the step. What is left of the
  // overdraw goes with tick resolution, not with the factor.
  it('is a small fraction of what an unbounded draw took', () => {
    expect(unpaid(DEFAULT_CONFIG)).toBeLessThan(unpaid(UNBOUNDED) / 10);
  });
});

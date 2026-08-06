/**
 * A tank that is running out of air, read at the tank rather than at the system.
 *
 * Two claims. Every aerobic process — decomposition, both nitrifier guilds,
 * plants and fish — asks for less as the water empties, so the carbon derived
 * from that oxygen falls with it and a suffocating tank stops manufacturing CO2
 * for oxygen it never had. And the oxygen a consumer takes is the only thing
 * that falls: a fish short of air goes on excreting ammonia, which is what
 * leaves the nitrogen budget to the guilds that do read it.
 */

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import type { SimulationConfig, SimulationState } from '../state.js';
import type { PresetSeed } from '../seed.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../config/index.js';
import { decaySystem } from '../systems/decay.js';
import { nitrogenCycleSystem } from '../systems/nitrogen-cycle.js';
import { processPlants } from '../plants/index.js';
import { processLivestock } from '../livestock/index.js';
import { computeFishVitality } from '../systems/fish-health.js';
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

/** The same box with the circulation a keeper would actually give it. */
const AERATED: SimulationConfig = {
  ...STAGNANT,
  filter: { enabled: true, type: 'sponge' },
  airPump: { enabled: true },
};

const STOCKED: PresetSeed = {
  bacteria: 'cycled',
  fish: [{ species: 'neon_tetra', count: 8, sex: 'female' }],
  plants: [{ species: 'java_fern', count: 4, size: 60 }],
};

/**
 * Grams of food a day — a ration a keeper would call heavy for this roster, and
 * the largest one an aerated tank still covers in full. At twice it even the
 * aerated box overdraws its feeding hours, so this is the last ration at which
 * the oxygen term is the whole difference between a tank that pays for what it
 * asks and one that does not.
 */
const RATION = 1;

/** Every half-saturation constant taken to nothing: the draw as it was. */
const UNBOUNDED: TunableConfig = tuned((draft) => {
  draft.decay.oxygenHalfSaturation = 0;
  draft.plants.respirationOxygenHalfSaturation = 0;
  draft.livestock.respirationOxygenHalfSaturation = 0;
  draft.nitrogenCycle.aobOxygenHalfSaturation = 0;
  draft.nitrogenCycle.nobOxygenHalfSaturation = 0;
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
    ...nitrogenCycleSystem.update(state, config),
    ...processPlants(state, config).effects,
    ...processLivestock(state, config).effects,
  ];
  const total = (resource: string, sources: readonly string[]): number =>
    effects
      .filter((e) => e.resource === resource && sources.includes(e.source))
      .reduce((sum, e) => sum + e.delta, 0);

  return {
    oxygen: -total('oxygen', [
      'decay',
      'nitrogen-cycle-aob',
      'nitrogen-cycle-nob',
      'fish-respiration',
      'respiration',
    ]),
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

  /** What one fish's gills take out of the water, and what that water charges it. */
  function fishAt(oxygen: number): { drawn: number; damage: number } {
    const state = holding(oxygen);
    const fish = state.fish[0];
    if (fish === undefined) throw new Error('no fish in the fixture to read');

    const drawn = -processLivestock(state, DEFAULT_CONFIG)
      .effects.filter(
        (effect) => effect.resource === 'oxygen' && effect.source === 'fish-respiration'
      )
      .reduce((sum, effect) => sum + effect.delta, 0);
    const { breakdown } = computeFishVitality(
      fish,
      state.resources,
      state.plants,
      state.resources.water,
      state.tank.capacity,
      DEFAULT_CONFIG.livestock
    );

    return {
      drawn,
      damage: breakdown.stressors.find((stressor) => stressor.key === 'oxygen')?.amount ?? 0,
    };
  }

  it('draws less and suffers more, which are two readings and not one', () => {
    // The two constants are deliberately far apart — half rate at 1.0, damage
    // from 5.0 — so a fish is being charged for the water long before its gills
    // start conforming to it. Damage reads the water alone: linear in how far
    // under the threshold the tank sits, whatever the gills managed to take.
    const { oxygenStressThreshold: threshold } = DEFAULT_CONFIG.livestock;
    const mild = fishAt(2);
    const severe = fishAt(0.5);

    expect(severe.drawn).toBeLessThan(mild.drawn);
    expect(severe.damage / mild.damage).toBeCloseTo((threshold - 0.5) / (threshold - 2), 10);
  });

  it('leaves ammonia excretion alone — a fish stops breathing, not living', () => {
    const breathing = hourly(holding(8));
    const suffocating = hourly(holding(0));

    expect(breathing.ammonia).toBeGreaterThan(0);
    expect(suffocating.ammonia).toBeCloseTo(breathing.ammonia, 12);
  });
});

describe('the oxygen a stressed tank draws that was never in it', () => {
  /** mg/L asked for across six days, and how much of it the water never held. */
  function overdraw(
    config: TunableConfig,
    setup: SimulationConfig = STAGNANT
  ): { asked: number; unpaid: number } {
    let asked = 0;
    let unpaid = 0;
    runTank({
      setup,
      seed: STOCKED,
      days: 6,
      rngSeed: 4242,
      routine: { config, feed: RATION },
      watch: (_hour, before) => {
        const want = hourly(before, config).oxygen;
        asked += want;
        unpaid += Math.max(0, want - before.resources.oxygen);
      },
    });
    return { asked, unpaid };
  }

  // A direction rather than a ratio, because the residue the factor leaves
  // behind is not the factor's to close: a tick is an hour, so a consumer whose
  // reduced demand still outruns the standing stock overshoots inside the step.
  // The base case is the standing draw — a planting and a cycled biofilter in a
  // box nothing moves water through run this fixture short for 42 of its 144
  // hours before a grain of food is added, and the ration then quintuples it.
  // What is left goes with tick resolution, not with the factor.
  it('asks for less, and leaves less of it unpaid', () => {
    const bounded = overdraw(DEFAULT_CONFIG);
    const unbounded = overdraw(UNBOUNDED);

    expect(bounded.asked).toBeLessThan(unbounded.asked);
    expect(bounded.unpaid).toBeLessThan(unbounded.unpaid);
  });

  it('leaves a tank with circulation owing nothing at all', () => {
    expect(overdraw(DEFAULT_CONFIG, AERATED).unpaid).toBe(0);
    expect(overdraw(UNBOUNDED, AERATED).unpaid).toBeGreaterThan(0);
  });
});

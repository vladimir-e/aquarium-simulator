/**
 * The reserve a plant runs on, read at the tank.
 *
 * A thriving plant has to end a run holding photosynthate it didn't spend on
 * height — the buffer that carries it through a dark spell and, later, the
 * energy propagation runs on. A plant at its species ceiling has nowhere to put
 * that income but the bank, so it fills rather than burns. And neither claim is
 * worth anything if the planting stopped growing to pay for them.
 *
 * The bank has two regimes, split at the size where its settling point passes
 * `surplusCap`. Below it the withdrawal tracks the income; past it the bank
 * climbs to the cap and the income drops out. Each claim below names the
 * regime it holds in.
 *
 * Income arrives only in the lit hours and maintenance is charged in all of
 * them, so a bank at the cap is a bank at the cap *at dusk*: it gives back the
 * night's maintenance and earns it again the next morning. Every reading here
 * that names the cap is taken inside the photoperiod for that reason.
 */

import { describe, it, expect } from 'vitest';
import type { PresetSeed } from '../seed.js';
import { plantsDefaults } from '../config/plants.js';
import { getSpeciesMaxSize } from '../systems/plant-growth.js';
import { PLANT_SPECIES_DATA } from '../plants/species.js';
import { runTank, totalSize } from './metrics.js';
import {
  ATTACHED_PLANTING,
  atOptimum,
  DAY,
  fixtureFor,
  plantedTank,
  planting,
} from './tanks.js';

const CAPACITY = 150;

/** A dosed, lit, cycled 150 L — the water a plant has no excuse in. */
const TANK = plantedTank(CAPACITY, { carbonInjection: true });

const seeded = (size: number | 'maxSize'): PresetSeed => ({
  bacteria: 'cycled',
  plants: planting(ATTACHED_PLANTING, size),
});

/** One mix at three points on its curve, so a comparison is not a species swap. */
const GROWING = seeded(35);
const MAXED = seeded('maxSize');
const PEGGED: PresetSeed = {
  bacteria: 'cycled',
  plants: ATTACHED_PLANTING.map((group) => ({
    ...group,
    size: getSpeciesMaxSize(group.species) * 0.7,
  })),
};

const grow = (seed: PresetSeed, days: number, setup = TANK): ReturnType<typeof runTank> =>
  runTank({ setup, seed, days, sampleEvery: DAY, sampleHour: 0 });

/** Either end of the dark stretch of the 08:00 + 12 h photoperiod `plantedTank` runs. */
const DUSK = 19;
const DAWN = 7;
const DARK_HOURS = DAY - 12;

const growToHour = (seed: PresetSeed, days: number, hour: number): ReturnType<typeof runTank> =>
  runTank({ setup: TANK, seed, days, sampleEvery: DAY, sampleHour: hour });

/**
 * The same run with the water rewritten to optimum before every tick.
 *
 * Every claim below that names `surplusCap` needs it: the bank is one stock
 * with two claims on it, and the reserve above the survival line is what
 * damage is buffered by — so a planting this size drawing a 150 L down carries
 * a nutrient deficiency into the ledger the reading is about. Held at optimum,
 * the only thing in the ledger is what the plant pays to stay alive.
 */
const growToHourHeld = (
  seed: PresetSeed,
  days: number,
  hour: number
): ReturnType<typeof runTank> =>
  runTank({
    setup: TANK,
    seed,
    days,
    routine: { hold: atOptimum },
    sampleEvery: DAY,
    sampleHour: hour,
  });

const growToDusk = (seed: PresetSeed, days: number): ReturnType<typeof runTank> =>
  growToHour(seed, days, DUSK);

/** What the planting pays per hour for being alive, post-hardiness, at 25 °C. */
const UPKEEP_PER_HOUR =
  ATTACHED_PLANTING.reduce(
    (sum, group) =>
      sum +
      group.count *
        plantsDefaults.upkeepCost *
        (1 - PLANT_SPECIES_DATA[group.species].hardiness),
    0
  ) / ATTACHED_PLANTING.reduce((sum, group) => sum + group.count, 0);

describe('the bank a plant runs on', () => {
  const growing = grow(GROWING, 30);
  const maxedEarly = grow(MAXED, 5);
  const maxed = grow(MAXED, 30);
  const maxedAtDusk = growToDusk(MAXED, 30);

  it('fills on a thriving planting, and keeps filling', () => {
    expect(growing.final.plants).toHaveLength(3);
    for (const plant of growing.final.plants) {
      expect(plant.condition).toBe(100);
      expect(plant.surplus).toBeGreaterThan(0);
    }
    expect(growing.samples[6]!.avgSurplus).toBeGreaterThan(0);
    expect(growing.samples[30]!.avgSurplus).toBeGreaterThan(growing.samples[6]!.avgSurplus);
  });

  it('still grows the planting while it banks', () => {
    expect(totalSize(growing.final)).toBeGreaterThan(growing.samples[0]!.totalSize * 1.5);
  });

  it('saturates a plant that has nowhere left to grow', () => {
    expect(maxedEarly.samples[5]!.avgSurplus).toBeGreaterThan(0);
    expect(maxed.samples[30]!.avgSurplus).toBeGreaterThan(maxedEarly.samples[5]!.avgSurplus);
    expect(maxedAtDusk.samples[30]!.avgSurplus).toBeCloseTo(plantsDefaults.surplusCap, 5);
  });

  it('gives back exactly the night it slept through', () => {
    // The sawtooth the reading above sits on top of, measured end to end and
    // across one night of one run: a maxed planting tops out at the cap at
    // dusk and is short of it at first light by what it spent staying alive in
    // between, and by nothing else. Held at optimum, nothing else *can* be in
    // it — no channel is charging the plant, so the only claim on the bank is
    // the upkeep. Three decimals rather than an exact equality because the tank
    // sits a few hundredths off 25 °C for an hour or two a night while the hold
    // and the heater argue, and the Q10 moves the bill with it — 0.03 % of the
    // figure.
    const dusk = growToHourHeld(MAXED, 31, DUSK).samples[30]!.avgSurplus;
    const dawn = growToHourHeld(MAXED, 31, DAWN).samples[31]!.avgSurplus;

    expect(dusk).toBeCloseTo(plantsDefaults.surplusCap, 5);
    expect(dusk - dawn).toBeCloseTo(DARK_HOURS * UPKEEP_PER_HOUR, 3);
  });

  it('holds a maxed plant at its ceiling rather than shrinking it', () => {
    for (const plant of maxed.final.plants) {
      expect(plant.size).toBe(getSpeciesMaxSize(plant.species));
    }
  });

  it('banks faster the less of its income a plant can spend on height', () => {
    expect(maxed.samples[30]!.avgSurplus).toBeGreaterThan(growing.samples[30]!.avgSurplus);
  });

  it('climbs to the peg past half of maxSize, and grows on the way', () => {
    // Months rather than weeks: what fills the bank is the income left after
    // upkeep, and a planting this size in 150 L is drawing its water down far
    // enough that what is left is a trickle. The regime is the claim — the
    // withdrawal has stopped tracking the income, so the bank only goes up.
    // It passes 99 % of the cap on d99 and never comes back down, so the run
    // closes three weeks past the crossing rather than on top of it.
    const pegged = growToHourHeld(PEGGED, 120, DUSK);

    for (const day of [20, 40, 60, 80, 100, 120]) {
      expect(pegged.samples[day]!.avgSurplus).toBeGreaterThan(
        pegged.samples[day - 20]!.avgSurplus
      );
    }
    expect(pegged.samples[120]!.avgSurplus).toBeGreaterThan(plantsDefaults.surplusCap * 0.99);
    expect(totalSize(pegged.final)).toBeGreaterThan(pegged.samples[0]!.totalSize);
  });

  /**
   * The claim is a growing planting's, and only a growing planting's: the
   * withdrawal reads the income only while the bank sits below `surplusCap`.
   * These three runs end near a tenth of `maxSize`, well inside that regime,
   * and the loop below checks that rather than assuming it. Past the peg the
   * income drops out of the withdrawal entirely and the claim stops holding —
   * the test above is what covers that regime.
   *
   * The three substrate readings sit inside both species' bands — java fern
   * tolerates 10–90 PAR, anubias 8–70 — so what separates the runs is what the
   * light benefit pays and not what a light stressor charges.
   */
  it('buys more size with a brighter fixture, on a planting below the peg', () => {
    const gainUnder = (substratePar: number): number => {
      const run = grow(
        GROWING,
        30,
        plantedTank(CAPACITY, {
          par: fixtureFor(substratePar, CAPACITY),
          carbonInjection: true,
        })
      );
      for (const plant of run.final.plants) {
        expect(plant.size).toBeLessThan(getSpeciesMaxSize(plant.species) / 2);
      }
      return totalSize(run.final) - run.samples[0]!.totalSize;
    };

    const [dim, medium, bright] = [gainUnder(15), gainUnder(35), gainUnder(55)];
    expect(medium).toBeGreaterThan(dim);
    expect(bright).toBeGreaterThan(medium);
  });
});

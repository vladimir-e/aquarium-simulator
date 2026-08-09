/**
 * What darkness costs a tank, over the days it takes to cost anything.
 *
 * The unit tests pin the mechanism a plant answers light with — the term on the
 * benefits, the upkeep ledger, the reserve line. What none of them can see is
 * that mechanism failing to *reach* a tank. An income that stopped multiplying
 * by light, or an upkeep the orchestrator stopped charging, leaves every one of
 * them green and puts the engine back where this branch found it: scoring pitch
 * black as recovery, every species at condition 100 after ninety days with the
 * lamps off and a net of +0.400 %/h.
 *
 * So the claims here are the outcome, asserted on runs rather than on inputs —
 * five species, ninety days, everything but the fixture held at optimum so the
 * fixture is the only thing free to hurt anything. Direction and ordering only,
 * the way the anchors stay while the plant seam is open. The magnitudes, the
 * blackout traces and the compensation points they sit on are the probe's:
 * `npm run probe:dark-tank`, written up in
 * `docs/calibration/runs/2026-08-08-reserve-by-priority.md` and moved a third
 * of a PAR unit by `2026-08-08-reserve-against-repair.md`, which is the run
 * the probe reproduces today.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SimulationState } from '../state.js';
import type { PlantSpecies } from '../plants/species.js';
import { runTank, type RunResult } from './metrics.js';
import {
  atOptimum,
  BLACKOUT_DAY,
  blackoutFrom,
  fixtureTank,
  LIGHT_RUN_DAYS,
  LIGHT_RUN_SEED,
  onePlant,
  PLANTED_AT,
  SPECIES_BY_HARDINESS,
  SPECIES_BY_LIGHT,
} from './tanks.js';

type Lighting = 'lit' | 'dark' | 'blackout';

const LIGHTING: Record<
  Lighting,
  { lit: boolean; hold: (state: SimulationState) => SimulationState }
> = {
  lit: { lit: true, hold: atOptimum },
  dark: { lit: false, hold: atOptimum },
  blackout: { lit: true, hold: blackoutFrom(BLACKOUT_DAY) },
};

interface Run {
  /** Sampled at midnight, so `samples[d]` is the tank at the end of day `d`. */
  run: RunResult;
  /** The day the plant left, or null if it held the whole run. */
  deathDay: number | null;
  /** What it read on the last hour it was alive — a dead tank samples as zeroes. */
  last: { condition: number; size: number };
}

function watchOne(lighting: Lighting, species: PlantSpecies): Run {
  const { lit, hold } = LIGHTING[lighting];
  let last = { condition: 100, size: PLANTED_AT };

  const run = runTank({
    setup: fixtureTank(lit),
    seed: onePlant(species),
    days: LIGHT_RUN_DAYS,
    routine: { hold },
    rngSeed: LIGHT_RUN_SEED,
    sampleHour: 0,
    watch: (_hour, _before, after) => {
      const plant = after.plants[0];
      if (plant !== undefined) last = { condition: plant.condition, size: plant.size };
    },
  });

  return { run, deathDay: run.plantDeaths[0]?.day ?? null, last };
}

const runsOf = (lighting: Lighting): Map<PlantSpecies, Run> =>
  new Map(SPECIES_BY_LIGHT.map((species) => [species, watchOne(lighting, species)]));

let lit: Map<PlantSpecies, Run>;
let dark: Map<PlantSpecies, Run>;
let blackout: Map<PlantSpecies, Run>;

beforeAll(() => {
  lit = runsOf('lit');
  dark = runsOf('dark');
  blackout = runsOf('blackout');
});

describe('a fixture that never comes on', () => {
  it('kills every species inside ninety days', () => {
    for (const species of SPECIES_BY_LIGHT) {
      expect(dark.get(species)!.deathDay).not.toBeNull();
    }
  });

  it('takes them in the order hardiness pays the bill', () => {
    // Darkness is graded by species, not by one rate applied to all five — and
    // in the dark it is hardiness that grades it: the light stressors self-zero
    // at light 0, leaving `upkeepCost × (1 − hardiness) × q10` as the only rate
    // still running. So the chain walks the hardiness order and not the light
    // one, which is the axis the claim is actually about.
    const days = SPECIES_BY_HARDINESS.map((species) => dark.get(species)!.deathDay!);

    // Hairgrass and monte carlo share a hardiness (0.3) and land on the same
    // day to the hour, so the chain has to permit equality. Which leaves it
    // satisfiable by five identical days: the spread is what rules that out and
    // makes the ordering a measurement rather than a tautology.
    expect(days[0]!).toBeGreaterThan(days[days.length - 1]!);
    for (const [i, day] of days.entries()) {
      if (i > 0) expect(day).toBeLessThanOrEqual(days[i - 1]!);
    }
  });

  it('spends the tissue and never the condition', () => {
    // Darkness is an unpaid bill, not damage: the light stressors self-zero at
    // light 0 and every other channel is held right, so what goes is size, and
    // the plant leaves on the size threshold at full health. A hair under 100
    // rather than at it because the hold writes nutrient masses off the water
    // it sees and the tick's evaporation moves the ppm underneath them.
    for (const species of SPECIES_BY_LIGHT) {
      const { last } = dark.get(species)!;
      expect(last.condition).toBeGreaterThan(99);
      expect(last.size).toBeLessThan(PLANTED_AT);
    }
  });
});

describe('the same tank with the fixture on', () => {
  it('holds every species at full condition and grows it', () => {
    // The control, and the half of the claim that keeps the other half honest:
    // a model harsh enough to melt a lit plant would satisfy every assertion
    // above.
    for (const species of SPECIES_BY_LIGHT) {
      const { run, deathDay } = lit.get(species)!;
      const plant = run.final.plants[0];

      expect(deathDay).toBeNull();
      expect(plant?.condition).toBe(100);
      expect(plant?.size).toBeGreaterThan(PLANTED_AT);
      expect(plant?.surplus).toBeGreaterThan(0);
    }
  });
});

describe('a blackout once the plant has grown in', () => {
  it('outlives the tank that never had light', () => {
    for (const species of SPECIES_BY_LIGHT) {
      expect(blackout.get(species)!.deathDay!).toBeGreaterThan(dark.get(species)!.deathDay!);
    }
  });

  it('drains the bank before it touches the plant', () => {
    for (const species of SPECIES_BY_LIGHT) {
      const { samples } = blackout.get(species)!.run;
      const day = (d: number): (typeof samples)[number] => samples[d]!;
      const switched = day(BLACKOUT_DAY);
      expect(switched.avgSurplus).toBeGreaterThan(0);

      const emptied = samples.findIndex(
        (sample, d) => d > BLACKOUT_DAY && sample.plants > 0 && sample.avgSurplus === 0
      );
      expect(emptied).toBeGreaterThan(BLACKOUT_DAY);

      // A bank falling every single dark day is what a negative net reads like
      // from outside the ledger — this is the reading that was +0.400 %/h.
      for (let d = BLACKOUT_DAY + 1; d <= emptied; d++) {
        expect(day(d).avgSurplus).toBeLessThan(day(d - 1).avgSurplus);
      }

      // And nothing is taken out of the plant while the reserve still covers
      // the bill: no light means no growth either, so the size holds flat.
      expect(day(emptied - 1).totalSize).toBe(switched.totalSize);
    }
  });
});

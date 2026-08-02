/**
 * Bacteria colony dynamics.
 *
 * Each colony is a stock moved by two rates: growth proportional to the share
 * of its processing capacity it actually used this tick, and an unconditional
 * maintenance decay. Nothing tests how much food is left over — a colony that
 * clears its whole load grows, and one with nothing to eat fades over weeks
 * rather than collapsing.
 */

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { createSimulation, type SimulationState } from '../state.js';
import { tick } from '../tick.js';
import { applyAction } from '../actions/index.js';
import { getPpm, getMassFromPpm } from '../resources/helpers.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../config/index.js';
import { calculateAmmoniaToNitrite, calculateMaxBacteria } from '../systems/nitrogen-cycle.js';

const DAY = 24;
const nc = DEFAULT_CONFIG.nitrogenCycle;

const ammoniaPpm = (s: SimulationState): number => getPpm(s.resources.ammonia, s.resources.water);
const nitritePpm = (s: SimulationState): number => getPpm(s.resources.nitrite, s.resources.water);
const ceiling = (s: SimulationState, config: TunableConfig = DEFAULT_CONFIG): number =>
  calculateMaxBacteria(s.resources.surface, config.nitrogenCycle);

/** A fishless soil tank with the volume held steady, as the leaching tests use. */
function soilTank(capacity: number): SimulationState {
  return createSimulation({
    tankCapacity: capacity,
    substrate: { type: 'aqua_soil' },
    ato: { enabled: true },
  });
}

function run(state: SimulationState, hours: number, config = DEFAULT_CONFIG): SimulationState {
  let running = state;
  for (let hour = 0; hour < hours; hour++) running = tick(running, config);
  return running;
}

/** A tank the bed has cycled on its own, the way a keeper waits before stocking. */
function cycledTank(capacity: number): SimulationState {
  return run(soilTank(capacity), 30 * DAY);
}

/** Hours for a colony to double with its substrate held non-limiting. */
function doublingHours(capacity: number, resource: 'aob' | 'nob'): number {
  let state = produce(createSimulation({ tankCapacity: capacity, ato: { enabled: true } }), (draft) => {
    draft.resources.aob = 1;
    draft.resources.nob = 1;
  });

  for (let hour = 1; hour <= 500; hour++) {
    state = produce(state, (draft) => {
      draft.resources.ammonia = getMassFromPpm(50, draft.resources.water);
      draft.resources.nitrite = getMassFromPpm(50, draft.resources.water);
    });
    state = tick(state, DEFAULT_CONFIG);
    if (state.resources[resource] >= 2) return hour;
  }
  throw new Error(`${resource} never doubled`);
}

/**
 * Settle a colony against a fixed ammonia inflow and read the utilization it
 * rests at, along with how full its ceiling is.
 */
function settle(
  capacity: number,
  inflowPpmPerHour: number,
  config: TunableConfig = DEFAULT_CONFIG
): { utilization: number; fill: number } {
  const feed = (state: SimulationState): SimulationState =>
    produce(state, (draft) => {
      draft.resources.ammonia += getMassFromPpm(inflowPpmPerHour, draft.resources.water);
    });

  let state = produce(createSimulation({ tankCapacity: capacity, ato: { enabled: true } }), (draft) => {
    draft.resources.aob = 5;
    draft.resources.nob = 5;
  });
  for (let hour = 0; hour < 300 * DAY; hour++) state = tick(feed(state), config);

  const settled = feed(state);
  return {
    utilization: calculateAmmoniaToNitrite(
      settled.resources.ammonia,
      settled.resources.aob,
      settled.resources.water,
      config.nitrogenCycle
    ).utilization,
    fill: state.resources.aob / ceiling(state, config),
  };
}

interface CycleTrace {
  peakPpm: number;
  peakDay: number;
  /** Day nitrite first drops under 0.1 ppm past the peak with nitrate still rising. */
  cycledDay: number | null;
}

function traceCycle(capacity: number, days = 40): CycleTrace {
  let state = soilTank(capacity);
  let peakPpm = 0;
  let peakHour = 0;
  let cycledHour: number | null = null;
  let previousNitrate = 0;

  for (let hour = 1; hour <= days * DAY; hour++) {
    state = tick(state, DEFAULT_CONFIG);
    const ppm = nitritePpm(state);

    if (ppm > peakPpm) {
      peakPpm = ppm;
      peakHour = hour;
    }
    if (cycledHour === null && peakPpm > 0.5 && ppm < 0.1 && state.resources.nitrate > previousNitrate) {
      cycledHour = hour;
    }
    previousNitrate = state.resources.nitrate;
  }

  return {
    peakPpm,
    peakDay: peakHour / DAY,
    cycledDay: cycledHour === null ? null : cycledHour / DAY,
  };
}

/** Cut every nitrogen source, leaving the colony nothing to live on. */
function starve(state: SimulationState): SimulationState {
  return produce(state, (draft) => {
    draft.resources.ammonia = 0;
    draft.resources.nitrite = 0;
    draft.resources.waste = 0;
    draft.equipment.substrate.organicReserve = 0;
  });
}

describe('bacteria colony dynamics', () => {
  describe('growth is per-capita, and per-capita is volume-blind', () => {
    it('doubles in the same time in a nano and in a 150 L', () => {
      expect(doublingHours(20, 'aob')).toBe(doublingHours(150, 'aob'));
      expect(doublingHours(20, 'nob')).toBe(doublingHours(150, 'nob'));
    });

    it('runs the whole cycle on the same clock at 20 L and 150 L', () => {
      const peak = (capacity: number): { ppm: number; hour: number } => {
        let state = soilTank(capacity);
        let ppm = 0;
        let hour = 0;
        for (let h = 1; h <= 40 * DAY; h++) {
          state = tick(state, DEFAULT_CONFIG);
          if (nitritePpm(state) > ppm) {
            ppm = nitritePpm(state);
            hour = h;
          }
        }
        return { ppm, hour };
      };

      const small = peak(20);
      const large = peak(150);

      expect(Math.abs(large.hour - small.hour)).toBeLessThanOrEqual(2);
      expect(large.ppm).toBeCloseTo(small.ppm, 1);
    });
  });

  describe('a colony under a steady load settles where its two rates cancel', () => {
    it('rests at the utilization that makes growth equal decay', () => {
      // Growth is g·u·(1 − p/K) and decay is d, so the fixed point is
      // u = d / (g·(1 − p/K)). This is the model's own arithmetic, and it
      // holds whether or not the ceiling is anywhere near.
      for (const capacity of [20, 150]) {
        for (const inflow of [0.002, 0.01]) {
          const { utilization, fill } = settle(capacity, inflow);
          const predicted = nc.bacteriaDeathRate / (nc.aobGrowthRate * (1 - fill));

          expect(utilization).toBeCloseTo(predicted, 3);
        }
      }
    });

    it('rests near deathRate / growthRate once the ceiling is out of the way', () => {
      const roomy = produce(DEFAULT_CONFIG, (draft) => {
        draft.nitrogenCycle.bacteriaPerCm2 = nc.bacteriaPerCm2 * 20;
      });
      const bare = nc.bacteriaDeathRate / nc.aobGrowthRate;

      for (const capacity of [20, 150]) {
        const { utilization, fill } = settle(capacity, 0.002, roomy);

        expect(fill).toBeLessThan(0.15);
        expect(utilization).toBeGreaterThan(bare);
        expect(utilization).toBeLessThan(bare * 1.2);
      }
    });

    it('never lets a colony past its ceiling', () => {
      let state = soilTank(20);
      for (let hour = 0; hour < 60 * DAY; hour++) {
        state = tick(state, DEFAULT_CONFIG);
        expect(state.resources.aob).toBeLessThanOrEqual(ceiling(state));
        expect(state.resources.nob).toBeLessThanOrEqual(ceiling(state));
      }
    });
  });

  describe('decay runs whether or not the colony is eating', () => {
    it('thins a colony at its half-life, and at the same rate in any volume', () => {
      const kept = (capacity: number, days: number): number => {
        const start = cycledTank(capacity);
        const before = start.resources.aob;
        return run(starve(start), days * DAY).resources.aob / before;
      };

      expect(kept(20, 21)).toBeCloseTo(0.5, 2);
      expect(kept(150, 21)).toBeCloseTo(kept(20, 21), 6);
    });

    it('takes the same bite out of a working colony as out of a starving one', () => {
      // A tank still leaching loses the same fraction per hour; it just makes
      // it back. The observable is that a fed colony grows and a cut-off one
      // does not, never that decay switched off.
      const fed = cycledTank(20);
      const cut = starve(fed);

      expect(run(cut, 7 * DAY).resources.aob).toBeLessThan(cut.resources.aob);
      expect(run(fed, 7 * DAY).resources.aob).toBeGreaterThan(run(cut, 7 * DAY).resources.aob);
    });
  });

  /**
   * CALIBRATION ANCHORS — claims about real aquariums, not about the engine.
   *
   * A feature PR may not widen a band to go green: if a change breaks one,
   * either the change is wrong or the coefficients need re-deriving against
   * the same real-world behaviour.
   *
   * The three cycling anchors — peak height, peak day, cycled day — are met on
   * a window of `spawnAmount` only 0.63–0.72 wide, and the value we ship sits
   * ~2 % inside the nearest band edge. They are not three independent readings
   * of one timeline: the bed's nitrogen budget is fixed, so delaying the peak
   * necessarily raises it. Whichever of them breaks first, the answer is not to
   * nudge `spawnAmount` back until it goes green again.
   *
   * Not anchored here: the **2 ppm dose test below a ~40 L tank.** A colony at
   * its ceiling clears `bacteriaPerCm2 × surface × bacteriaProcessingRate`
   * ppm/h, which in a 20 L is 1.71 ppm/day — under the dose, before any
   * question of how big the colony grew. That ceiling is also why the settled
   * utilization above sits well over deathRate/growthRate at ordinary loads:
   * the logistic brake, not maintenance decay, is what stops the colony.
   */
  describe('calibration anchors', () => {
    it('doubles AOB in 15–24 h and NOB in 24–48 h on non-limiting substrate', () => {
      const aob = doublingHours(20, 'aob');
      expect(aob).toBeGreaterThanOrEqual(15);
      expect(aob).toBeLessThanOrEqual(24);

      const nob = doublingHours(20, 'nob');
      expect(nob).toBeGreaterThanOrEqual(24);
      expect(nob).toBeLessThanOrEqual(48);
    });

    it('keeps most of the biofilter through a week away from the tank', () => {
      const start = cycledTank(20);
      const after = run(starve(start), 7 * DAY);

      expect(after.resources.aob / start.resources.aob).toBeGreaterThan(0.7);
    });

    it('loses half a cut-off colony over 2–4 weeks, not days', () => {
      const halfLifeDays = Math.LN2 / nc.bacteriaDeathRate / 24;

      expect(halfLifeDays).toBeGreaterThanOrEqual(14);
      expect(halfLifeDays).toBeLessThanOrEqual(28);
    });

    it('peaks nitrite at 2–5 ppm on day 12–16 and cycles by day 21–28', () => {
      for (const capacity of [20, 150]) {
        const { peakPpm, peakDay, cycledDay } = traceCycle(capacity);

        expect(peakPpm).toBeGreaterThanOrEqual(2);
        expect(peakPpm).toBeLessThanOrEqual(5);

        expect(peakDay).toBeGreaterThanOrEqual(12);
        expect(peakDay).toBeLessThanOrEqual(16);

        expect(cycledDay).not.toBeNull();
        expect(cycledDay!).toBeGreaterThanOrEqual(21);
        expect(cycledDay!).toBeLessThanOrEqual(28);
      }
    });

    it('never shows ammonia on a cycled tank fed its normal ration', () => {
      // No fish, so every gram of food decays — a heavier load than the same
      // ration passing through a stocked tank.
      for (const [capacity, ration] of [
        [20, 0.2],
        [150, 1.5],
      ] as [number, number][]) {
        let state = cycledTank(capacity);
        let peak = 0;

        for (let hour = 1; hour <= 30 * DAY; hour++) {
          if (hour % 24 === 0) state = applyAction(state, { type: 'feed', amount: ration }).state;
          state = tick(state, DEFAULT_CONFIG);
          peak = Math.max(peak, ammoniaPpm(state));
        }

        expect(peak).toBeLessThan(0.1);
      }
    });

    it('clears a 2 ppm dose to under 0.25 ppm within 24 h', () => {
      for (const capacity of [60, 150]) {
        let state = cycledTank(capacity);
        const ration = capacity * 0.01;
        for (let hour = 1; hour <= 30 * DAY; hour++) {
          if (hour % 24 === 0) state = applyAction(state, { type: 'feed', amount: ration }).state;
          state = tick(state, DEFAULT_CONFIG);
        }

        const dosed = produce(state, (draft) => {
          draft.resources.ammonia += getMassFromPpm(2, draft.resources.water);
        });
        expect(ammoniaPpm(dosed)).toBeGreaterThanOrEqual(2);

        expect(ammoniaPpm(run(dosed, DAY))).toBeLessThan(0.25);
      }
    });
  });
});

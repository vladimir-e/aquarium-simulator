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
import {
  DAY,
  colonyFill,
  cycledTank,
  doseClearance,
  fishlessTank,
  run,
  stock,
  traceCycle,
} from './tanks.js';

const nc = DEFAULT_CONFIG.nitrogenCycle;

const ammoniaPpm = (s: SimulationState): number => getPpm(s.resources.ammonia, s.resources.water);
const nitritePpm = (s: SimulationState): number => getPpm(s.resources.nitrite, s.resources.water);
const ceiling = (s: SimulationState, config: TunableConfig = DEFAULT_CONFIG): number =>
  calculateMaxBacteria(s.resources.surface, config.nitrogenCycle);

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
      config.nitrogenCycle
    ).utilization,
    fill: state.resources.aob / ceiling(state, config),
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
      const small = traceCycle(20);
      const large = traceCycle(150);

      expect(Math.abs(large.nitritePeakDay - small.nitritePeakDay) * DAY).toBeLessThanOrEqual(2);
      expect(large.nitritePeakPpm).toBeCloseTo(small.nitritePeakPpm, 1);
    });

    it('clears the same mass per bacterium whatever the tank holds', () => {
      // The units claim, read through the whole system rather than the
      // conversion function: a colony's throughput is a property of its cells.
      const cleared = (capacity: number): number => {
        const seeded = produce(
          createSimulation({ tankCapacity: capacity, ato: { enabled: true } }),
          (draft) => {
            draft.resources.aob = 1000;
            draft.resources.ammonia = getMassFromPpm(50, draft.resources.water);
          }
        );
        const after = tick(seeded, DEFAULT_CONFIG);
        return seeded.resources.ammonia - after.resources.ammonia;
      };

      expect(cleared(150)).toBeCloseTo(cleared(20), 10);
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

    it('rests near deathRate / growthRate, because the ceiling is far off', () => {
      const bare = nc.bacteriaDeathRate / nc.aobGrowthRate;

      for (const capacity of [20, 150]) {
        const { utilization, fill } = settle(capacity, 0.002);

        expect(fill).toBeLessThan(0.15);
        expect(utilization).toBeGreaterThan(bare);
        expect(utilization).toBeLessThan(bare * 1.2);
      }
    });

    it('never lets a colony past its ceiling', () => {
      let state = fishlessTank('aqua_soil', { capacity: 20 });
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
   * Two of them sit close to their limits, and that is structural rather than
   * a sign the fit is off. The bed's nitrogen budget is fixed, so a day of
   * delay in the nitrite peak converts directly into another day of it
   * standing as nitrite: peak height and cycled day are one degree of freedom,
   * not two. The passing window on `inoculumPerLiter` is the ~13 % band written
   * down in `config/nitrogen-cycle.ts` and swept in `inoculum-window.test.ts`,
   * bounded above by the 21-day cycled-day floor and below by the 5 ppm nitrite
   * ceiling. Whichever breaks first, the answer is not to nudge the inoculum
   * until it goes green.
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

    it('peaks nitrite at 2–5 ppm on day 12–16 and cycles by day 21–28', () => {
      for (const capacity of [20, 150]) {
        const { nitritePeakPpm, nitritePeakDay, cycledDay } = traceCycle(capacity);

        expect(nitritePeakPpm).toBeGreaterThanOrEqual(2);
        expect(nitritePeakPpm).toBeLessThanOrEqual(5);

        expect(nitritePeakDay).toBeGreaterThanOrEqual(12);
        expect(nitritePeakDay).toBeLessThanOrEqual(16);

        expect(cycledDay).not.toBeNull();
        expect(cycledDay!).toBeGreaterThanOrEqual(21);
        expect(cycledDay!).toBeLessThanOrEqual(28);
      }
    });

    it('holds that timeline from a nano to a stock tank', () => {
      // Organics scale with the tank, so the ppm curve has to as well. The
      // seed is counted per litre for exactly this reason.
      for (const capacity of [10, 1000]) {
        const { nitritePeakPpm, nitritePeakDay, cycledDay } = traceCycle(capacity);

        expect(nitritePeakPpm).toBeGreaterThanOrEqual(2);
        expect(nitritePeakPpm).toBeLessThanOrEqual(5);
        expect(nitritePeakDay).toBeGreaterThanOrEqual(12);
        expect(nitritePeakDay).toBeLessThanOrEqual(16);
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

    it('clears a 2 ppm dose to under 0.25 ppm within 24 h, at any volume', () => {
      // From a tank its own bed cycled and nothing else — feeding it first
      // would grow a colony the bed does not support, and the challenge would
      // then be reading the conditioning rather than the engine.
      for (const capacity of [20, 60, 150, 1000]) {
        expect(doseClearance(capacity)).toBeLessThan(0.25);
      }
    });

    it('leaves an ordinary roster nowhere near the surface ceiling', () => {
      // Surface is a cap for the overstocked, not a target a normal tank grows
      // into. Single-sex so the run measures the biofilter rather than the
      // breeding curve; weekly change so nitrate does not end it early.
      let state = stock(cycledTank(40), 'neon_tetra', 12, { sex: 'male' });

      for (let day = 1; day <= 120; day++) {
        for (let hour = 0; hour < DAY; hour++) {
          if (hour === 8) state = applyAction(state, { type: 'feed', amount: 0.05 }).state;
          if (day % 7 === 0 && hour === 18)
            state = applyAction(state, { type: 'waterChange', amount: 0.25 }).state;
          state = tick(state, DEFAULT_CONFIG);
        }
      }

      expect(state.fish).toHaveLength(12);
      expect(ammoniaPpm(state)).toBeLessThan(0.1);
      expect(nitritePpm(state)).toBeLessThan(0.1);
      expect(colonyFill(state, 'aob')).toBeLessThan(0.1);
    });
  });
});

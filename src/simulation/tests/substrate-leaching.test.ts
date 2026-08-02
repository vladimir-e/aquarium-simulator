/**
 * Substrate leaching integration tests.
 *
 * The substrate holds a finite organic reserve that drains into the waste
 * pool and mineralizes into ammonia. It is the only ammonia source in an
 * unfed, unstocked tank, so it alone decides whether — and when — a fresh
 * tank cycles.
 */

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { createSimulation } from '../state.js';
import { tick } from '../tick.js';
import { applyAction } from '../actions/index.js';
import { getPpm } from '../resources/helpers.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import {
  getSubstrateOrganicReserve,
  replaceSubstrate,
  type SubstrateType,
} from '../equipment/substrate.js';
import { calculatePassiveResources } from '../equipment/index.js';
import {
  NH3_TO_NO2_MASS_RATIO,
  NO2_TO_NO3_MASS_RATIO,
} from '../systems/nitrogen-cycle.js';
import { fishlessTank } from './tanks.js';
import type { SimulationState } from '../state.js';

const DAY = 24;
const SPAWN_THRESHOLD = DEFAULT_CONFIG.nitrogenCycle.aobSpawnThreshold;

interface Trace {
  /** Hour ammonia first reached the AOB spawn threshold, or null. */
  spawnHour: number | null;
  /** Highest ammonia concentration seen, ppm. */
  peakPpm: number;
  /** Ammonia concentration at each sampled hour, ppm. */
  ppm: number[];
  /** Grams that left the bed over the run. */
  leached: number;
  /** Fraction of the starting reserve still in the bed. */
  fractionLeft: number;
  final: SimulationState;
}

function trace(state: SimulationState, hours: number): Trace {
  const start = state.equipment.substrate.organicReserve;
  let running = state;
  let spawnHour: number | null = null;
  let peakPpm = 0;
  const ppm: number[] = [];

  for (let hour = 1; hour <= hours; hour++) {
    running = tick(running, DEFAULT_CONFIG);
    const now = getPpm(running.resources.ammonia, running.resources.water);
    ppm.push(now);
    if (now > peakPpm) peakPpm = now;
    if (spawnHour === null && now >= SPAWN_THRESHOLD) spawnHour = hour;
  }

  const left = running.equipment.substrate.organicReserve;
  return {
    spawnHour,
    peakPpm,
    ppm,
    leached: start - left,
    fractionLeft: start > 0 ? left / start : 0,
    final: running,
  };
}

describe('substrate leaching', () => {
  describe('the reserve is a stock the tank is born with', () => {
    it('fills from type and capacity when the tank is created', () => {
      for (const type of ['none', 'sand', 'gravel', 'aqua_soil'] as SubstrateType[]) {
        const state = createSimulation({ tankCapacity: 40, substrate: { type } });
        expect(state.equipment.substrate.organicReserve).toBeCloseTo(
          getSubstrateOrganicReserve(type, 40),
          12
        );
      }
    });

    it('doubles when tank capacity doubles', () => {
      const small = fishlessTank('aqua_soil', { capacity: 20 }).equipment.substrate.organicReserve;
      const large = fishlessTank('aqua_soil', { capacity: 40 }).equipment.substrate.organicReserve;

      expect(large).toBeCloseTo(small * 2, 12);
    });

    it('never increases while the bed stays in place', () => {
      for (const type of ['aqua_soil', 'gravel', 'sand', 'none'] as SubstrateType[]) {
        let state = fishlessTank(type);
        let previous = state.equipment.substrate.organicReserve;

        for (let hour = 0; hour < 28 * DAY; hour++) {
          state = tick(state, DEFAULT_CONFIG);
          const reserve = state.equipment.substrate.organicReserve;
          expect(reserve).toBeLessThanOrEqual(previous);
          previous = reserve;
        }
      }
    });

    it('never refills — a water change takes water, not soil', () => {
      let state = fishlessTank('aqua_soil');
      for (let hour = 0; hour < 10 * DAY; hour++) {
        state = tick(state, DEFAULT_CONFIG);
      }

      const before = state.equipment.substrate.organicReserve;
      const after = applyAction(state, { type: 'waterChange', amount: 0.5 }).state;

      expect(after.equipment.substrate.organicReserve).toBe(before);
      // What is already dissolved does leave with the water.
      expect(after.resources.nitrate).toBeLessThan(state.resources.nitrate);
    });
  });

  describe('a rescape', () => {
    /** Pull the old bed out and lay `type` in its place, as the UI does. */
    function rescape(state: SimulationState, type: SubstrateType): SimulationState {
      return produce(state, (draft) => {
        draft.equipment.substrate = replaceSubstrate(
          draft.equipment.substrate,
          type,
          draft.tank.capacity
        );
        draft.resources.surface = calculatePassiveResources(draft).surface;
      });
    }

    function runDown(): SimulationState {
      let state = fishlessTank('aqua_soil');
      for (let hour = 0; hour < 28 * DAY; hour++) {
        state = tick(state, DEFAULT_CONFIG);
      }
      return state;
    }

    it('costs the tank its ammonia ramp only by way of a real swap', () => {
      const spent = runDown();
      const held = spent.equipment.substrate.organicReserve;

      expect(rescape(spent, 'aqua_soil').equipment.substrate.organicReserve).toBe(held);

      const relaid = rescape(rescape(spent, 'none'), 'aqua_soil');
      expect(relaid.equipment.substrate.organicReserve).toBe(
        getSubstrateOrganicReserve('aqua_soil', relaid.tank.capacity)
      );
    });

    it('starts a fresh ammonia ramp the tank had stopped producing', () => {
      const spent = runDown();
      const before = trace(spent, 7 * DAY);
      const after = trace(rescape(rescape(spent, 'none'), 'aqua_soil'), 7 * DAY);

      // The biofilm the tank kept on its glass and filter eats the new bed's
      // output as fast as it appears, so the ramp shows in what the bed
      // delivers rather than in standing ammonia.
      expect(after.leached).toBeCloseTo(trace(fishlessTank('aqua_soil'), 7 * DAY).leached, 12);
      expect(after.leached).toBeGreaterThan(before.leached);
    });

    it('takes the biofilm with the bed, clipping a colony above the new ceiling', () => {
      const seeded = produce(fishlessTank('aqua_soil'), (draft) => {
        const ceiling = draft.resources.surface * DEFAULT_CONFIG.nitrogenCycle.bacteriaPerCm2;
        draft.resources.aob = ceiling;
        draft.resources.nob = ceiling;
      });

      const stripped = rescape(seeded, 'none');
      const ceiling = stripped.resources.surface * DEFAULT_CONFIG.nitrogenCycle.bacteriaPerCm2;
      expect(ceiling).toBeLessThan(
        seeded.resources.surface * DEFAULT_CONFIG.nitrogenCycle.bacteriaPerCm2
      );

      const settled = tick(stripped, DEFAULT_CONFIG);
      expect(settled.resources.aob).toBeLessThanOrEqual(ceiling);
      expect(settled.resources.nob).toBeLessThanOrEqual(ceiling);
    });
  });

  describe('the leach is a rate flowing into a stock', () => {
    it('drains the bed monotonically and tapers as it empties', () => {
      let state = fishlessTank('aqua_soil');
      let previous = state.equipment.substrate.organicReserve;
      let earlyLeach = 0;
      let lateLeach = 0;

      for (let hour = 1; hour <= 56 * DAY; hour++) {
        state = tick(state, DEFAULT_CONFIG);
        const reserve = state.equipment.substrate.organicReserve;
        expect(reserve).toBeLessThanOrEqual(previous);
        if (hour === 1) earlyLeach = previous - reserve;
        if (hour === 56 * DAY) lateLeach = previous - reserve;
        previous = reserve;
      }

      expect(lateLeach).toBeLessThan(earlyLeach * 0.05);
    });

    it('conserves mass: what leaves the bed shows up downstream', () => {
      const state = fishlessTank('aqua_soil');
      // Everything downstream, converted back to the ammonia it came from.
      const nitrogenIn = (s: SimulationState): number =>
        s.resources.waste * DEFAULT_CONFIG.nitrogenCycle.wasteToAmmoniaRatio +
        s.resources.ammonia +
        s.resources.nitrite / NH3_TO_NO2_MASS_RATIO +
        s.resources.nitrate / (NH3_TO_NO2_MASS_RATIO * NO2_TO_NO3_MASS_RATIO);

      const run = trace(state, 30 * DAY);
      const expected = run.leached * DEFAULT_CONFIG.nitrogenCycle.wasteToAmmoniaRatio;

      expect(nitrogenIn(run.final)).toBeCloseTo(expected, 4);
    });
  });

  describe('volume independence', () => {
    it('holds the ammonia curve steady from 20 L to 150 L', () => {
      const small = trace(fishlessTank('aqua_soil', { capacity: 20 }), 28 * DAY);
      const large = trace(fishlessTank('aqua_soil', { capacity: 150 }), 28 * DAY);

      expect(small.spawnHour).not.toBeNull();
      expect(large.spawnHour).not.toBeNull();
      expect(Math.abs(large.spawnHour! - small.spawnHour!)).toBeLessThanOrEqual(2);
      // Relative, because volume independence is a claim about the shape of
      // the curve, not about the height it happens to reach.
      expect(Math.abs(large.peakPpm - small.peakPpm) / small.peakPpm).toBeLessThan(0.01);

      // The rise is the bed's supply curve, and it is the same curve in both
      // tanks. Past the peak the biofilter, not the bed, sets the shape:
      // glass surface grows with the square of the tank's linear size while
      // the bed grows with volume, so a big tank carries slightly more
      // biofilm per litre and clears its ammonia a few hours sooner. That
      // difference is bounded below rather than matched hour for hour.
      const peakHour = small.ppm.indexOf(small.peakPpm);
      const rise = small.ppm
        .slice(0, peakHour + 1)
        .map((ppm, hour) => Math.abs(large.ppm[hour] - ppm));
      expect(Math.max(...rise)).toBeLessThan(small.peakPpm * 0.05);

      const cleared = (ppm: number[]): number =>
        ppm.findIndex((value, hour) => hour > peakHour && value < SPAWN_THRESHOLD);
      const clearedSmall = cleared(small.ppm);
      const clearedLarge = cleared(large.ppm);

      expect(clearedSmall).toBeGreaterThan(peakHour);
      expect(clearedLarge).toBeGreaterThan(peakHour);
      expect(Math.abs(clearedLarge - clearedSmall)).toBeLessThan(DAY);
    });

    it('scales the reserve with capacity so concentration does not', () => {
      const small = trace(fishlessTank('aqua_soil', { capacity: 20 }), 14 * DAY);
      const large = trace(fishlessTank('aqua_soil', { capacity: 150 }), 14 * DAY);

      expect(large.leached / small.leached).toBeCloseTo(150 / 20, 1);
      expect(large.peakPpm).toBeCloseTo(small.peakPpm, 1);
    });
  });

  describe('substrate ordering', () => {
    const substrates: SubstrateType[] = ['aqua_soil', 'gravel', 'sand', 'none'];

    it('ranks cumulative ammonia aqua_soil > gravel >= sand > none', () => {
      const [soil, gravel, sand, bare] = substrates.map(
        (type) => trace(fishlessTank(type), 28 * DAY).leached
      );

      expect(soil).toBeGreaterThan(gravel);
      expect(gravel).toBeGreaterThanOrEqual(sand);
      expect(sand).toBeGreaterThan(bare);
      expect(bare).toBe(0);
    });

    it('ranks spawn timing the same way, soonest first', () => {
      const [soil, gravel, sand, bare] = substrates.map(
        (type) => trace(fishlessTank(type), 56 * DAY).spawnHour
      );

      expect(soil).not.toBeNull();
      expect(soil!).toBeLessThan(gravel!);
      expect(gravel!).toBeLessThanOrEqual(sand!);
      expect(bare).toBeNull();
    });

    it('never gets a bare-bottom tank over the spawn threshold', () => {
      const bare = trace(fishlessTank('none'), 56 * DAY);

      expect(bare.peakPpm).toBe(0);
      expect(bare.final.resources.aob).toBe(0);
    });
  });

  /**
   * CALIBRATION ANCHORS — claims about real aquariums, not about the engine.
   *
   * A fresh aqua-soil bed is unstockable for weeks and a bare tank never
   * cycles unsupported; those are hobby facts, and the bands below encode
   * them. A feature PR may not widen a band to go green: if a change breaks
   * one, either the change is wrong or the coefficients need re-deriving
   * against the same real-world behaviour.
   *
   * Not anchored here: the ammonia *peak* a soil tank shows. The supply the
   * bed delivers does reach 2–5 ppm (see the supply-curve test below), but a
   * keeper never sees that on a test kit — the biofilter grows into the
   * supply and holds the standing reading far below it. The observable peak
   * is a fact about the colony, and it is anchored where the colony is:
   * `bacteria-colony.test.ts`.
   */
  describe('calibration anchors', () => {
    it('aqua soil crosses the spawn threshold in 2–4 days', () => {
      const run = trace(fishlessTank('aqua_soil'), 7 * DAY);

      expect(run.spawnHour).not.toBeNull();
      expect(run.spawnHour!).toBeGreaterThanOrEqual(2 * DAY);
      expect(run.spawnHour!).toBeLessThanOrEqual(4 * DAY);
    });

    it('aqua soil delivers 2–5 ppm of ammonia over the run', () => {
      // Supply, measured with the AOB step held off: this is what the bed
      // puts in the water, before the biofilter takes any of it.
      const noNitrifiers = produce(DEFAULT_CONFIG, (draft) => {
        draft.nitrogenCycle.aobSpawnThreshold = Number.MAX_SAFE_INTEGER;
      });

      let state = fishlessTank('aqua_soil');
      for (let hour = 0; hour < 56 * DAY; hour++) {
        state = tick(state, noNitrifiers);
      }

      const supplied = getPpm(state.resources.ammonia, state.resources.water);
      expect(supplied).toBeGreaterThanOrEqual(2);
      expect(supplied).toBeLessThanOrEqual(5);
    });

    it('aqua soil is spent by week 8', () => {
      const run = trace(fishlessTank('aqua_soil'), 56 * DAY);

      expect(run.fractionLeft).toBeLessThan(0.05);
    });

    it('gravel and sand cross the threshold in roughly 2–3 weeks, under 1 ppm', () => {
      for (const type of ['gravel', 'sand'] as SubstrateType[]) {
        const run = trace(fishlessTank(type), 28 * DAY);

        expect(run.spawnHour).not.toBeNull();
        expect(run.spawnHour!).toBeGreaterThanOrEqual(12 * DAY);
        expect(run.spawnHour!).toBeLessThanOrEqual(24 * DAY);
        expect(run.peakPpm).toBeLessThan(1);
      }
    });

    it('a bare tank never cycles on its own', () => {
      const run = trace(fishlessTank('none'), 56 * DAY);

      expect(run.spawnHour).toBeNull();
    });
  });
});

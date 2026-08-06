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
import { type SimulationState } from '../state.js';
import { tick } from '../tick.js';
import { applyAction } from '../actions/index.js';
import { getPpm, getMassFromPpm } from '../resources/helpers.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../config/index.js';
import {
  calculateAmmoniaToNitrite,
  calculateMaxBacteria,
  nitrifierOxygenFactor,
  nitrogenCycleSystem,
} from '../systems/nitrogen-cycle.js';
import { NH3_TO_NO2_MASS_RATIO } from '../core/chemistry.js';
import {
  SUBSTRATE_ORGANIC_PER_LITER,
  type SubstrateType,
} from '../equipment/substrate.js';
import { tuned } from './sweep.js';
import {
  DAY,
  type Circulation,
  type CycleTrace,
  colonyFill,
  cycledTank,
  doseClearance,
  saturatedColony,
  seededColony,
  fishlessTank,
  run,
  stock,
  traceCycle,
} from './tanks.js';

const nc = DEFAULT_CONFIG.nitrogenCycle;

/** Nitrification with no oxygen term at all — the counterfactual, not a tank. */
const AIRLESS = tuned((draft) => {
  draft.nitrogenCycle.aobOxygenHalfSaturation = 0;
  draft.nitrogenCycle.nobOxygenHalfSaturation = 0;
});

const ammoniaPpm = (s: SimulationState): number => getPpm(s.resources.ammonia, s.resources.water);
const nitritePpm = (s: SimulationState): number => getPpm(s.resources.nitrite, s.resources.water);
const ceiling = (s: SimulationState, config: TunableConfig = DEFAULT_CONFIG): number =>
  calculateMaxBacteria(s.resources.surface, config.nitrogenCycle);

/** Hours for a colony to double with its substrate held non-limiting. */
function doublingHours(capacity: number, resource: 'aob' | 'nob'): number {
  let state = seededColony(capacity, { aob: 1, nob: 1 });

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
 * rests at, along with how full its ceiling is and how much of its growth rate
 * the water's oxygen was leaving it.
 */
function settle(
  capacity: number,
  inflowPpmPerHour: number,
  config: TunableConfig = DEFAULT_CONFIG
): { utilization: number; fill: number; air: number } {
  const feed = (state: SimulationState): SimulationState =>
    produce(state, (draft) => {
      draft.resources.ammonia += getMassFromPpm(inflowPpmPerHour, draft.resources.water);
    });

  let state = seededColony(capacity, { aob: 5, nob: 5 });
  for (let hour = 0; hour < 300 * DAY; hour++) state = tick(feed(state), config);

  const settled = feed(state);
  return {
    utilization: calculateAmmoniaToNitrite(
      settled.resources.ammonia,
      settled.resources.aob,
      settled.resources.temperature,
      settled.resources.oxygen,
      config.nitrogenCycle
    ).utilization,
    fill: state.resources.aob / ceiling(state, config),
    air: nitrifierOxygenFactor('aob', settled.resources.oxygen, config.nitrogenCycle),
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
        const seeded = seededColony(capacity, { aob: 1000, ammoniaPpm: 50 });
        const after = tick(seeded, DEFAULT_CONFIG);
        return seeded.resources.ammonia - after.resources.ammonia;
      };

      expect(cleared(150)).toBeCloseTo(cleared(20), 10);
      expect(cleared(20)).toBeGreaterThan(0);
    });

    it('spends the same oxygen per bacterium whatever the tank holds', () => {
      // The other half of the units claim, and the half nothing was reading:
      // both oxidations bill the water in mg/L, so the mass behind that bill
      // has to be a property of the cells the way the throughput above is.
      const spent = (capacity: number): number => {
        const seeded = seededColony(capacity, {
          aob: 1000,
          nob: 1000,
          ammoniaPpm: 50,
          nitritePpm: 50,
        });
        const drawn = nitrogenCycleSystem
          .update(seeded, DEFAULT_CONFIG)
          .filter((effect) => effect.resource === 'oxygen')
          .reduce((sum, effect) => sum + effect.delta, 0);

        return getMassFromPpm(-drawn, seeded.resources.water);
      };

      expect(spent(1000)).toBeCloseTo(spent(10), 10);
      expect(spent(10)).toBeGreaterThan(0);
    });
  });

  describe('a colony under a steady load settles where its two rates cancel', () => {
    it('rests at the utilization that makes growth equal decay', () => {
      // Growth is g·a·u·(1 − p/K) against decay d, where `a` is what the water's
      // oxygen leaves of the growth rate — so the fixed point is
      // u = d / (g·a·(1 − p/K)). This is the model's own arithmetic, and it
      // holds whether or not the ceiling is anywhere near.
      for (const capacity of [20, 150]) {
        for (const inflow of [0.002, 0.01]) {
          const { utilization, fill, air } = settle(capacity, inflow);
          const predicted = nc.bacteriaDeathRate / (nc.aobGrowthRate * air * (1 - fill));

          expect(utilization).toBeCloseTo(predicted, 3);
        }
      }
    });

    it('rests near deathRate / growthRate, because the ceiling is far off', () => {
      for (const capacity of [20, 150]) {
        const { utilization, fill, air } = settle(capacity, 0.002);
        const bare = nc.bacteriaDeathRate / (nc.aobGrowthRate * air);

        expect(fill).toBeLessThan(0.15);
        expect(utilization).toBeGreaterThan(bare);
        expect(utilization).toBeLessThan(bare * 1.2);
      }
    });

    it('stops a colony short of its surface on air rather than on biofilm', () => {
      // A load big enough to fill the surface is a load big enough to strip the
      // oxygen first, so the biofilm ceiling is not what a real biofilter meets.
      // Take the term out and both colonies go back to resting on the surface,
      // at the fill where growth cancels decay: u = 1 leaves 1 − d/g.
      const held = saturatedColony(200, 40);
      const unlimited = saturatedColony(200, 40, { config: AIRLESS });

      expect(held.resources.oxygen).toBeLessThan(2);
      expect(colonyFill(held, 'nob')).toBeLessThan(colonyFill(held, 'aob'));
      expect(colonyFill(held, 'nob')).toBeLessThan(colonyFill(unlimited, 'nob') * 0.7);
      expect(colonyFill(unlimited, 'nob')).toBeCloseTo(
        1 - nc.bacteriaDeathRate / nc.nobGrowthRate,
        2
      );
    });

    it('leaves NOB where the circulation leaves the oxygen, and AOB barely notice', () => {
      // How far short the air stops a colony is a reading on the pumps, not a
      // property of the model: strip the tank of everything that moves water and
      // NOB hold a fiftieth of a ceiling AOB have all but reached, and every
      // point of that gap comes back with the circulation.
      const settles = (growthRate: number): number => 1 - nc.bacteriaDeathRate / growthRate;
      const still = saturatedColony(200, 40, { circulation: {} });
      const aerated = saturatedColony(200, 40, {
        circulation: { filter: 'canister', powerhead: 400, airPump: true },
      });

      expect(still.resources.oxygen).toBeLessThan(aerated.resources.oxygen);
      expect(colonyFill(still, 'aob')).toBeGreaterThan(settles(nc.aobGrowthRate) * 0.9);
      expect(colonyFill(still, 'nob')).toBeLessThan(settles(nc.nobGrowthRate) * 0.05);
      expect(colonyFill(aerated, 'nob')).toBeGreaterThan(settles(nc.nobGrowthRate) * 0.9);

      // Neither guild passes that fixed point whatever the air, because it is
      // the colony's own arithmetic and no amount of oxygen lifts it.
      expect(colonyFill(aerated, 'aob')).toBeLessThan(settles(nc.aobGrowthRate));
      expect(colonyFill(aerated, 'nob')).toBeLessThan(settles(nc.nobGrowthRate));
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
      // Decay reads temperature, not litres, and the two tanks sit a few
      // thousandths of a degree apart — heat in and out scale differently with
      // volume — so the match is to a part in ten thousand rather than exact.
      expect(kept(150, 21)).toBeCloseTo(kept(20, 21), 4);
    });

    it('takes the same bite out of a suffocating colony as out of a breathing one', () => {
      // The one nitrifier rate outside the oxygen term, and the reason an anoxic
      // tank loses its biofilter rather than pausing it: oxidation and growth
      // both stop, maintenance does not.
      const died = (oxygen: number): number => {
        const state = produce(cycledTank(20), (draft) => {
          draft.resources.oxygen = oxygen;
        });
        return -nitrogenCycleSystem
          .update(state, DEFAULT_CONFIG)
          .filter((effect) => effect.resource === 'aob' && effect.source === 'nitrogen-cycle-death')
          .reduce((sum, effect) => sum + effect.delta, 0);
      };

      expect(died(8)).toBeGreaterThan(0);
      expect(died(0.1)).toBeCloseTo(died(8), 12);
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

    it('takes about twice as long to cycle at 18 °C as at 25 °C', () => {
      // Nitrification is enzymatic, so a cold start is the keeper's own
      // observation: same tank, same bed, roughly double the wait.
      const days = (temperature: number): number =>
        traceCycle(150, { temperature, days: 90 }).cycledDay!;
      const reference = days(25);

      expect(days(18) / reference).toBeGreaterThan(1.6);
      expect(days(18) / reference).toBeLessThan(2.4);

      // And monotone in between, with a warm tank finishing early.
      expect(days(22)).toBeGreaterThan(reference);
      expect(days(28)).toBeLessThan(reference);
      expect(days(30)).toBeLessThan(days(28));
    });

    it('spikes nitrite on an inert bed too, in proportion to what that bed carries', () => {
      // AOB wait on a concentration while the bed leaches, so most of a weak
      // bed's nitrogen is standing as ammonia by the time they engage — and
      // NOB, doubling in 36 h against AOB's 20 h, are still behind when it
      // converts. The peak that leaves is bounded by the bed's whole budget
      // read as nitrite, and floored by the ammonia peak it came from.
      for (const substrate of ['gravel', 'sand'] as SubstrateType[]) {
        const { ammoniaPeakPpm, nitritePeakPpm } = traceCycle(20, { substrate, days: 60 });
        const budgetPpm = SUBSTRATE_ORGANIC_PER_LITER[substrate] * nc.wasteToAmmoniaRatio;

        expect(nitritePeakPpm).toBeGreaterThan(ammoniaPeakPpm * NH3_TO_NO2_MASS_RATIO);
        expect(nitritePeakPpm).toBeLessThan(budgetPpm * NH3_TO_NO2_MASS_RATIO);
      }
    });

    it('cycles a coarse bed later than a rich one, and inside six weeks', () => {
      // The dark start is the fast route because the bed is the ammonia
      // source: a thin one keeps the colony waiting rather than starting it
      // sooner.
      const cycled = (substrate: SubstrateType): number =>
        traceCycle(20, { substrate, days: 60 }).cycledDay!;

      expect(cycled('aqua_soil')).toBeLessThan(cycled('gravel'));
      expect(cycled('gravel')).toBeLessThan(cycled('sand'));
      expect(cycled('sand')).toBeLessThan(42);
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

    it('stands nitrite in a tank short of air, and never clears it in one with none', () => {
      // Nitrite in an under-aerated tank is a thing keepers see, and this is
      // where it comes from: NOB keep less of their rate than AOB at every
      // oxygen, so what leaves the first step outruns the second. Fed rather
      // than stocked, because a fish short of air excretes less and the load
      // would then be what differed between the rows instead of the air.
      const fed = (
        circulation: Circulation,
        feed: number,
        config: TunableConfig = DEFAULT_CONFIG
      ): CycleTrace => traceCycle(20, { temperature: 30, days: 60, circulation, feed, config });

      const aerated = fed({ filter: 'sponge', airPump: true }, 0.3);
      const still = fed({}, 0.3);

      expect(aerated.minOxygen).toBeGreaterThan(5);
      expect(still.minOxygen).toBeLessThan(1);
      expect(still.nitritePeakPpm).toBeGreaterThan(aerated.nitritePeakPpm);
      expect(still.cycledDay!).toBeGreaterThan(aerated.cycledDay!);

      // The control: the same still box with the term switched off cycles on
      // the aerated tank's clock, so what the two rows above read is the air
      // and not the ration.
      const withoutTheTerm = fed({}, 0.3, AIRLESS);
      expect(withoutTheTerm.nitritePeakPpm).toBeLessThan(aerated.nitritePeakPpm);
      expect(withoutTheTerm.cycledDay!).toBeLessThan(aerated.cycledDay!);

      // Twice the ration into the same still box, and it never gets there.
      expect(fed({}, 0.6).cycledDay).toBeNull();
    });

    it('clears a 2 ppm dose to under 0.25 ppm within 24 h, at any volume', () => {
      // From a tank its own bed cycled and nothing else — feeding it first
      // would grow a colony the bed does not support, and the challenge would
      // then be reading the conditioning rather than the engine.
      for (const capacity of [20, 60, 150, 1000]) {
        expect(doseClearance(cycledTank(capacity))).toBeLessThan(0.25);
      }
    });

    it('leaves an ordinary roster nowhere near the surface ceiling', () => {
      // Surface is a cap for the overstocked, not a target a normal tank grows
      // into. Single-sex so the run measures the biofilter rather than the
      // breeding curve; weekly change so nitrate does not end it early. Seeded
      // to the stream the ammonia probe's own 40 L runs on, so the anchor and
      // the measurement read one tank rather than two rosters.
      let state = stock(cycledTank(40, { rngSeed: 4242 }), 'neon_tetra', 12, { sex: 'male' });

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

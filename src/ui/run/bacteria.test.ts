import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import {
  bacteriaReadout,
  bacteriaSummary,
  biofilterColonisation,
  colonyCount,
  projectNitritePeak,
  type CycleProjection,
} from './bacteria';
import { DEFAULT_CONFIG, nitrogenCycleDefaults } from '../../simulation/config/index.js';
import { NO2_TO_NO3_MASS_RATIO } from '../../simulation/systems/nitrogen-cycle.js';
import {
  applyAction,
  createSimulation,
  tick,
  type Resources,
  type SimulationState,
} from '../../simulation/index.js';
import { getMassFromPpm, getPpm } from '../../simulation/resources/index.js';
import { cycledTank, fishlessTank, run as runUnfed, stock } from '../../simulation/tests/tanks.js';

const config = DEFAULT_CONFIG;
const perCm2 = nitrogenCycleDefaults.bacteriaPerCm2;
/** Fixed so every reading below is off one tank rather than a fresh roll. */
const RNG_SEED = 2026;

function resources(aob: number, nob: number, surface: number): Resources {
  return { aob, nob, surface } as Resources;
}

function tank(): SimulationState {
  return createSimulation({ tankCapacity: 200 }, undefined, RNG_SEED);
}

/**
 * Six tetras, all one sex. These runs stretch months past the nitrite peak, and
 * a mixed roster that breeds on the way there doubles the bioload behind the
 * reading — the projection would then be judged against a different tank than
 * the one it was taken from.
 *
 * Hardiness is flattened for the same reason: it scales every stressor for the
 * whole of a fish's life, so an unlucky draw can carry one of the six under
 * somewhere in those months and drop the bioload mid-reading. The health
 * jitter stays — ±5 points a fish recovers within days move nothing.
 */
function stocked(): SimulationState {
  return produce(stock(tank(), 'neon_tetra', 6, { sex: 'male' }), (draft) => {
    for (const fish of draft.fish) fish.hardinessOffset = 0;
  });
}

function run(state: SimulationState, hours: number): SimulationState {
  let running = state;
  for (let hour = 0; hour < hours; hour++) {
    if (hour % 24 === 0) running = applyAction(running, { type: 'feed', amount: 0.5 }).state;
    running = tick(running, config);
  }
  return running;
}

/** A stocked, fed tank run far enough that both colonies are working. */
function cycling(hours: number): SimulationState {
  return run(stocked(), hours);
}

/**
 * The same tank with its colonies seeded at the ceiling. The AOB stage is then
 * limited by the ammonia reaching it rather than by capacity, which is the only
 * regime where dropping a source of that ammonia changes the answer.
 */
function cycled(hours: number): SimulationState {
  const base = stocked();
  const ceiling = base.resources.surface * perCm2;
  return run(
    produce(base, (draft) => {
      draft.resources.aob = ceiling;
      draft.resources.nob = ceiling;
    }),
    hours
  );
}

/**
 * A tank whose colonies have grown as full as the model lets them: 40 days of
 * more ammonia every hour than they can clear parks AOB at 96 % of ceiling and
 * NOB at 93 %, the fixed point where growth cancels unconditional decay. The
 * dose is then withdrawn, so nothing is left standing for them to fall behind.
 */
function mature(): SimulationState {
  let state = produce(tank(), (draft) => {
    draft.resources.aob = 1;
    draft.resources.nob = 1;
  });
  for (let hour = 1; hour <= 40 * 24; hour++) {
    state = tick(
      produce(state, (draft) => {
        draft.resources.ammonia += getMassFromPpm(2, draft.resources.water);
      }),
      config
    );
  }
  return produce(state, (draft) => {
    draft.resources.ammonia = 0;
    draft.resources.nitrite = 0;
    draft.resources.waste = 0;
  });
}

/** What the next tick actually does to nitrite, split into its two rates (ppm/h). */
function engineNitrite(state: SimulationState): { produced: number; cleared: number } {
  const next = tick(state, config);
  const water = state.resources.water;
  const cleared =
    (next.resources.nitrate - state.resources.nitrate) / NO2_TO_NO3_MASS_RATIO / water;
  return {
    produced: (next.resources.nitrite - state.resources.nitrite) / water + cleared,
    cleared,
  };
}

/** Where nitrite actually tops out, run through the engine itself. */
function enginePeak(state: SimulationState): CycleProjection {
  let running = state;
  let ppm = 0;
  let hours = 0;
  for (let hour = 1; hour <= 24 * 180; hour++) {
    running = tick(running, config);
    const now = running.resources.nitrite / running.resources.water;
    if (now > ppm) {
      ppm = now;
      hours = hour;
    } else if (hours > 0 && now < ppm * 0.9) {
      break;
    }
  }
  return { hours, ppm };
}

describe('biofilterColonisation', () => {
  it('reads both colonies against their combined ceiling', () => {
    const ceiling = 1000 * perCm2;
    expect(biofilterColonisation(resources(ceiling, ceiling, 1000), nitrogenCycleDefaults)).toBe(100);
    expect(biofilterColonisation(resources(ceiling, 0, 1000), nitrogenCycleDefaults)).toBe(50);
  });

  it('is zero on a tank with no colonisable surface', () => {
    expect(biofilterColonisation(resources(0, 0, 0), nitrogenCycleDefaults)).toBe(0);
  });

  it('clamps a colony that overshoots its ceiling', () => {
    const ceiling = 1000 * perCm2;
    expect(biofilterColonisation(resources(ceiling * 4, ceiling, 1000), nitrogenCycleDefaults)).toBe(100);
  });
});

describe('colonyCount', () => {
  it('reads a population in cells whatever its order of magnitude', () => {
    expect(colonyCount(0)).toBe('0');
    expect(colonyCount(0.648)).toBe('648.0 k');
    expect(colonyCount(1)).toBe('1.0 M');
    expect(colonyCount(1e3)).toBe('1.0 G');
    expect(colonyCount(1e6)).toBe('1.0 T');
  });

  it('carries a rounded figure to the next prefix instead of overflowing this one', () => {
    expect(colonyCount(999_999)).toBe('1.0 T');
    expect(colonyCount(999_900)).toBe('999.9 G');
  });

  it('runs the ceilings the shipped tanks reach', () => {
    const ceiling = (state: SimulationState): string =>
      colonyCount(bacteriaReadout(state, config).aob.ceiling);

    expect(ceiling(cycledTank(20))).toMatch(/^\d+\.\d G$/);
    expect(ceiling(cycledTank(1000))).toMatch(/^\d+\.\d T$/);
  });
});

describe('bacteriaReadout', () => {
  it('measures each colony against its own ceiling, not the combined one', () => {
    const state = tank();
    const ceiling = state.resources.surface * perCm2;
    state.resources.aob = ceiling;
    state.resources.nob = ceiling / 2;

    const readout = bacteriaReadout(state, config);
    expect(readout.aob.ceiling).toBeCloseTo(ceiling, 6);
    expect(readout.aob.pct).toBeCloseTo(100, 6);
    expect(readout.nob.pct).toBeCloseTo(50, 6);
    expect(readout.colonisation).toBeCloseTo(75, 6);
    expect(readout.surface).toBe(state.resources.surface);
  });

  it('calls a fresh tank uncycled and a tank its bed cycled cycled', () => {
    expect(bacteriaReadout(tank(), config).cycled).toBe(false);
    expect(bacteriaReadout(cycledTank(200), config).cycled).toBe(true);
  });

  it('withholds it at the nitrite peak, where nitrite stops climbing but stands', () => {
    // The worst possible moment to tell a keeper to stock: production has just
    // tipped under consumption, with nitrite still near 5 ppm.
    const peak = runUnfed(fishlessTank('aqua_soil', { capacity: 150 }), 16 * 24);

    expect(getPpm(peak.resources.nitrite, peak.resources.water)).toBeGreaterThan(4);
    expect(bacteriaReadout(peak, config).cycled).toBe(false);
  });

  it('withholds it from a pair of colonies with nothing to do', () => {
    const state = tank();
    state.resources.aob = 1e-9;
    state.resources.nob = 1e-9;

    expect(bacteriaReadout(state, config).cycled).toBe(false);
  });

  it('withdraws it from a tank starved until the colony has faded', () => {
    // Both toxins have read zero for months — on colonies down to a hundredth
    // of what cycled this tank, which the next feeding would walk straight past.
    const starved = runUnfed(cycledTank(150), 150 * 24);
    const { resources } = starved;
    const readout = bacteriaReadout(starved, config);

    expect(getPpm(resources.ammonia, resources.water)).toBeLessThan(0.1);
    expect(getPpm(resources.nitrite, resources.water)).toBeLessThan(0.1);
    expect(resources.aob).toBeGreaterThan(0);
    expect(readout.cycled).toBe(false);
    expect(readout.atTrace).toBe(true);
    // The word the card prints is uncycled, so the sentence under it cannot be
    // the one that reassures a keeper the biofilter is keeping up.
    expect(bacteriaSummary(readout, null, config.nitrogenCycle)).toBe(
      `Both toxins read zero, on colonies too small to hold a feeding — ${Math.round(readout.colonisation)} % of the biofilm this tank offers.`
    );
  });

  it('holds it through a month of the ration the tank is used to', () => {
    let state = cycledTank(150);
    const uncycled: number[] = [];

    for (let hour = 1; hour <= 30 * 24; hour++) {
      if (hour % 24 === 0) state = applyAction(state, { type: 'feed', amount: 1.5 }).state;
      state = tick(state, config);
      if (!bacteriaReadout(state, config).cycled) uncycled.push(hour);
    }

    expect(uncycled).toEqual([]);
  });

  it('reports no conversion at all on a tank with nothing in it', () => {
    const { rates } = bacteriaReadout(tank(), config);
    expect(rates.wasteToAmmonia).toBe(0);
    expect(rates.gillsToAmmonia).toBe(0);
    expect(rates.ammoniaToNitrite).toBe(0);
    expect(rates.netNitrite).toBe(0);
  });

  it('nets nitrite as what AOB produce minus what NOB clear', () => {
    const state = cycling(24 * 10);
    const { rates } = bacteriaReadout(state, config);
    expect(rates.netNitrite).toBeCloseTo(rates.ammoniaToNitrite - rates.nitriteToNitrate, 12);
  });

  it('separates gill excretion from mineralised waste', () => {
    const state = cycling(24 * 3);
    expect(bacteriaReadout(state, config).rates.gillsToAmmonia).toBeGreaterThan(0);
  });

  it('puts the engine’s own two rates on the card once the biofilter is cycled', () => {
    const state = cycled(24 * 20);
    const { rates } = bacteriaReadout(state, config);
    const engine = engineNitrite(state);

    expect(rates.ammoniaToNitrite).toBeCloseTo(engine.produced, 9);
    expect(rates.nitriteToNitrate).toBeCloseTo(engine.cleared, 9);
    expect(rates.netNitrite).toBeCloseTo(engine.produced - engine.cleared, 9);
  });

  it('nets nitrite the way the next tick actually moves it, climbing and falling', () => {
    for (const days of [9, 16]) {
      const state = cycling(24 * days);
      const { rates } = bacteriaReadout(state, config);
      const engine = engineNitrite(state);
      const moved =
        (tick(state, config).resources.nitrite - state.resources.nitrite) / state.resources.water;

      // Both colonies are still capacity-bound here, and the engine sizes that
      // capacity on the volume left after the hour's evaporation, so the card
      // reads a fraction of a percent hot rather than exactly.
      expect(rates.ammoniaToNitrite).toBeCloseTo(engine.produced, 4);
      expect(rates.nitriteToNitrate).toBeCloseTo(engine.cleared, 4);
      expect(Math.sign(rates.netNitrite)).toBe(Math.sign(moved));
      expect(rates.netNitrite).toBeCloseTo(moved, 4);
    }
  });
});

describe('projectNitritePeak', () => {
  it('finds the peak the engine reaches on a tank left to evaporate', () => {
    const state = fishlessTank('aqua_soil', { capacity: 200, ato: false });
    const projection = projectNitritePeak(state, config);
    const engine = enginePeak(state);

    expect(projection!.hours).toBeGreaterThanOrEqual(engine.hours - 2);
    expect(projection!.hours).toBeLessThanOrEqual(engine.hours + 2);
    expect(projection!.ppm).toBeCloseTo(engine.ppm, 2);
  });

  it('finds a lower peak once an ATO is holding the volume up', () => {
    const state = fishlessTank('aqua_soil', { capacity: 200, ato: false });
    state.equipment.ato.enabled = true;
    const projection = projectNitritePeak(state, config);
    const engine = enginePeak(state);

    expect(projection!.hours).toBeGreaterThanOrEqual(engine.hours - 2);
    expect(projection!.hours).toBeLessThanOrEqual(engine.hours + 2);
    expect(projection!.ppm).toBeCloseTo(engine.ppm, 2);

    const evaporating = projectNitritePeak(fishlessTank('aqua_soil', { capacity: 200, ato: false }), config)!;
    expect(projection!.ppm).toBeLessThan(evaporating.ppm);
  });

  it('tracks a stocked tank’s peak across a horizon that outruns its premise', () => {
    const state = cycling(24 * 9);
    const projection = projectNitritePeak(state, config);
    const engine = enginePeak(state);

    // "If nothing else changes" is a week-long assumption on a tank nine days
    // in, and the biggest thing still changing is the colony itself: it is
    // doubling under the projection's frozen inflow, so the engine reaches a
    // higher peak sooner than the snapshot predicts. Measured h241 @ 3.21 ppm
    // against h169 @ 3.85 ppm — the right regime, not a match, and the card
    // says "if nothing else changes" for exactly this reason.
    expect(projection!.hours).toBeGreaterThan(engine.hours);
    expect(projection!.hours).toBeLessThan(engine.hours * 1.5);
    expect(projection!.ppm).toBeLessThan(engine.ppm);
    expect(projection!.ppm).toBeGreaterThan(engine.ppm * 0.8);
  });

  it('gives up rather than guessing when nothing is driving the cycle', () => {
    const state = tank();
    expect(projectNitritePeak(state, config, 24)).toBeNull();
  });

  it('cannot project a tank with no water or no surface', () => {
    const dry = tank();
    dry.resources.water = 0;
    expect(projectNitritePeak(dry, config)).toBeNull();

    const bare = tank();
    bare.resources.surface = 0;
    expect(projectNitritePeak(bare, config)).toBeNull();
  });
});

describe('bacteriaSummary', () => {
  const nc = config.nitrogenCycle;

  it('explains an uncycled tank by the threshold AOB are waiting for', () => {
    const state = tank();
    const summary = bacteriaSummary(
      bacteriaReadout(state, config),
      projectNitritePeak(state, config, 24),
      nc
    );
    expect(summary).toContain('Uncycled');
    expect(summary).toContain(`${nc.aobSpawnThreshold} ppm`);
    expect(summary).toContain('No nitrite peak within');
  });

  it('blames the lagging colony while nitrite is climbing', () => {
    const state = cycling(24 * 9);
    const readout = bacteriaReadout(state, config);
    expect(readout.rates.netNitrite).toBeGreaterThan(0);
    expect(readout.nob.pct).toBeLessThan(readout.aob.pct);

    const summary = bacteriaSummary(readout, projectNitritePeak(state, config), nc);
    expect(summary).toContain('NOB trail AOB by');
    expect(summary).toContain('Nitrite peaks in');
  });

  it('calls out the surface as the limit once a colony has filled it', () => {
    const readout = bacteriaReadout(mature(), config);

    // The line has to be reachable from a state the engine produces: decay is
    // unconditional, so neither colony ever arrives at 100 % of its ceiling.
    expect(readout.aob.pct).toBeLessThan(100);
    expect(readout.nob.pct).toBeLessThan(100);
    expect(bacteriaSummary(readout, null, nc)).toContain('more load has nowhere to go');
  });

  it('reads a colony below its ceiling as room left rather than as a shortfall', () => {
    const state = tank();
    state.resources.aob = state.resources.surface * perCm2 * 0.5;
    state.resources.nob = state.resources.surface * perCm2 * 0.5;

    const summary = bacteriaSummary(bacteriaReadout(state, config), null, nc);
    expect(summary).toContain('clearing nitrite');
    expect(summary).toContain('50 % of the biofilm this tank offers');
  });
});

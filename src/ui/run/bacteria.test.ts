import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  bacteriaReadout,
  bacteriaSummary,
  biofilterColonisation,
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
import { getMassFromPpm } from '../../simulation/resources/index.js';
import { fishlessTank } from '../../simulation/tests/tanks.js';

const config = DEFAULT_CONFIG;
const perCm2 = nitrogenCycleDefaults.bacteriaPerCm2;

function resources(aob: number, nob: number, surface: number): Resources {
  return { aob, nob, surface } as Resources;
}

function tank(): SimulationState {
  return createSimulation({ tankCapacity: 200 });
}

function stocked(): SimulationState {
  let state = tank();
  for (let i = 0; i < 6; i++) {
    state = applyAction(state, { type: 'addFish', species: 'neon_tetra' }).state;
  }
  return state;
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
  return run({ ...base, resources: { ...base.resources, aob: ceiling, nob: ceiling } }, hours);
}

/**
 * A tank whose colonies have grown as full as the model lets them: 40 days of
 * more ammonia every hour than they can clear parks AOB at 96 % of ceiling and
 * NOB at 93 %, the fixed point where growth cancels unconditional decay. The
 * dose is then withdrawn, so nothing is left standing for them to fall behind.
 */
function mature(): SimulationState {
  const base = tank();
  let state = { ...base, resources: { ...base.resources, aob: 1, nob: 1 } };
  for (let hour = 1; hour <= 40 * 24; hour++) {
    const { water, ammonia } = state.resources;
    state = tick(
      { ...state, resources: { ...state.resources, ammonia: ammonia + getMassFromPpm(2, water) } },
      config
    );
  }
  return { ...state, resources: { ...state.resources, ammonia: 0, nitrite: 0, waste: 0 } };
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

// Fish arrive with sampled health and hardiness; pinning the sample keeps every
// fixture below reproducible run to run.
beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it('calls a fresh tank uncycled and a colonised one cycled', () => {
    expect(bacteriaReadout(tank(), config).cycled).toBe(false);

    const state = tank();
    state.resources.aob = state.resources.surface * perCm2;
    state.resources.nob = state.resources.surface * perCm2;
    expect(bacteriaReadout(state, config).cycled).toBe(true);
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

  it('gives a fully grown biofilter its own line', () => {
    const readout = bacteriaReadout(mature(), config);

    // The line has to be reachable from a state the engine produces: decay is
    // unconditional, so neither colony ever arrives at 100 % of its ceiling.
    expect(readout.aob.pct).toBeLessThan(100);
    expect(readout.nob.pct).toBeLessThan(100);
    expect(bacteriaSummary(readout, null, nc)).toContain('up against their ceiling');
  });

  it('reports a colony still climbing toward its ceiling as clearing what it makes', () => {
    const state = tank();
    state.resources.aob = state.resources.surface * perCm2 * 0.5;
    state.resources.nob = state.resources.surface * perCm2 * 0.5;
    expect(bacteriaSummary(bacteriaReadout(state, config), null, nc)).toContain('clearing nitrite');
  });
});

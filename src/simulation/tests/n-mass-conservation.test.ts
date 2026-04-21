/**
 * End-to-end nitrogen mass conservation test.
 *
 * The calibration-foundation PR's thesis is stoichiometric honesty: every
 * N atom entering the system should be accounted for in the compound
 * pools at any later point in time, modulo known sinks (plant uptake,
 * water-change dilution, the oxidized-food fraction during decay).
 *
 * This file traces N atoms through the full pipeline via three
 * complementary scenarios:
 *
 *  1. Direct NH3 injection. Ammonia → nitrite → nitrate. Tests the
 *     bacteria chain's N-conservation with no food / waste complications.
 *  2. Direct waste injection. Waste → NH3 → NO2 → NO3. Adds the
 *     waste-mineralization step on top of the chain.
 *  3. Fed-fish integration. Food → fish gill NH3 + feces waste →
 *     mineralization chain → NO3. This is the real-world path and the
 *     hardest to verify: the decay subsystem has a known N sink (the
 *     "oxidized" fraction of decaying food is not tracked), so the
 *     scenario is structured so fish consume essentially all food each
 *     tick — turning the decay path off by starvation.
 *
 * Conversion rules (from `src/simulation/systems/nitrogen-cycle.ts` and
 * `src/simulation/systems/metabolism.ts`):
 *   - Food N content (g)  = foodMass (g) × foodNitrogenFraction (5 %)
 *   - Waste N content (g) = wasteMass (g) × wasteToAmmoniaRatio (mg NH3/g)
 *                           × MW_N / (MW_NH3 × 1000)   → ≈ 4.94 % N
 *   - NH3 N content (g)   = ammoniaMg × MW_N / MW_NH3 / 1000
 *   - NO2 N content (g)   = nitriteMg × MW_N / MW_NO2 / 1000
 *   - NO3 N content (g)   = nitrateMg × MW_N / MW_NO3 / 1000
 *   - Basal N injected    = basalAmmoniaRate × fishMass × ticks
 *                           × MW_N / (MW_NH3 × 1000)
 *
 * Known sinks we must control for:
 *   - Decay oxidation. When food decays, `wasteConversionRatio` (40 %)
 *     becomes waste; the rest is oxidized to CO2/O2 — the engine does
 *     NOT track N in the oxidized fraction. Avoid this path by driving
 *     fish with steady light feeding they can keep up with.
 *   - Plant uptake. No plants added in any scenario.
 *   - Water change. No water-change actions applied.
 *   - Ambient waste. Disabled via config override.
 *   - NH3 gas off-gassing. Not modeled in the engine → nothing to
 *     subtract.
 */

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { tick } from '../tick.js';
import { applyAction } from '../actions/index.js';
import {
  createCycledTank,
  addFish,
} from '../calibration/helpers.js';
import { DEFAULT_CONFIG } from '../config/index.js';
import {
  MW_N,
  MW_NH3,
  MW_NO2,
  MW_NO3,
} from '../systems/nitrogen-cycle.js';
import type { SimulationState } from '../state.js';
import type { TunableConfig } from '../config/index.js';

/**
 * Total elemental-N mass (grams) currently held in the tank's pools.
 * Includes un-eaten food, waste, and the three chain compounds.
 */
function totalNInPools(state: SimulationState, config: TunableConfig): number {
  const { food, waste, ammonia, nitrite, nitrate } = state.resources;

  const nInFood = food * config.livestock.foodNitrogenFraction;
  // Waste N content is defined by `wasteToAmmoniaRatio` (mg NH3/g waste):
  //   wasteToAmmoniaRatio × MW_N / MW_NH3 mg N per g waste.
  const nPerGramWaste =
    (config.nitrogenCycle.wasteToAmmoniaRatio * MW_N) / MW_NH3 / 1000;
  const nInWaste = waste * nPerGramWaste;
  const nInAmmonia = (ammonia * MW_N) / MW_NH3 / 1000;
  const nInNitrite = (nitrite * MW_N) / MW_NO2 / 1000;
  const nInNitrate = (nitrate * MW_N) / MW_NO3 / 1000;

  return nInFood + nInWaste + nInAmmonia + nInNitrite + nInNitrate;
}

/** Config variant with ambient waste disabled — the default bookkeeping sink. */
function noAmbientConfig(): TunableConfig {
  return produce(DEFAULT_CONFIG, (draft) => {
    draft.decay.ambientWaste = 0;
  });
}

describe('N mass conservation (end-to-end)', () => {
  it('direct NH3 injection: conserved through NH3 → NO2 → NO3 chain', () => {
    const config = noAmbientConfig();
    let state = createCycledTank(
      { tankCapacity: 150 },
      { nitratePpm: 0, aobFraction: 1.0, nobFraction: 1.0 }
    );

    const INJECTED_NH3_MG = 50;
    state = produce(state, (draft) => {
      draft.resources.ammonia = INJECTED_NH3_MG;
    });

    const initialN = totalNInPools(state, config);

    for (let i = 0; i < 1000; i++) {
      state = tick(state, config);
    }

    expect(state.resources.ammonia).toBeLessThan(0.5);
    expect(state.resources.nitrite).toBeLessThan(0.5);

    const finalN = totalNInPools(state, config);
    expect(Math.abs(finalN - initialN) / initialN).toBeLessThan(0.005);
  });

  it('direct waste injection: conserved through mineralization + chain', () => {
    const config = noAmbientConfig();
    let state = createCycledTank(
      { tankCapacity: 150 },
      { nitratePpm: 0, aobFraction: 1.0, nobFraction: 1.0 }
    );

    const INJECTED_WASTE_G = 10;
    state = produce(state, (draft) => {
      draft.resources.waste = INJECTED_WASTE_G;
    });

    const initialN = totalNInPools(state, config);

    for (let i = 0; i < 2000; i++) {
      state = tick(state, config);
    }

    expect(state.resources.waste).toBeLessThan(0.05);

    const finalN = totalNInPools(state, config);
    expect(Math.abs(finalN - initialN) / initialN).toBeLessThan(0.005);
  });

  it('fed-fish integration: food + basal N accounted for, including decay-oxidation sink', () => {
    // Realistic scenario: 5 neon tetras fed once a day over ~42 days.
    // This exercises the full pipeline (food → fish gill NH3 + feces →
    // mineralization → NO3) and also surfaces the engine's one known
    // N-accounting gap: the `decay` system oxidizes a fraction
    // (`1 - wasteConversionRatio` = 60 %) of decaying food mass to
    // CO2/O2 but does NOT track N content of the oxidized fraction.
    //
    // That gap is a separate design concern (see PR follow-ups). The
    // test bounds the gap explicitly: N actually in pools must be
    // between the floor (accounting for worst-case full oxidation of
    // any food that decayed rather than was eaten) and the ceiling
    // (perfect conservation).
    const TICKS = 1000;
    const config = noAmbientConfig();
    const DAILY_FEED = 0.03;

    let state = createCycledTank(
      { tankCapacity: 150 },
      { nitratePpm: 5, aobFraction: 1.0, nobFraction: 1.0 }
    );
    state = addFish(state, 'neon_tetra', 5);

    const initialN = totalNInPools(state, config);
    const fishMass = state.fish.reduce((sum, f) => sum + f.mass, 0);
    expect(fishMass).toBeGreaterThan(0);

    let totalFoodAdded = 0;

    for (let t = 1; t <= TICKS; t++) {
      if (t % 24 === 1) {
        state = applyAction(state, { type: 'feed', amount: DAILY_FEED }).state;
        totalFoodAdded += DAILY_FEED;
      }
      state = tick(state, config);
    }

    const nFromFood = totalFoodAdded * config.livestock.foodNitrogenFraction;
    const basalNH3PerTick = config.livestock.basalAmmoniaRate * fishMass;
    const nFromBasal = (basalNH3PerTick * TICKS * MW_N) / MW_NH3 / 1000;

    const nInjected = nFromFood + nFromBasal;
    const nExpectedCeiling = initialN + nInjected;

    // Worst-case N loss: the entire food ration decayed (none eaten),
    // the oxidized fraction (1 - wasteConversionRatio) vanished.
    const oxidizedFraction = 1 - config.decay.wasteConversionRatio;
    const maxDecayLoss = nFromFood * oxidizedFraction;
    const nExpectedFloor = nExpectedCeiling - maxDecayLoss;

    const nActual = totalNInPools(state, config);

    // N in pools should lie between the floor (full oxidation loss) and
    // the ceiling (perfect conservation), with a tiny slack for
    // rounding in the bacteria update loop.
    const slack = 0.005 * nExpectedCeiling;
    expect(nActual).toBeGreaterThanOrEqual(nExpectedFloor - slack);
    expect(nActual).toBeLessThanOrEqual(nExpectedCeiling + slack);

    // Sanity: at least one of food, NH3, or NO3 must be non-trivial
    // (the test is meaningful).
    expect(state.resources.nitrate).toBeGreaterThan(initialN * 1000);
  });

  it('fasted-fish integration: basal-only N matches pool delta', () => {
    // Edge case — no food at all. Only source of N is fish basal
    // excretion. Pure test of the basal pathway + chain conservation.
    const TICKS = 500;
    const config = noAmbientConfig();

    let state = createCycledTank(
      { tankCapacity: 150 },
      { nitratePpm: 5, aobFraction: 1.0, nobFraction: 1.0 }
    );
    state = addFish(state, 'guppy', 10);

    const initialN = totalNInPools(state, config);
    const fishMass = state.fish.reduce((sum, f) => sum + f.mass, 0);

    for (let t = 1; t <= TICKS; t++) {
      state = tick(state, config);
    }

    const basalNH3PerTick = config.livestock.basalAmmoniaRate * fishMass;
    const nFromBasal = (basalNH3PerTick * TICKS * MW_N) / MW_NH3 / 1000;
    const nExpected = initialN + nFromBasal;
    const nActual = totalNInPools(state, config);

    // Tight tolerance: no food pathway means no decay oxidation risk.
    const tolerance = 0.005 * nExpected;
    expect(Math.abs(nActual - nExpected)).toBeLessThan(tolerance);
  });
});

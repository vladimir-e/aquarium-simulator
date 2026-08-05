/**
 * Reproduction orchestrator — the ACTIVE-tier step that turns banked
 * vitality surplus into offspring. Runs right after `processLivestock`
 * (see `tick.ts`); it mutates `state.fish` and `state.clutches` directly
 * because it *adds* organisms, which the effect system can't express.
 *
 * Past a pair grown to `maturityAge`, the gate is deliberately *only* the
 * banks plus a live-trend check — no condition/temperature/pH tests.
 * Surplus accrues only at full health under a sustained positive net rate,
 * so a fish that can afford the cost has already proven its environment is
 * good; re-checking would double-count what accrual encodes. The one extra
 * guard: the female's net rate this tick must be ≥ 0, so a buffered fish
 * riding old savings through a crashing tank can't breed. Re-accruing the
 * spent surplus is the cooldown — there are no timers.
 *
 * See `docs/7-LIVESTOCK.md` § Reproduction for the full pipeline (grow /
 * mature fry → hatch clutches → spawn) and the per-species parameters.
 */

import { produce } from 'immer';
import type { SimulationState, Fish, Clutch } from '../state.js';
import type { FishSpecies } from '../livestock/species.js';
import { FISH_SPECIES_DATA } from '../livestock/species.js';
import type { LivestockConfig } from '../config/livestock.js';
import { livestockDefaults } from '../config/livestock.js';
import type { TunableConfig } from '../config/index.js';
import { createLog } from '../core/logging.js';
import { drawId } from '../core/rng.js';
import { createFish, fishMassForAge } from './create-fish.js';

export interface BreedingProcessingResult {
  /** Updated state with grown fry, hatched clutches, and new offspring. */
  state: SimulationState;
}

const SPECIES_IDS = Object.keys(FISH_SPECIES_DATA) as FishSpecies[];

/**
 * Process reproduction for one tick. See the module docstring for the
 * ordered pipeline.
 *
 * @param state - Current state (fish already metabolized/health-checked).
 * @param config - Tunable configuration (for `surplusCap`).
 * @param netByFishId - Per-fish vitality net rate from this tick's health
 *   pass; a female breeds only if her entry is ≥ 0.
 */
export function processBreeding(
  state: SimulationState,
  config: TunableConfig,
  netByFishId: Map<string, number>
): BreedingProcessingResult {
  const livestockConfig = config.livestock ?? livestockDefaults;

  // Nothing to do in an empty tank with no clutches in the water.
  if (state.fish.length === 0 && state.clutches.length === 0) {
    return { state };
  }

  const newState = produce(state, (draft) => {
    growAndMatureFry(draft.fish);
    hatchClutches(draft);
    spawn(draft, livestockConfig, netByFishId);
  });

  return { state: newState };
}

/**
 * Re-derive each fry's mass from its age and promote it to adult once it
 * reaches `maturityAge`. Adults are untouched (their mass is already
 * `adultMass`).
 */
function growAndMatureFry(fish: Fish[]): void {
  for (const f of fish) {
    if (f.stage !== 'fry') continue;
    const { maturityAge } = FISH_SPECIES_DATA[f.species].breeding;
    if (f.age >= maturityAge) {
      f.stage = 'adult';
      f.mass = FISH_SPECIES_DATA[f.species].adultMass;
    } else {
      f.mass = fishMassForAge(f.species, f.age, 'fry');
    }
  }
}

/** Hatch every clutch that has reached its hatch time into fry. */
function hatchClutches(draft: SimulationState): void {
  if (draft.clutches.length === 0) return;

  const remaining: Clutch[] = [];
  for (const clutch of draft.clutches) {
    const { hatchTime } = FISH_SPECIES_DATA[clutch.species].breeding;
    if (draft.tick < clutch.laidTick + hatchTime) {
      remaining.push(clutch);
      continue;
    }
    for (let i = 0; i < clutch.eggCount; i++) {
      draft.fish.push(
        createFish({ species: clutch.species, age: 0, stage: 'fry', rng: draft.rng })
      );
    }
    draft.logs.push(
      createLog(
        draft.tick,
        'simulation',
        'info',
        `${clutch.eggCount} ${FISH_SPECIES_DATA[clutch.species].name} eggs hatched`,
        'eggs-hatched',
        clutch.eggCount
      )
    );
  }
  draft.clutches = remaining;
}

/**
 * Whether a fish is old enough to breed. `stage` and `age` are stored
 * independently — a seed may name a grown-looking fish younger than its
 * species matures — so the spawn gate asks both.
 */
function isBreedingAdult(fish: Fish): boolean {
  return fish.stage === 'adult' && fish.age >= FISH_SPECIES_DATA[fish.species].breeding.maturityAge;
}

/**
 * Run the spawn pass across every species with a mature pair. Females
 * spend `costFraction × surplusCap`; each spawn is served by a male who
 * pays `maleShareFraction × cost`. A male serves females (in order) until
 * his bank can't cover the share, then the next male takes over; when no
 * male can pay, the species is done for this tick.
 */
function spawn(
  draft: SimulationState,
  config: LivestockConfig,
  netByFishId: Map<string, number>
): void {
  // A nonpositive surplus cap zeroes every breeding cost, which would make
  // the funding gate vacuous — a zero-bank pair would spawn a full brood
  // every tick. With no bank to spend, the surplus economy is off, so
  // spawning is disabled entirely. (Fry still grow and clutches still hatch.)
  if (config.surplusCap <= 0) return;

  for (const species of SPECIES_IDS) {
    const breeding = FISH_SPECIES_DATA[species].breeding;
    const cost = breeding.costFraction * config.surplusCap;
    const maleShare = breeding.maleShareFraction * cost;

    const males = draft.fish.filter(
      (f) => f.species === species && isBreedingAdult(f) && f.sex === 'male'
    );
    if (males.length === 0) continue;

    const readyFemales = draft.fish.filter(
      (f) =>
        f.species === species &&
        isBreedingAdult(f) &&
        f.sex === 'female' &&
        f.surplus >= cost &&
        (netByFishId.get(f.id) ?? 0) >= 0
    );
    if (readyFemales.length === 0) continue;

    let mi = 0;
    for (const female of readyFemales) {
      // Advance past males too drained to serve; a male below his share
      // stops serving, and the next one steps in.
      while (mi < males.length && males[mi].surplus < maleShare) mi++;
      if (mi >= males.length) break; // no male can cover the share

      const male = males[mi];
      female.surplus -= cost;
      male.surplus -= maleShare;

      if (breeding.mode === 'livebearer') {
        for (let i = 0; i < breeding.clutchSize; i++) {
          draft.fish.push(createFish({ species, age: 0, stage: 'fry', rng: draft.rng }));
        }
        draft.logs.push(
          createLog(
            draft.tick,
            'simulation',
            'info',
            `${FISH_SPECIES_DATA[species].name} gave birth to ${breeding.clutchSize} fry`,
            'fish-spawned',
            breeding.clutchSize
          )
        );
      } else {
        draft.clutches.push({
          id: drawId(draft.rng, 'clutch'),
          species,
          eggCount: breeding.clutchSize,
          laidTick: draft.tick,
        });
        draft.logs.push(
          createLog(
            draft.tick,
            'simulation',
            'info',
            `${FISH_SPECIES_DATA[species].name} laid a clutch of ${breeding.clutchSize} eggs`,
            'eggs-laid'
          )
        );
      }
    }
  }
}

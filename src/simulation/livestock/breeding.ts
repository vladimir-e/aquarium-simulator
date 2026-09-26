/**
 * Reproduction orchestrator — the ACTIVE-tier step that turns banked
 * vitality surplus into offspring. Runs right after `processLivestock`
 * (see `tick.ts`); it mutates `state.fish` and `state.clutches` directly
 * because it *adds* organisms, which the effect system can't express.
 *
 * A mature female spawns when her bank is full and a mature male of her
 * species is in the tank; the spawn empties her bank and costs him nothing.
 * The bank only fills at full health and any damage it heals draws it down,
 * so a full bank is the proof her water is good. Refilling it is the
 * cooldown — there are no timers.
 *
 * See the docs portal, Livestock § Breeding for the full pipeline (grow /
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
 */
export function processBreeding(
  state: SimulationState,
  config: TunableConfig
): BreedingProcessingResult {
  const livestockConfig = config.livestock ?? livestockDefaults;

  // Nothing to do in an empty tank with no clutches in the water.
  if (state.fish.length === 0 && state.clutches.length === 0) {
    return { state };
  }

  const newState = produce(state, (draft) => {
    growAndMatureFry(draft.fish);
    hatchClutches(draft);
    spawn(draft, livestockConfig);
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
      draft.fish.push(createFish({ species: clutch.species, stage: 'fry', rng: draft.rng }));
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

/** Every mature female on a full bank spawns, if her species has a mature male. */
function spawn(draft: SimulationState, config: LivestockConfig): void {
  // At a cap of 0 every bank is full, so the gate would spawn every tick.
  if (config.surplusCap <= 0) return;

  for (const species of SPECIES_IDS) {
    const breeding = FISH_SPECIES_DATA[species].breeding;
    const adults = draft.fish.filter((f) => f.species === species && isBreedingAdult(f));
    if (!adults.some((f) => f.sex === 'male')) continue;

    const ready = adults.filter((f) => f.sex === 'female' && f.surplus >= config.surplusCap);
    for (const female of ready) {
      female.surplus = 0;

      if (breeding.mode === 'livebearer') {
        for (let i = 0; i < breeding.clutchSize; i++) {
          draft.fish.push(createFish({ species, stage: 'fry', rng: draft.rng }));
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

/**
 * What the fish's banks buy — the ACTIVE-tier step after `processLivestock`
 * (see `tick.ts`). It mutates `state.fish` and `state.clutches` directly
 * because it *adds* organisms, which the effect system can't express.
 *
 * A female on a full bank broods first, then every fish's bank draws toward
 * growth, then clutches due hatch. The brood runs before growth for the reason
 * a plant's offshoot does: drawn first, a bank sits a hair under full and a
 * grown female never broods.
 */

import { produce } from 'immer';
import type { SimulationState, Clutch } from '../state.js';
import type { FishSpecies } from '../livestock/species.js';
import { FISH_SPECIES_DATA } from '../livestock/species.js';
import type { LivestockConfig } from '../config/livestock.js';
import { livestockDefaults } from '../config/livestock.js';
import type { TunableConfig } from '../config/index.js';
import { createLog } from '../core/logging.js';
import { drawId } from '../core/rng.js';
import { bankFull, brood, frySize, growFish } from '../systems/fish-growth.js';
import { createFish } from './create-fish.js';

export interface BreedingProcessingResult {
  state: SimulationState;
}

export function processBreeding(
  state: SimulationState,
  config: TunableConfig
): BreedingProcessingResult {
  const livestockConfig = config.livestock ?? livestockDefaults;

  if (state.fish.length === 0 && state.clutches.length === 0) {
    return { state };
  }

  const newState = produce(state, (draft) => {
    spawn(draft, livestockConfig);
    draft.fish = draft.fish.map((fish) => growFish(fish, livestockConfig));
    hatchClutches(draft, livestockConfig);
  });

  return { state: newState };
}

function addFry(draft: SimulationState, species: FishSpecies, count: number, config: LivestockConfig): void {
  for (let i = 0; i < count; i++) {
    draft.fish.push(createFish({ species, size: frySize(species), rng: draft.rng, config }));
  }
}

function hatchClutches(draft: SimulationState, config: LivestockConfig): void {
  if (draft.clutches.length === 0) return;

  const remaining: Clutch[] = [];
  for (const clutch of draft.clutches) {
    const { hatchTime } = FISH_SPECIES_DATA[clutch.species].breeding;
    if (draft.tick < clutch.laidTick + hatchTime) {
      remaining.push(clutch);
      continue;
    }
    addFry(draft, clutch.species, clutch.eggCount, config);
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

/** Every female on a full bank broods, fathered by the males of her species. */
function spawn(draft: SimulationState, config: LivestockConfig): void {
  const ready = draft.fish.filter((f) => f.sex === 'female' && bankFull(f, config));

  for (const female of ready) {
    const { species } = female;
    const males = draft.fish.filter((f) => f.species === species && f.sex === 'male');
    const result = brood(female, males, config);

    female.surplus = result.female.surplus;
    males.forEach((male, i) => {
      male.surplus = result.males[i].surplus;
    });

    if (result.offspring > 0) layBrood(draft, species, result.offspring, config);
  }
}

function layBrood(draft: SimulationState, species: FishSpecies, count: number, config: LivestockConfig): void {
  const { name, breeding } = FISH_SPECIES_DATA[species];

  if (breeding.mode === 'livebearer') {
    addFry(draft, species, count, config);
    draft.logs.push(
      createLog(draft.tick, 'simulation', 'info', `${name} gave birth to ${count} fry`, 'fish-spawned', count)
    );
    return;
  }

  draft.clutches.push({ id: drawId(draft.rng, 'clutch'), species, eggCount: count, laidTick: draft.tick });
  draft.logs.push(
    createLog(draft.tick, 'simulation', 'info', `${name} laid a clutch of ${count} eggs`, 'eggs-laid')
  );
}

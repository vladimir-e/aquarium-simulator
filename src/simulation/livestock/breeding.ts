/**
 * What the fish's banks buy, and the clutches they bought — the ACTIVE-tier
 * step after `processLivestock` (see `tick.ts`). It mutates `state.fish` and
 * `state.clutches` directly because it *adds* organisms, which the effect
 * system can't express; the waste dead eggs leave goes out as an effect.
 *
 * The clutches standing live their hour first, then a female on a full bank
 * broods, then every fish's bank draws toward growth. The brood runs before
 * growth for the reason a plant's offshoot does: drawn first, a bank sits a
 * hair under full and a grown female never broods.
 */

import { produce } from 'immer';
import type { SimulationState, Clutch, Fish } from '../state.js';
import type { Effect } from '../core/effects.js';
import type { FishSpecies } from '../livestock/species.js';
import { FISH_SPECIES_DATA } from '../livestock/species.js';
import type { LivestockConfig } from '../config/livestock.js';
import { livestockDefaults } from '../config/livestock.js';
import type { TunableConfig } from '../config/index.js';
import { createLog } from '../core/logging.js';
import { drawId } from '../core/rng.js';
import { brood, frySize, growFish, readyToBrood } from '../systems/fish-growth.js';
import { metabolicFactor, oxygenFactor } from '../systems/metabolism.js';
import { swallow } from '../systems/digestion.js';
import { developmentRate, eggHarmRate, eggPredationRate, settleClutch } from '../systems/clutch.js';
import { createFish } from './create-fish.js';

export interface BreedingProcessingResult {
  state: SimulationState;
  effects: Effect[];
}

export function processBreeding(
  state: SimulationState,
  config: TunableConfig
): BreedingProcessingResult {
  const livestockConfig = config.livestock ?? livestockDefaults;

  if (state.fish.length === 0 && state.clutches.length === 0) {
    return { state, effects: [] };
  }

  let deadEggs = 0;
  const newState = produce(state, (draft) => {
    deadEggs = tendClutches(draft, livestockConfig);
    spawn(draft, livestockConfig);
    draft.fish = draft.fish.map((fish) => growFish(fish, livestockConfig));
  });

  const effects: Effect[] =
    deadEggs > 0 ? [{ tier: 'active', resource: 'waste', delta: deadEggs, source: 'dead-eggs' }] : [];
  return { state: newState, effects };
}

function addFry(draft: SimulationState, species: FishSpecies, count: number, config: LivestockConfig): void {
  for (let i = 0; i < count; i++) {
    draft.fish.push(createFish({ species, size: frySize(species), rng: draft.rng, config }));
  }
}

/** One hour of every clutch, hatching those developed; returns the grams of egg left as waste. */
function tendClutches(draft: SimulationState, config: LivestockConfig): number {
  if (draft.clutches.length === 0) return 0;

  const { resources } = draft;
  const factor = metabolicFactor(resources.temperature, oxygenFactor(resources.oxygen, config), config);
  const predatorMass = draft.fish.reduce((sum, fish) => sum + fish.mass, 0);
  let eaten = 0;
  let waste = 0;

  const developing: Clutch[] = [];
  const developed: Clutch[] = [];
  for (const clutch of draft.clutches) {
    const { species } = clutch;
    const mass = FISH_SPECIES_DATA[species].breeding.eggMass;
    const hour = settleClutch(
      clutch,
      eggHarmRate(clutch, resources, resources.water, config),
      eggPredationRate(species, predatorMass, resources.water, config),
      developmentRate(species, factor)
    );
    eaten += hour.eaten * mass;
    waste += hour.spoiled * mass;

    if (hour.clutch.development < 1) {
      developing.push(hour.clutch);
    } else {
      waste += (hour.clutch.eggs - Math.floor(hour.clutch.eggs)) * mass;
      developed.push(hour.clutch);
    }
  }

  waste += swallow(draft.fish, draft.fish.map((fish) => fish.mass), eaten, config);
  draft.clutches = developing;
  for (const clutch of developed) hatch(draft, clutch, config);
  return waste;
}

function hatch(draft: SimulationState, clutch: Clutch, config: LivestockConfig): void {
  const count = Math.floor(clutch.eggs);
  if (count === 0) return;
  const { name } = FISH_SPECIES_DATA[clutch.species];
  addFry(draft, clutch.species, count, config);
  draft.logs.push(
    clutch.motherId === undefined
      ? createLog(draft.tick, 'simulation', 'info', `${count} ${name} eggs hatched`, 'eggs-hatched', count)
      : createLog(draft.tick, 'simulation', 'info', `${name} gave birth to ${count} fry`, 'fry-born', count)
  );
}

/** The ready females of each species brood together, fathered by the males of their species. */
function spawn(draft: SimulationState, config: LivestockConfig): void {
  const ready = draft.fish.filter((f) => readyToBrood(f, draft.clutches, config));

  for (const species of new Set(ready.map((f) => f.species))) {
    const females = ready.filter((f) => f.species === species);
    const males = draft.fish.filter((f) => f.species === species && f.sex === 'male');
    const result = brood(females, males, config);

    females.forEach((female, i) => {
      female.surplus = result.females[i].surplus;
    });
    males.forEach((male, i) => {
      male.surplus = result.males[i].surplus;
    });

    result.offspring.forEach((count, i) => {
      if (count > 0) layClutch(draft, females[i], count);
    });
  }
}

function layClutch(draft: SimulationState, mother: Fish, eggs: number): void {
  const { species } = mother;
  const { name, breeding } = FISH_SPECIES_DATA[species];
  const clutch: Clutch = { id: drawId(draft.rng, 'clutch'), species, eggs, development: 0 };
  draft.clutches.push(breeding.mode === 'livebearer' ? { ...clutch, motherId: mother.id } : clutch);
  draft.logs.push(
    createLog(
      draft.tick,
      'simulation',
      'info',
      breeding.mode === 'livebearer' ? `${name} is carrying ${eggs} fry` : `${name} laid a clutch of ${eggs} eggs`,
      'eggs-laid',
      eggs
    )
  );
}

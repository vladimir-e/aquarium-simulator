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
import { FISH_SPECIES_DATA } from '../livestock/species.js';
import type { LivestockConfig } from '../config/livestock.js';
import { livestockDefaults } from '../config/livestock.js';
import type { TunableConfig } from '../config/index.js';
import { createLog } from '../core/logging.js';
import { drawId } from '../core/rng.js';
import { sum } from '../core/sum.js';
import { brood, frySize, growFish, massAtSize, readyToBrood } from '../systems/fish-growth.js';
import { swallow } from '../systems/digestion.js';
import { fishHardiness, predatorWeight, speciesHardiness } from '../systems/fish-health.js';
import { developmentRate, eggHarmRate, eggPredationRate, settleClutch } from '../systems/clutch.js';
import { arrivalGut, createFish } from './create-fish.js';

export interface BreedingProcessingResult {
  state: SimulationState;
  effects: Effect[];
}

/** One hour of breeding, clutches developing at `metabolicFactor` — the pace the hour's digestion ran at. */
export function processBreeding(
  state: SimulationState,
  config: TunableConfig,
  metabolicFactor: number
): BreedingProcessingResult {
  const livestockConfig = config.livestock ?? livestockDefaults;

  if (state.fish.length === 0 && state.clutches.length === 0) {
    return { state, effects: [] };
  }

  let deadEggs = 0;
  const newState = produce(state, (draft) => {
    deadEggs = tendClutches(draft, livestockConfig, metabolicFactor);
    layBroods(draft, livestockConfig);
    draft.fish = draft.fish.map((fish) => growFish(fish, livestockConfig));
  });

  const effects: Effect[] =
    deadEggs > 0 ? [{ tier: 'active', resource: 'waste', delta: deadEggs, source: 'dead-eggs' }] : [];
  return { state: newState, effects };
}

/** One hour of every clutch, hatching those developed; returns the grams of egg left as waste. */
function tendClutches(draft: SimulationState, config: LivestockConfig, metabolicFactor: number): number {
  if (draft.clutches.length === 0) return 0;

  const { resources } = draft;
  const mothers = new Map(draft.fish.map((fish) => [fish.id, fish]));
  let waste = 0;

  const developing: Clutch[] = [];
  const developed: Clutch[] = [];
  for (const clutch of draft.clutches) {
    const { eggMass } = FISH_SPECIES_DATA[clutch.species].breeding;
    const weights = draft.fish.map((fish) => predatorWeight(fish, { mass: eggMass }));
    const mother = clutch.motherId === undefined ? undefined : mothers.get(clutch.motherId);
    const hardiness = mother ? fishHardiness(mother) : speciesHardiness(clutch.species);
    const hour = settleClutch(
      clutch,
      eggHarmRate(clutch, hardiness, resources, resources.water, config),
      eggPredationRate(clutch, sum(weights), resources.water, config),
      developmentRate(clutch.species, metabolicFactor)
    );

    const eaten = swallow(draft.fish, weights, hour.eaten * eggMass, config);
    eaten.taken.forEach((grams, i) => {
      draft.fish[i].gut += grams;
    });
    waste += hour.spoiled * eggMass + eaten.overflow;
    (hour.clutch.development < 1 ? developing : developed).push(hour.clutch);
  }

  draft.clutches = developing;
  for (const clutch of developed) waste += hatch(draft, clutch, config);
  return waste;
}

/** Each whole egg becomes a fry, its yolk out of the egg's mass; returns the grams of egg left over. */
function hatch(draft: SimulationState, clutch: Clutch, config: LivestockConfig): number {
  const { species } = clutch;
  const { name, breeding } = FISH_SPECIES_DATA[species];
  const count = Math.floor(clutch.eggs);
  const size = frySize(species);
  const yolk = Math.min(breeding.eggMass, arrivalGut(massAtSize(species, size), config));
  for (let i = 0; i < count; i++) {
    draft.fish.push(createFish({ species, size, gut: yolk, rng: draft.rng, config }));
  }
  if (count > 0) {
    draft.logs.push(
      clutch.motherId === undefined
        ? createLog(draft.tick, 'simulation', 'info', `${count} ${name} eggs hatched`, 'eggs-hatched', count)
        : createLog(draft.tick, 'simulation', 'info', `${name} gave birth to ${count} fry`, 'fry-born', count)
    );
  }
  return clutch.eggs * breeding.eggMass - count * yolk;
}

/** The ready females of each species brood together, fathered by the males of their species. */
function layBroods(draft: SimulationState, config: LivestockConfig): void {
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
  const laid: Clutch = { id: drawId(draft.rng, 'clutch'), species, eggs, development: 0 };
  const clutch: Clutch = breeding.mode === 'livebearer' ? { ...laid, motherId: mother.id } : laid;
  draft.clutches.push(clutch);
  draft.logs.push(
    createLog(
      draft.tick,
      'simulation',
      'info',
      clutch.motherId === undefined ? `${name} laid a clutch of ${eggs} eggs` : `${name} is carrying ${eggs} fry`,
      'eggs-laid',
      eggs
    )
  );
}

/**
 * The fish's clutches and broods — the ACTIVE-tier step after
 * `processLivestock` (see `tick.ts`): the clutches standing live their hour
 * and hatch, the females whose buffers ready a bout spawn, and every male
 * turns over a share of the buffer he has not spent fathering. It mutates
 * `state.fish` and `state.clutches` directly because it *adds* organisms,
 * which the effect system can't express; what eggs and broods burn and leave
 * goes out as effects.
 */

import { produce } from 'immer';
import type { SimulationState, Clutch, Fish } from '../state.js';
import type { Effect } from '../core/effects.js';
import { debParams, FISH_SPECIES_DATA } from '../livestock/species.js';
import type { LivestockConfig } from '../config/livestock.js';
import type { TunableConfig } from '../config/index.js';
import { createLog } from '../core/logging.js';
import { atRecipe, NO_ORGANICS, type Organics } from '../core/organics.js';
import { hourlyDraw } from '../core/kinetics.js';
import { drawId } from '../core/rng.js';
import { sum } from '../core/sum.js';
import { hatchling, organics } from '../systems/deb.js';
import { brood, readyToBrood } from '../systems/brood.js';
import { shareOut, swallow, type Pace } from '../systems/digestion.js';
import { eggMass, eggOrganics, fishMass } from '../systems/fish-body.js';
import { predatorWeight } from '../systems/fish-health.js';
import { fishHardiness, speciesHardiness } from './tolerance.js';
import { developmentRate, eggHarmRate, eggPredationRate, settleClutch } from '../systems/clutch.js';
import { waterToxins } from '../systems/toxicokinetics.js';
import { hatchFish } from './create-fish.js';
import { burnEffects, tankPaces } from './index.js';

export interface BodiesProcessingResult {
  state: SimulationState;
  effects: Effect[];
  /** Grams of organics the hour's eggs and broods burned. */
  burned: number;
  /** The egg the hour left as waste. */
  waste: Organics;
}

/** One hour of clutches, broods and the males' buffers. */
export function processBodies(state: SimulationState, config: TunableConfig): BodiesProcessingResult {
  if (state.fish.length === 0 && state.clutches.length === 0) return { state, effects: [], burned: 0, waste: NO_ORGANICS };

  const livestock = config.livestock;
  let waste = 0;
  let burned = 0;
  const newState = produce(state, (draft) => {
    const paces = tankPaces(draft, config);
    const clutches = tendClutches(draft, livestock, paces);
    waste = clutches.waste;
    burned = clutches.burned + layBroods(draft) + turnOverMaleBuffers(draft.fish, paces, livestock);
  });

  const effects: Effect[] = burnEffects(
    burned,
    newState.resources.water,
    livestock,
    config.nutrients.foodMineralContent,
    'fish-broods'
  );
  const eggs = atRecipe(waste, config);
  if (waste > 0) effects.push({ tier: 'active', resource: 'waste', delta: eggs, source: 'dead-eggs' });
  return { state: newState, effects, burned, waste: eggs };
}

/** One hour of every clutch, hatching those developed: the grams of egg left as waste, and burned hatching. */
function tendClutches(
  draft: SimulationState,
  config: LivestockConfig,
  paces: readonly Pace[]
): { waste: number; burned: number } {
  if (draft.clutches.length === 0) return { waste: 0, burned: 0 };

  const { resources } = draft;
  const mothers = new Map(draft.fish.map((fish) => [fish.id, fish]));
  const masses = draft.fish.map(fishMass);
  const shares = draft.fish.map(() => 0);
  const levels = waterToxins(resources);
  let waste = 0;
  let burned = 0;

  const developing: Clutch[] = [];
  const developed: Clutch[] = [];
  for (const clutch of draft.clutches) {
    const egg = eggMass(clutch.species);
    const weights = clutch.motherId === undefined ? masses.map((mass) => predatorWeight(mass, egg)) : [];
    const mother = clutch.motherId === undefined ? undefined : mothers.get(clutch.motherId);
    const hardiness = mother ? fishHardiness(mother) : speciesHardiness(clutch.species);
    // A laid clutch loads in the fast limit of the same law, a carried brood with its mother.
    const toxins = mother ? mother.load : levels;
    const hour = settleClutch(
      clutch,
      eggHarmRate(clutch, hardiness, toxins, resources, resources.water, config),
      eggPredationRate(clutch, sum(weights), resources.water, config),
      developmentRate(clutch.species, resources.temperature)
    );

    const grams = eggOrganics(clutch.species);
    const eaten = shareOut(weights, hour.eaten * grams);
    eaten.taken.forEach((taken, i) => {
      shares[i] += taken;
    });
    waste += hour.spoiled * grams + eaten.overflow;
    (hour.clutch.development < 1 ? developing : developed).push(hour.clutch);
  }
  const swallowed = swallow(draft.fish, paces, shares);
  draft.fish.forEach((fish, i) => {
    fish.gut += swallowed.taken[i];
  });
  waste += swallowed.overflow;

  draft.clutches = developing;
  for (const clutch of developed) {
    const hatched = hatch(draft, clutch);
    waste += hatched.waste;
    burned += hatched.burned;
  }
  return { waste, burned };
}

/**
 * Each whole egg becomes a hatchling, the reserve its embryo spent getting
 * there burned; the part-egg left over is waste.
 */
function hatch(draft: SimulationState, clutch: Clutch): { waste: number; burned: number } {
  const { species } = clutch;
  const { name } = FISH_SPECIES_DATA[species];
  const p = debParams(species);
  const count = Math.floor(clutch.eggs);
  for (let i = 0; i < count; i++) draft.fish.push(hatchFish({ species, rng: draft.rng }));
  if (count > 0) {
    draft.logs.push(
      clutch.motherId === undefined
        ? createLog(draft.tick, 'simulation', 'info', `${count} ${name} eggs hatched`, 'eggs-hatched', count)
        : createLog(draft.tick, 'simulation', 'info', `${name} gave birth to ${count} fry`, 'fry-born', count)
    );
  }
  return {
    waste: (clutch.eggs - count) * p.E0,
    burned: count * (p.E0 - organics(hatchling(p), p)),
  };
}

/** The ready females of each species spawn together, fathered by the males of their species; the grams burned. */
function layBroods(draft: SimulationState): number {
  const ready = draft.fish.filter((f) => readyToBrood(f, draft.clutches));
  let burned = 0;

  for (const species of new Set(ready.map((f) => f.species))) {
    const females = ready.filter((f) => f.species === species);
    const males = draft.fish.filter((f) => f.species === species && f.sex === 'male');
    const result = brood(females, males);

    females.forEach((female, i) => {
      female.budget = result.females[i];
    });
    males.forEach((male, i) => {
      male.budget = result.males[i];
    });
    burned += result.burned;

    result.offspring.forEach((count, i) => {
      if (count > 0) layClutch(draft, females[i], count);
    });
  }
  return burned;
}

/**
 * Every male the hour's paces were read for burns a share of his buffer at
 * `maleBufferTurnover` × τ; a male hatched this hour has neither pace nor
 * buffer. The grams burned.
 */
function turnOverMaleBuffers(fish: Fish[], paces: readonly Pace[], config: LivestockConfig): number {
  let burned = 0;
  paces.forEach((pace, i) => {
    const male = fish[i];
    if (male.sex !== 'male') return;
    const turned = male.budget.broodBuffer * hourlyDraw(config.maleBufferTurnover * pace.tau);
    male.budget.broodBuffer -= turned;
    burned += turned;
  });
  return burned;
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

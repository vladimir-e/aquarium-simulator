/**
 * What the fish's bodies make of the hour's digestion — the ACTIVE-tier step
 * after `processLivestock` (see `tick.ts`): the clutches standing, the broods
 * full banks buy, the growth every bank draws toward, and what the digestion
 * leaves once growth has built its share. It mutates `state.fish` and
 * `state.clutches` directly because it *adds* organisms, which the effect
 * system can't express; the excretion and the waste dead eggs leave go out
 * as effects.
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
import { brood, eggOrganics, growFish, readyToBrood } from '../systems/fish-growth.js';
import { shareOut, swallow } from '../systems/digestion.js';
import { assimilated, excretion, type Excretion, type MetabolismResult } from '../systems/metabolism.js';
import { mintAmmonia } from '../systems/nitrogen-cycle.js';
import { WASTE_NUTRIENTS } from '../config/nutrients.js';
import { fishHardiness, predatorWeight, speciesHardiness } from '../systems/fish-health.js';
import { developmentRate, eggHarmRate, eggPredationRate, settleClutch } from '../systems/clutch.js';
import { createFish } from './create-fish.js';

export interface BodiesProcessingResult {
  state: SimulationState;
  effects: Effect[];
  /** What the hour's digestion left in the water. */
  excreted: Excretion;
}

/**
 * The hour's digestion — every fish `processLivestock` fed, the dead
 * included — and the pace it ran at, which the clutches develop at.
 */
export type Digestion = Pick<MetabolismResult, 'updatedFish' | 'digested' | 'metabolicFactor'>;

/** One hour of clutches, broods and growth, and what the hour's digestion leaves once growth has built from it. */
export function processBodies(
  state: SimulationState,
  config: TunableConfig,
  digestion: Digestion
): BodiesProcessingResult {
  const livestockConfig = config.livestock ?? livestockDefaults;
  const intake = new Map(digestion.updatedFish.map((fish, i) => [fish.id, digestion.digested[i]]));

  let deadEggs = 0;
  let retained = 0;
  const newState =
    state.fish.length === 0 && state.clutches.length === 0
      ? state
      : produce(state, (draft) => {
          deadEggs = tendClutches(draft, livestockConfig, digestion.metabolicFactor);
          layBroods(draft, livestockConfig);
          draft.fish = draft.fish.map((fish) => {
            const growth = growFish(fish, assimilated(intake.get(fish.id) ?? 0, livestockConfig), livestockConfig);
            retained += growth.retained;
            return growth.fish;
          });
        });

  const excreted = excretion(sum(digestion.digested), retained, livestockConfig, config.nutrients.foodMineralContent);
  return { state: newState, effects: excretionEffects(excreted, deadEggs), excreted };
}

function excretionEffects(excreted: Excretion, deadEggs: number): Effect[] {
  const effects: Effect[] = [];
  if (excreted.waste > 0) {
    effects.push({ tier: 'active', resource: 'waste', delta: excreted.waste, source: 'fish-metabolism' });
  }
  if (excreted.ammonia > 0) {
    effects.push(...mintAmmonia(excreted.ammonia, 'active', 'fish-gill-excretion'));
  }
  for (const nutrient of WASTE_NUTRIENTS) {
    const delta = excreted.minerals[nutrient];
    if (delta > 0) effects.push({ tier: 'active', resource: nutrient, delta, source: 'fish-gill-excretion' });
  }
  if (deadEggs > 0) {
    effects.push({ tier: 'active', resource: 'waste', delta: deadEggs, source: 'dead-eggs' });
  }
  return effects;
}

/** One hour of every clutch, hatching those developed; returns the grams of egg left as waste. */
function tendClutches(draft: SimulationState, config: LivestockConfig, metabolicFactor: number): number {
  if (draft.clutches.length === 0) return 0;

  const { resources } = draft;
  const mothers = new Map(draft.fish.map((fish) => [fish.id, fish]));
  const shares = draft.fish.map(() => 0);
  let waste = 0;

  const developing: Clutch[] = [];
  const developed: Clutch[] = [];
  for (const clutch of draft.clutches) {
    const { eggMass } = FISH_SPECIES_DATA[clutch.species].breeding;
    const weights =
      clutch.motherId === undefined ? draft.fish.map((fish) => predatorWeight(fish, { mass: eggMass })) : [];
    const mother = clutch.motherId === undefined ? undefined : mothers.get(clutch.motherId);
    const hardiness = mother ? fishHardiness(mother) : speciesHardiness(clutch.species);
    const hour = settleClutch(
      clutch,
      eggHarmRate(clutch, hardiness, resources, resources.water, config),
      eggPredationRate(clutch, sum(weights), resources.water, config),
      developmentRate(clutch.species, metabolicFactor)
    );

    const organics = eggOrganics(clutch.species, config);
    const eaten = shareOut(weights, hour.eaten * organics);
    eaten.taken.forEach((grams, i) => {
      shares[i] += grams;
    });
    waste += hour.spoiled * organics + eaten.overflow;
    (hour.clutch.development < 1 ? developing : developed).push(hour.clutch);
  }
  const swallowed = swallow(draft.fish, shares, config);
  draft.fish.forEach((fish, i) => {
    fish.gut += swallowed.taken[i];
  });
  waste += swallowed.overflow;

  draft.clutches = developing;
  for (const clutch of developed) waste += hatch(draft, clutch, config);
  return waste;
}

/** Each whole egg becomes a fry of its body and yolk; returns the grams of the part-egg left over. */
function hatch(draft: SimulationState, clutch: Clutch, config: LivestockConfig): number {
  const { species } = clutch;
  const { name, breeding } = FISH_SPECIES_DATA[species];
  const count = Math.floor(clutch.eggs);
  for (let i = 0; i < count; i++) {
    draft.fish.push(createFish({ species, mass: breeding.eggMass, rng: draft.rng, config }));
  }
  if (count > 0) {
    draft.logs.push(
      clutch.motherId === undefined
        ? createLog(draft.tick, 'simulation', 'info', `${count} ${name} eggs hatched`, 'eggs-hatched', count)
        : createLog(draft.tick, 'simulation', 'info', `${name} gave birth to ${count} fry`, 'fry-born', count)
    );
  }
  return (clutch.eggs - count) * eggOrganics(species, config);
}

/** The ready females of each species brood together, fathered by the males of their species. */
function layBroods(draft: SimulationState, config: LivestockConfig): void {
  const ready = draft.fish.filter((f) => readyToBrood(f, draft.clutches, config));

  for (const species of new Set(ready.map((f) => f.species))) {
    const females = ready.filter((f) => f.species === species);
    const males = draft.fish.filter((f) => f.species === species && f.sex === 'male');
    const result = brood(females, males, config);

    females.forEach((female, i) => {
      female.ovary = result.females[i].ovary;
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

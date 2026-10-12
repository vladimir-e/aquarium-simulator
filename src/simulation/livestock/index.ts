/**
 * Livestock processing — every fish's hour: its loads follow the water, its
 * budget runs on what its gut digests, it eats, and its health moves; the
 * dead leave the tank.
 *
 * Called during ACTIVE tier processing in tick.ts (after plants). Returns the
 * updated state, the effects of what the fish ate, passed, burned and left,
 * and each fish's hour for readouts.
 */

import { produce } from 'immer';
import type { SimulationState } from '../state.js';
import type { Effect } from '../core/effects.js';
import type { TunableConfig } from '../config/index.js';
import { WASTE_NUTRIENTS } from '../config/nutrients.js';
import { burn, excrete, fishPace, processMetabolism, type Burn, type FishHour } from '../systems/metabolism.js';
import { processHealth } from '../systems/fish-health.js';
import { repairAsked } from '../systems/reserve.js';
import { fishComposition, fishParams } from '../systems/fish-body.js';
import type { VitalityResult } from '../systems/vitality.js';
import type { Pace } from '../systems/digestion.js';
import { calculateO2Saturation } from '../systems/gas-exchange.js';
import { mintAmmonia } from '../systems/nitrogen-cycle.js';
import { createLog } from '../core/logging.js';
import { NO_ORGANICS, scaleOrganics, type Organics } from '../core/organics.js';
import { clutchOrganics, clutchesWithMothers } from '../systems/clutch.js';
import { loadFish, waterToxins } from '../systems/toxicokinetics.js';
import { getPpm } from '../resources/index.js';
import { speciesTau } from './species.js';

export interface LivestockProcessingResult {
  state: SimulationState;
  /** Effects for resource changes (food, waste, O2, CO2, ammonia, minerals) */
  effects: Effect[];
  /** Each fish's budget hour, in `state.fish` order, the dead included */
  hours: FishHour[];
  /** Each fish's vitality this tick, in `state.fish` order, the dead included */
  vitalities: VitalityResult[];
  feces: Organics;
  excreted: Organics;
  /** Grams of organics their budgets burned. */
  burned: number;
}

/** The pace every fish in the tank runs at this hour, in `fish` order. */
export function tankPaces(state: Pick<SimulationState, 'fish' | 'resources'>, config: TunableConfig): Pace[] {
  const saturation = calculateO2Saturation(state.resources.temperature, config.gasExchange);
  return state.fish.map((fish) => fishPace(fish, state.resources, saturation, config.livestock));
}

/** What a fish's burn or excretion does to the water: gill NH3 and minerals in, O2 out, CO2 in. */
function releaseEffects(released: Burn, water: number, source: string): Effect[] {
  return [
    ...mintAmmonia(released.ammonia, 'active', 'fish-gill-excretion'),
    ...WASTE_NUTRIENTS.map(
      (nutrient): Effect => ({ tier: 'active', resource: nutrient, delta: released.minerals[nutrient], source: 'fish-gill-excretion' })
    ),
    { tier: 'active', resource: 'oxygen', delta: -getPpm(released.oxygen, water), source },
    { tier: 'active', resource: 'co2', delta: getPpm(released.co2, water), source },
  ];
}

/** What burning `grams` of fish organics does to the water. */
export function burnEffects(grams: number, water: number, body: Organics, source: string): Effect[] {
  return grams > 0 ? releaseEffects(burn(grams, body), water, source) : [];
}

/** What a meal's excess does to the water as it is assimilated. */
export function excretionEffects(excess: Organics, water: number, source: string): Effect[] {
  return excess.grams > 0 ? releaseEffects(excrete(excess), water, source) : [];
}

export function processLivestock(state: SimulationState, config: TunableConfig): LivestockProcessingResult {
  if (state.fish.length === 0) {
    return { state, effects: [], hours: [], vitalities: [], feces: NO_ORGANICS, excreted: NO_ORGANICS, burned: 0 };
  }

  const livestock = config.livestock;
  const water = state.resources.water;
  const levels = waterToxins(state.resources);
  const fish = state.fish.map((f) =>
    loadFish(f, levels, speciesTau(f.species, state.resources.temperature), livestock.loadRate)
  );
  const paces = tankPaces({ ...state, fish }, config);
  const healing = fish.map((f, i) => repairAsked(f.budget, fishParams(f), f.health, paces[i].tau, livestock));
  const body = fishComposition(config);
  const metabolism = processMetabolism(fish, paces, healing, state.resources, livestock, body);

  const carried = new Map<string, number>();
  for (const clutch of state.clutches) {
    const mother = clutch.motherId;
    if (mother !== undefined) carried.set(mother, (carried.get(mother) ?? 0) + clutchOrganics(clutch));
  }
  const health = processHealth({
    fish: state.fish,
    hours: metabolism.hours,
    fed: metabolism.updatedFish,
    resources: state.resources,
    plants: state.plants,
    tankCapacity: state.tank.capacity,
    config: livestock,
    body,
    carried: state.fish.map((f) => carried.get(f.id) ?? 0),
  });

  const organic = (resource: 'food' | 'waste', organics: Organics, source: string): Effect[] =>
    organics.grams !== 0 ? [{ tier: 'active', resource, delta: organics, source }] : [];
  const effects: Effect[] = [
    ...organic('food', scaleOrganics(metabolism.foodConsumed, -1), 'fish-metabolism'),
    ...organic('waste', metabolism.feces, 'fish-metabolism'),
    ...excretionEffects(metabolism.excreted, water, 'fish-digestion'),
    ...burnEffects(metabolism.burned, water, body, 'fish-respiration'),
    ...organic('waste', health.deathWaste, 'fish-death'),
  ];

  const newState = produce(state, (draft) => {
    draft.fish = health.survivingFish;
    draft.clutches = clutchesWithMothers(draft.clutches, draft.fish);
    for (const fishName of health.deadFishNames) {
      draft.logs.push(createLog(draft.tick, 'simulation', 'warning', `${fishName} died`, 'fish-died'));
    }
  });

  return {
    state: newState,
    effects,
    hours: metabolism.hours,
    vitalities: health.vitalities,
    feces: metabolism.feces,
    excreted: metabolism.excreted,
    burned: metabolism.burned,
  };
}

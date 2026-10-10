/**
 * Livestock processing — every fish's hour: its budget runs on what its gut
 * digests, it eats, and its health moves; the dead leave the tank.
 *
 * Called during ACTIVE tier processing in tick.ts (after plants). Returns the
 * updated state, the effects of what the fish ate, passed, burned and left,
 * and each fish's hour for readouts.
 */

import { produce } from 'immer';
import type { SimulationState } from '../state.js';
import type { Effect } from '../core/effects.js';
import type { TunableConfig } from '../config/index.js';
import type { MineralVector } from '../config/nutrients.js';
import { WASTE_NUTRIENTS } from '../config/nutrients.js';
import { burn, fishPace, processMetabolism, type FishHour } from '../systems/metabolism.js';
import { healingAsked, processHealth, type FishVitality } from '../systems/fish-health.js';
import type { Pace } from '../systems/digestion.js';
import { calculateO2Saturation } from '../systems/gas-exchange.js';
import { mintAmmonia } from '../systems/nitrogen-cycle.js';
import { createLog } from '../core/logging.js';
import { clutchOrganics, clutchesWithMothers } from '../systems/clutch.js';
import { getPpm } from '../resources/index.js';
import type { LivestockConfig } from '../config/livestock.js';

export interface LivestockProcessingResult {
  state: SimulationState;
  /** Effects for resource changes (food, waste, O2, CO2, ammonia, minerals) */
  effects: Effect[];
  /** Each fish's budget hour, in `state.fish` order, the dead included */
  hours: FishHour[];
  /** Each fish's vitality this tick, in `state.fish` order, the dead included */
  vitalities: FishVitality[];
  /** Grams of feces the fish passed. */
  feces: number;
  /** Grams of organics their budgets burned. */
  burned: number;
}

/** The pace every fish in the tank runs at this hour, in `fish` order. */
export function tankPaces(state: Pick<SimulationState, 'fish' | 'resources'>, config: TunableConfig): Pace[] {
  const saturation = calculateO2Saturation(state.resources.temperature, config.gasExchange);
  return state.fish.map((fish) => fishPace(fish.species, state.resources, saturation, config.livestock));
}

/** What burning `grams` of fish organics does to the water: gill NH3 and minerals in, O2 out, CO2 in. */
export function burnEffects(
  grams: number,
  water: number,
  config: LivestockConfig,
  foodMineralContent: MineralVector,
  source: string
): Effect[] {
  if (grams <= 0) return [];
  const burnt = burn(grams, config, foodMineralContent);
  return [
    ...mintAmmonia(burnt.ammonia, 'active', 'fish-gill-excretion'),
    ...WASTE_NUTRIENTS.map(
      (nutrient): Effect => ({ tier: 'active', resource: nutrient, delta: burnt.minerals[nutrient], source: 'fish-gill-excretion' })
    ),
    { tier: 'active', resource: 'oxygen', delta: -getPpm(burnt.oxygen, water), source },
    { tier: 'active', resource: 'co2', delta: getPpm(burnt.co2, water), source },
  ];
}

export function processLivestock(state: SimulationState, config: TunableConfig): LivestockProcessingResult {
  if (state.fish.length === 0) return { state, effects: [], hours: [], vitalities: [], feces: 0, burned: 0 };

  const livestock = config.livestock;
  const water = state.resources.water;
  const paces = tankPaces(state, config);
  const healing = state.fish.map((fish, i) => healingAsked(fish, paces[i], livestock));
  const metabolism = processMetabolism(state.fish, paces, healing, state.resources, livestock);

  const carried = new Map<string, number>();
  for (const clutch of state.clutches) {
    const mother = clutch.motherId;
    if (mother !== undefined) carried.set(mother, (carried.get(mother) ?? 0) + clutchOrganics(clutch));
  }
  const health = processHealth(
    state.fish,
    metabolism.hours,
    metabolism.updatedFish,
    state.resources,
    state.plants,
    state.tank.capacity,
    livestock,
    state.fish.map((fish) => carried.get(fish.id) ?? 0)
  );

  const effects = (
    [
      { tier: 'active', resource: 'food', delta: -metabolism.foodConsumed, source: 'fish-metabolism' },
      { tier: 'active', resource: 'waste', delta: metabolism.feces, source: 'fish-metabolism' },
      ...burnEffects(metabolism.burned, water, livestock, config.nutrients.foodMineralContent, 'fish-respiration'),
      { tier: 'active', resource: 'waste', delta: health.deathWaste, source: 'fish-death' },
    ] satisfies Effect[]
  ).filter((effect) => effect.delta !== 0);

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
    burned: metabolism.burned,
  };
}

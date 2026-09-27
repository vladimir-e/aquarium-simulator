/**
 * Root tabs — fertilizer pushed into the bed, where a root feeder draws on it
 * and the rest leaks slowly into the water.
 */

import { produce } from 'immer';
import type { SimulationState } from '../state.js';
import { createLog } from '../core/logging.js';
import { NUTRIENTS, type NutrientVector } from '../config/nutrients.js';
import type { ActionResult, RootTabAction } from './types.js';

/** Most tabs one push takes — prevents accidents. */
export const MAX_ROOT_TABS = 10;

/** Whether the tank has a bed to push a tab into. */
export function canRootTab(state: SimulationState): boolean {
  return state.equipment.substrate.type !== 'none';
}

/** Push `count` tabs into the bed, each carrying `tab`'s mg of every nutrient. */
export function rootTab(state: SimulationState, action: RootTabAction, tab: NutrientVector): ActionResult {
  const { count } = action;

  if (!Number.isInteger(count) || count < 1) {
    return { state, message: 'Root tabs go in whole: push 1 or more' };
  }
  if (count > MAX_ROOT_TABS) {
    return { state, message: `Maximum is ${MAX_ROOT_TABS} tabs at once to prevent accidents` };
  }
  if (!canRootTab(state)) {
    return { state, message: 'No bed to push a root tab into' };
  }

  const tabs = `${count} root tab${count === 1 ? '' : 's'}`;
  const newState = produce(state, (draft) => {
    for (const n of NUTRIENTS) draft.equipment.substrate.nutrients[n] += count * tab[n];
    draft.logs.push(createLog(draft.tick, 'user', 'info', `Pushed ${tabs} into the bed`));
  });

  return { state: newState, message: `Pushed ${tabs}` };
}

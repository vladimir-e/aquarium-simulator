import type { SimulationState } from '../state.js';

export const HOURS_PER_DAY = 24;

export function getHourOfDay(state: SimulationState): number {
  return state.tick % HOURS_PER_DAY;
}

export function getDayNumber(state: SimulationState): number {
  return Math.floor(state.tick / HOURS_PER_DAY);
}

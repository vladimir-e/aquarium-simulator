import type { SimulationState } from '../state.js';

export function getHourOfDay(state: SimulationState): number {
  return state.tick % 24;
}

export function getDayNumber(state: SimulationState): number {
  return Math.floor(state.tick / 24);
}

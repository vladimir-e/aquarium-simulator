import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import {
  applyAction,
  createSimulation,
  tick,
  type SimulationState,
} from '../../simulation/index.js';
import { snapshotFromState, type RunSnapshot } from '../run/index.js';

export interface Run {
  state: SimulationState;
  history: RunSnapshot[];
}

export function bare(state: SimulationState = createSimulation({ tankCapacity: 200 })): Run {
  return { state, history: [snapshotFromState(state)] };
}

/** Ten days of a stocked, planted, fed tank — every surface has real figures. */
export function stocked(): Run {
  let state = createSimulation({ tankCapacity: 200 });
  for (let i = 0; i < 6; i++) {
    state = applyAction(state, { type: 'addFish', species: 'neon_tetra' }).state;
  }
  for (let i = 0; i < 2; i++) {
    state = applyAction(state, { type: 'addPlant', species: 'anubias' }).state;
  }

  const history = [snapshotFromState(state)];
  for (let hour = 0; hour < 24 * 10; hour++) {
    if (hour % 24 === 0) state = applyAction(state, { type: 'feed', amount: 0.5 }).state;
    state = tick(state, DEFAULT_CONFIG);
    history.push(snapshotFromState(state));
  }
  return { state, history };
}

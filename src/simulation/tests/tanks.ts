import { produce } from 'immer';
import { createSimulation, type SimulationState } from '../state.js';
import { tick } from '../tick.js';
import { applySeed } from '../seed.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../config/index.js';
import { getMassFromPpm } from '../resources/helpers.js';
import type { SubstrateType } from '../equipment/substrate.js';
import type { FilterType } from '../equipment/filter.js';
import type { FishSex, FishSpecies } from '../livestock/species.js';

const DAY = 24;
const RNG_SEED = 1234;

export function run(
  state: SimulationState,
  hours: number,
  config: TunableConfig = DEFAULT_CONFIG
): SimulationState {
  let running = state;
  for (let hour = 0; hour < hours; hour++) running = tick(running, config);
  return running;
}

export function fishlessTank(
  substrate: SubstrateType,
  { capacity = 20, ato = true }: { capacity?: number; ato?: boolean } = {}
): SimulationState {
  return createSimulation(
    {
      tankCapacity: capacity,
      substrate: { type: substrate },
      ato: { enabled: ato },
      initialTemperature: 25,
      heater: { targetTemperature: 25, wattage: Math.max(100, capacity) },
      filter: { enabled: true, type: 'sponge' },
    },
    undefined,
    RNG_SEED
  );
}

export function cycledTank(capacity: number): SimulationState {
  return run(fishlessTank('aqua_soil', { capacity }), 30 * DAY);
}

export function saturatedColony(
  capacity: number,
  days: number,
  { filter = 'sponge', airPump = false }: { filter?: FilterType; airPump?: boolean } = {}
): SimulationState {
  let state = produce(
    createSimulation({
      tankCapacity: capacity,
      filter: { enabled: true, type: filter },
      airPump: { enabled: airPump },
    }),
    (draft) => {
      draft.resources.aob = 1;
      draft.resources.nob = 1;
    }
  );
  for (let hour = 0; hour < days * DAY; hour++) {
    state = tick(
      produce(state, (draft) => {
        draft.resources.ammonia += getMassFromPpm(2, draft.resources.water);
      })
    );
  }
  return state;
}

export function stock(
  state: SimulationState,
  species: FishSpecies,
  count: number,
  { sex }: { sex?: FishSex } = {}
): SimulationState {
  return produce(state, (draft) => {
    applySeed(draft, { fish: [{ species, count, sex }] });
  });
}

/**
 * The hour the next tick runs, settled in the tick's own order: the
 * environment, the plant pass with its effects applied, the algae, then
 * metabolism. Every readout that says what the next tick will do reads it
 * here, so a plant, a fish and the bloom are read on the same hour.
 */

import {
  applyEffects,
  computeAlgaePopulation,
  computeFishVitality,
  processMetabolism,
  processPlants,
  type AlgaePopulationResult,
  type SimulationState,
  type VitalityResult,
} from '../../simulation/index.js';
import { readPlantVitality } from '../../simulation/plants/index.js';
import { settleEnvironment } from '../../simulation/tick.js';
import type { TunableConfig } from '../../simulation/config/index.js';

export interface HourAhead {
  /** In `state.plants` order. */
  plants: VitalityResult[];
  /** Grams of waste the plant pass sheds — its steady rate, apart from a death's one-off lump. */
  shedding: number;
  algae: AlgaePopulationResult;
  /** In `state.fish` order. */
  fish: VitalityResult[];
}

export function readHourAhead(state: SimulationState, config: TunableConfig): HourAhead {
  const settled = settleEnvironment(state, config);
  const pass = processPlants(settled, config);
  const { fish, plants, resources, tank } = applyEffects(pass.state, pass.effects, config);
  const fed = processMetabolism(
    fish,
    resources.food,
    resources.oxygen,
    config.livestock,
    config.nutrients.foodMineralContent
  ).updatedFish;

  return {
    plants: readPlantVitality(settled, config),
    shedding: pass.effects
      .filter((effect) => effect.source === 'plant-shedding')
      .reduce((sum, effect) => sum + effect.delta, 0),
    algae: computeAlgaePopulation({ plants, resources, algaeConfig: config.algae }),
    fish: fed.map((member) =>
      computeFishVitality(member, resources, plants, resources.water, tank.capacity, config.livestock)
    ),
  };
}

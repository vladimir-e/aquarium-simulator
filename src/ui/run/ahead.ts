/**
 * The hour the next tick runs, settled in the tick's own order: the
 * environment, the flora pass — plants and the blooms — with its effects
 * applied, the livestock, then their bodies. Every readout that says what the next
 * tick will do reads it here, so a plant, a fish and a bloom are read on the
 * same hour.
 */

import {
  addOrganics,
  applyEffects,
  bloomCoverage,
  dailyLightIntegral,
  fishComposition,
  gillAmmonia,
  mapKinds,
  organicPool,
  poolShares,
  processBodies,
  processFlora,
  paysTowardBrood,
  processLivestock,
  ration,
  readyToBrood,
  type AlgaeKind,
  type BloomHour,
  type FishHour,
  type FloraFluxes,
  type FloraState,
  type Organics,
  type PlantLight,
  type PoolShares,
  type SimulationState,
  type VitalityResult,
} from '../../simulation/index.js';
import { settleEnvironment } from '../../simulation/tick.js';
import { mapPools, type FormVector, type TunableConfig } from '../../simulation/config/index.js';
import type { OrganicResourceKey } from '../../simulation/resources/types.js';
import { sum } from '../../simulation/core/sum.js';
import { TICKS_PER_DAY } from '../utils/clock.js';

export interface PlantAhead {
  vitality: VitalityResult;
  /** What its budget does over the hour. */
  fluxes: FloraFluxes;
  light: PlantLight;
  /** Whether its buffer buys an offshoot over the hour. */
  buds: boolean;
  /** Its budget as the tick leaves it, any offshoot cut loose; null if it dies. */
  next: FloraState | null;
}

export interface FishAhead {
  vitality: VitalityResult;
  /** Its budget's hour: its pace, what it digested, what the budget did. */
  hour: FishHour;
  /** Whether it spawns or fathers a brood over the hour. */
  broods: boolean;
}

export interface BloomAhead extends Omit<BloomHour, 'spores'> {
  /** Condition as the tick leaves the bloom, its spores landed. */
  condition: number;
  /** Coverage as the tick leaves the bloom. */
  coverage: number;
}

export interface HourAhead {
  /** In `state.plants` order. */
  plants: PlantAhead[];
  /** In `state.fish` order. */
  fish: FishAhead[];
  algae: Record<AlgaeKind, BloomAhead>;
  /** The substrate's day of light the tick reads, mol/m²/d. */
  dailyLight: number;
  /** Waste the plants shed — their steady rate, apart from a death's one-off lump. */
  shedding: Organics;
  /** Waste the fish pass and their clutches leave. */
  fishWaste: Organics;
  /** mg of NH₃ the fish excrete through their gills. */
  gillAmmonia: number;
  /** Grams of food a day that would pay the fish's upkeep at the hour's pace. */
  ration: number;
  /** Each organic pool as the hour's decomposition meets it, the fish fed and the hour's waste shed. */
  pools: Record<OrganicResourceKey, Organics>;
  /** The shares of each pool that hour's decomposition rots and settles. */
  decomposition: Record<OrganicResourceKey, PoolShares>;
  /** mg of each form the plants' stores take up from the water. */
  waterUptake: FormVector;
}

export function readHourAhead(state: SimulationState, config: TunableConfig): HourAhead {
  const settled = settleEnvironment(state, config);
  const flora = processFlora(settled, config);
  const planted = applyEffects(flora.state, flora.effects, config);
  const livestock = processLivestock(planted, config);
  const bodies = processBodies(applyEffects(livestock.state, livestock.effects, config), config);
  const standingClutches = new Set(livestock.state.clutches.map((clutch) => clutch.id));
  const tended = bodies.state.clutches.filter((clutch) => standingClutches.has(clutch.id));
  const layers = livestock.state.fish.filter((fish) => readyToBrood(fish, tended));
  const brooding = new Set(layers.map((fish) => fish.species));
  const fathers = livestock.state.fish.filter((fish) => brooding.has(fish.species) && paysTowardBrood(fish));
  const broods = new Set([...layers, ...fathers].map((fish) => fish.id));
  const standing = new Set(state.plants.map((plant) => plant.id));
  const budded = new Set(
    planted.plants.filter((plant) => !standing.has(plant.id)).map((plant) => plant.parentId)
  );
  const passive = applyEffects(bodies.state, bodies.effects, config);

  return {
    plants: state.plants.map((plant, i) => ({
      vitality: flora.vitalities[i],
      fluxes: flora.fluxes[i],
      light: flora.light[i],
      buds: budded.has(plant.id),
      next: planted.plants.find((after) => after.id === plant.id)?.budget ?? null,
    })),
    fish: state.fish.map((fish, i) => ({
      vitality: livestock.vitalities[i],
      hour: livestock.hours[i],
      broods: broods.has(fish.id),
    })),
    algae: mapKinds((kind) => {
      const { vitality, light, fluxes, shedding, waterUptake, allelopathy } = flora.algae[kind];
      return {
        vitality,
        light,
        fluxes,
        shedding,
        waterUptake,
        allelopathy,
        condition: planted.algae[kind].condition,
        coverage: bloomCoverage(planted, kind),
      };
    }),
    dailyLight: dailyLightIntegral(settled.resources.lightByHour),
    shedding: flora.shedding,
    fishWaste: addOrganics(livestock.feces, bodies.waste),
    gillAmmonia: gillAmmonia(livestock.burned + bodies.burned, fishComposition(config)),
    ration: TICKS_PER_DAY * sum(livestock.hours.map((hour) => ration(hour.fish, hour.fluxes.owed))),
    pools: mapPools((pool) => organicPool(passive, pool)),
    decomposition: mapPools((pool) => poolShares(pool, passive, config.decomposition)),
    waterUptake: flora.waterUptake,
  };
}

/**
 * Fish metabolism: each hour every gut digests, every fish's energy budget
 * runs on what it digested at its species' pace, and every fish eats.
 *
 * Mass accounting
 * ---------------
 * Digested food splits κ_X to reserve and the rest to feces. The reserve is
 * made of the fish's own composition, so the feces carry whatever the food
 * held that the reserve did not keep into the waste pool. Reserve leaves only
 * as structure, brood buffer or burn — maintenance, development, every
 * conversion overhead, repair, and structure a starving fish loses. Every gram
 * burned excretes the fish's nitrogen through the gills as NH3 with its
 * minerals beside it, and breathes `oxygenPerGramBurned` in and its CO2 out.
 */

import type { Fish, Resources } from '../state.js';
import type { LivestockConfig } from '../config/livestock.js';
import { O2_TO_CO2_MASS_RATIO } from '../core/chemistry.js';
import { WASTE_NUTRIENTS, type MineralVector } from '../config/nutrients.js';
import { addOrganics, ofComposition, portion, scaleOrganics, type Composition, type Organics } from '../core/organics.js';
import { sum } from '../core/sum.js';
import { speciesTau } from '../livestock/species.js';
import { fishHardiness, toxinEFolds } from '../livestock/tolerance.js';
import { stepDeb, type DebFluxes } from './deb.js';
import { NO_STRESS, oxygenPace, totalBurned, type DebStress } from './reserve.js';
import { fishParams } from './fish-body.js';
import { digest, gutRoom, shareCapped, type Pace } from './digestion.js';
import { ammoniaIn } from './nitrogen-cycle.js';

type Loaded = Pick<Fish, 'species' | 'hardinessOffset' | 'load'>;

/**
 * DEBtox's assimilation mode for a fish carrying its load: every toxin's
 * e-folds past the fish's own edge, summed, lower its assimilation ceiling by
 * hyperbolic inhibition at `loadAssimilationSeverity`.
 */
export function loadStress(fish: Loaded, config: LivestockConfig): DebStress {
  const folds = sum(Object.values(toxinEFolds(fish.load, fishHardiness(fish))));
  return { ...NO_STRESS, assimilation: 1 / (1 + config.loadAssimilationSeverity * folds) };
}

/** The pace a fish runs at in this water, `saturation` the O2 it holds saturated. */
export function fishPace(
  fish: Loaded,
  water: Pick<Resources, 'temperature' | 'oxygen'>,
  saturation: number,
  config: LivestockConfig
): Pace {
  return {
    tau: speciesTau(fish.species, water.temperature),
    omega: oxygenPace(water.oxygen, saturation, config.oxygenHalfSaturation),
    stress: loadStress(fish, config),
  };
}

/** What burning grams of a fish's organics leaves in and takes from the water, all in mg. */
export interface Burn {
  ammonia: number;
  minerals: MineralVector;
  oxygen: number;
  co2: number;
}

/** mg of NH3 burning grams of a fish's organics, made of `body`, excretes through its gills. */
export function gillAmmonia(grams: number, body: Composition): number {
  return ammoniaIn(ofComposition(grams, body));
}

export function burn(grams: number, body: Composition, config: LivestockConfig): Burn {
  const oxygen = grams * config.oxygenPerGramBurned;
  return {
    ammonia: gillAmmonia(grams, body),
    minerals: Object.fromEntries(WASTE_NUTRIENTS.map((n) => [n, grams * body.nutrients[n]])) as MineralVector,
    oxygen,
    co2: oxygen * config.respiratoryQuotient * O2_TO_CO2_MASS_RATIO,
  };
}

/** One fish's hour of budget, before it eats and before its health moves. */
export interface FishHour {
  /** Its gut digested and handed back what the budget left, its budget stepped, its age and survival moved on. */
  fish: Fish;
  pace: Pace;
  digested: Organics;
  feces: Organics;
  fluxes: DebFluxes;
}

/**
 * An hour of one fish's budget on what its gut digests, `healing` the grams of
 * repair it asks of its reserve, `body` what its reserve is made of.
 */
export function liveHour(fish: Fish, pace: Pace, healing: number, config: LivestockConfig, body: Composition): FishHour {
  const p = fishParams(fish);
  const digested = digest(fish.gut, pace.tau, config);
  const { state, fluxes } = stepDeb(fish.budget, p, { fromGut: digested.grams, ...pace, healing });
  const returned = portion(digested, fluxes.returned);
  const taken = addOrganics(digested, scaleOrganics(returned, -1));
  return {
    fish: {
      ...fish,
      gut: addOrganics(fish.gut, scaleOrganics(digested, -1), returned),
      budget: state,
      age: fish.age + 1,
      survival: fish.survival * Math.exp(-fish.budget.hazard),
    },
    pace,
    digested,
    feces: addOrganics(taken, scaleOrganics(ofComposition(fluxes.assimilated, body), -1)),
    fluxes,
  };
}

export interface MetabolismResult {
  hours: FishHour[];
  /** Every fish fed, in the order handed in. */
  updatedFish: Fish[];
  /** The food eaten from the tank. */
  foodConsumed: Organics;
  feces: Organics;
  /** Grams of organics burned. */
  burned: number;
}

/**
 * One hour of metabolism. Each gut digests what it held coming into the hour
 * and each budget runs on it; then every fish eats at once, each filling its
 * gut, or the same share of its room as every other fish when there is not
 * enough food to go round.
 */
export function processMetabolism(
  fish: readonly Fish[],
  paces: readonly Pace[],
  healing: readonly number[],
  water: Pick<Resources, 'food'>,
  config: LivestockConfig,
  body: Composition
): MetabolismResult {
  const hours = fish.map((f, i) => liveHour(f, paces[i], healing[i], config, body));
  const rooms = hours.map((hour) => gutRoom(hour.fish, hour.pace));
  const eaten = shareCapped(rooms, rooms, water.food.grams).taken.map((grams) => portion(water.food, grams));
  return {
    hours,
    updatedFish: hours.map((hour, i) => ({ ...hour.fish, gut: addOrganics(hour.fish.gut, eaten[i]) })),
    foodConsumed: addOrganics(...eaten),
    feces: addOrganics(...hours.map((hour) => hour.feces)),
    burned: sum(hours.map((hour) => totalBurned(hour.fluxes))),
  };
}

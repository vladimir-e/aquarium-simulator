/**
 * Fish metabolism: each hour every gut digests, every fish's energy budget
 * runs on what it digested at its species' pace, and every fish eats.
 *
 * Mass accounting
 * ---------------
 * Of what the budget takes from the gut, κ_P passes undigested as feces at the
 * meal's composition. The rest builds reserve at the fish's own composition —
 * κ_X of the meal at most, less where the meal's scarcest element runs out —
 * and whatever it digested and did not build is the meal's excess, excreted
 * as it is assimilated: its nitrogen through the gills as NH3 with its
 * minerals beside it, its carbon respired. Reserve leaves only as structure,
 * brood buffer or burn — maintenance, development, every conversion overhead,
 * repair, and structure a starving fish loses. Every gram burned excretes the
 * fish's nitrogen and minerals the same way, breathes in the oxygen its
 * reserve's formula takes, and breathes its carbon out as CO2.
 */

import type { Fish, Resources } from '../state.js';
import type { LivestockConfig } from '../config/livestock.js';
import { C_TO_CO2_MASS_RATIO, C_TO_O2_MASS_RATIO, MG_PER_G, O2_PER_RESERVE_BURNED } from '../core/chemistry.js';
import { WASTE_NUTRIENTS, type MineralVector } from '../config/nutrients.js';
import { addOrganics, buildable, portion, scaleOrganics, sumOrganics, type Organics } from '../core/organics.js';
import { sum } from '../core/sum.js';
import { speciesTau } from '../livestock/species.js';
import { fishHardiness, toxinEFolds } from '../livestock/tolerance.js';
import { stepDeb, type DebFluxes, type DebParams } from './deb.js';
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

/** What a fish's burn or excretion leaves in and takes from the water, all in mg. */
export interface Burn {
  ammonia: number;
  minerals: MineralVector;
  oxygen: number;
  co2: number;
}

/** mg of NH3 burning grams of a fish's organics excretes through its gills. */
export function gillAmmonia(grams: number, body: Organics): number {
  return ammoniaIn(portion(body, grams));
}

function release(released: Organics, oxygen: number): Burn {
  return {
    ammonia: ammoniaIn(released),
    minerals: Object.fromEntries(WASTE_NUTRIENTS.map((n) => [n, released.nutrients[n]])) as MineralVector,
    oxygen,
    co2: released.carbon * MG_PER_G * C_TO_CO2_MASS_RATIO,
  };
}

export function burn(grams: number, body: Organics): Burn {
  return release(portion(body, grams), grams * MG_PER_G * O2_PER_RESERVE_BURNED);
}

/** What a meal's excess releases as it is assimilated, its carbon respired as carbohydrate's. */
export function excrete(excess: Organics): Burn {
  return release(excess, excess.carbon * MG_PER_G * C_TO_O2_MASS_RATIO);
}

/**
 * The share of κ_X a meal of this composition builds reserve at: all of it but
 * the κ_P passed undigested, against κ_X of the body, the scarcest element
 * ruling.
 */
export function mealQuality(meal: Organics, body: Organics, p: Pick<DebParams, 'kappaX' | 'kappaP'>): number {
  return Math.min(1, ((1 - p.kappaP) * buildable(portion(meal, 1), body)) / p.kappaX);
}

/** One fish's hour of budget, before it eats and before its health moves. */
export interface FishHour {
  /** Its gut digested and handed back what the budget left, its budget stepped, its age and survival moved on. */
  fish: Fish;
  pace: Pace;
  digested: Organics;
  feces: Organics;
  excreted: Organics;
  fluxes: DebFluxes;
}

/** An hour of one fish's budget on what its gut digests, `healing` the grams of repair it asks of its reserve. */
export function liveHour(fish: Fish, pace: Pace, healing: number, config: LivestockConfig, body: Organics): FishHour {
  const p = fishParams(fish);
  const digested = digest(fish.gut, pace.tau, config);
  const quality = mealQuality(digested, body, p);
  const { state, fluxes } = stepDeb(fish.budget, p, { fromGut: digested.grams, quality, ...pace, healing });
  const taken = portion(digested, digested.grams - fluxes.returned);
  const feces = portion(digested, fluxes.feces);
  return {
    fish: {
      ...fish,
      gut: addOrganics(fish.gut, scaleOrganics(taken, -1)),
      budget: state,
      age: fish.age + 1,
      survival: fish.survival * Math.exp(-fish.budget.hazard),
    },
    pace,
    digested,
    feces,
    excreted: sumOrganics(taken, scaleOrganics(feces, -1), scaleOrganics(portion(body, fluxes.assimilated), -1)),
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
  excreted: Organics;
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
  body: Organics
): MetabolismResult {
  const hours = fish.map((f, i) => liveHour(f, paces[i], healing[i], config, body));
  const rooms = hours.map((hour) => gutRoom(hour.fish, hour.pace));
  const eaten = shareCapped(rooms, rooms, water.food.grams).taken.map((grams) => portion(water.food, grams));
  return {
    hours,
    updatedFish: hours.map((hour, i) => ({ ...hour.fish, gut: addOrganics(hour.fish.gut, eaten[i]) })),
    foodConsumed: addOrganics(...eaten),
    feces: sumOrganics(...hours.map((hour) => hour.feces)),
    excreted: sumOrganics(...hours.map((hour) => hour.excreted)),
    burned: sum(hours.map((hour) => totalBurned(hour.fluxes))),
  };
}

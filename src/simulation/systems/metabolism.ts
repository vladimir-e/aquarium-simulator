/**
 * Fish metabolism: each hour every gut digests, every fish's energy budget
 * runs on what it digested at its species' pace, and every fish eats.
 *
 * Mass accounting
 * ---------------
 * Digested food splits κ_X to reserve and the rest to feces, which carry the
 * food's nitrogen and minerals into the waste pool. Reserve leaves only as
 * structure, brood buffer or burn — maintenance, development, every
 * conversion overhead, repair, and structure a starving fish loses. A fish is
 * made of what it ate, so every gram burned excretes the food's nitrogen
 * through the gills as NH3 with its minerals beside it, and breathes
 * `oxygenPerGramBurned` in and its CO2 out.
 */

import type { Fish, Resources } from '../state.js';
import type { LivestockConfig } from '../config/livestock.js';
import { N_TO_NH3_MASS_RATIO, O2_TO_CO2_MASS_RATIO } from '../core/chemistry.js';
import { WASTE_NUTRIENTS, type MineralVector } from '../config/nutrients.js';
import { sum } from '../core/sum.js';
import { speciesTau } from '../livestock/species.js';
import { fishHardiness, toxinEFolds } from '../livestock/tolerance.js';
import { stepDeb, type DebFluxes } from './deb.js';
import { NO_STRESS, oxygenPace, totalBurned, type DebStress } from './reserve.js';
import { fishParams } from './fish-body.js';
import { digest, gutRoom, shareCapped, type Pace } from './digestion.js';

const NH3_MG_PER_G_N = N_TO_NH3_MASS_RATIO * 1000;

type Exposed = Pick<Fish, 'species' | 'hardinessOffset' | 'load'>;

/**
 * DEBtox's assimilation mode for a fish carrying its load: every toxin's
 * e-folds past the fish's own edge, summed as toxic units, lower its
 * assimilation ceiling by hyperbolic inhibition at `loadAssimilationSeverity`.
 */
export function loadStress(fish: Exposed, config: LivestockConfig): DebStress {
  const toxicUnits = sum(Object.values(toxinEFolds(fish.load, fishHardiness(fish))));
  return { ...NO_STRESS, assimilation: 1 / (1 + config.loadAssimilationSeverity * toxicUnits) };
}

/** The pace a fish runs at in this water, `saturation` the O2 it holds saturated. */
export function fishPace(
  fish: Exposed,
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

/** mg of NH3 burning grams of a fish's organics excretes through its gills. */
export function gillAmmonia(grams: number, config: LivestockConfig): number {
  return grams * config.foodNitrogenFraction * NH3_MG_PER_G_N;
}

export function burn(grams: number, config: LivestockConfig, foodMineralContent: MineralVector): Burn {
  const oxygen = grams * config.oxygenPerGramBurned;
  return {
    ammonia: gillAmmonia(grams, config),
    minerals: Object.fromEntries(WASTE_NUTRIENTS.map((n) => [n, grams * foodMineralContent[n]])) as MineralVector,
    oxygen,
    co2: oxygen * config.respiratoryQuotient * O2_TO_CO2_MASS_RATIO,
  };
}

/** One fish's hour of budget, before it eats and before its health moves. */
export interface FishHour {
  /** Its gut digested and handed back what the budget left, its budget stepped, its age and survival moved on. */
  fish: Fish;
  pace: Pace;
  digested: number;
  fluxes: DebFluxes;
}

/** An hour of one fish's budget on what its gut digests, `healing` the grams of repair it asks of its reserve. */
export function liveHour(fish: Fish, pace: Pace, healing: number, config: LivestockConfig): FishHour {
  const p = fishParams(fish);
  const digested = digest(fish.gut, pace.tau, config);
  const { state, fluxes } = stepDeb(fish.budget, p, { fromGut: digested, ...pace, healing });
  return {
    fish: {
      ...fish,
      gut: fish.gut - digested + fluxes.returned,
      budget: state,
      age: fish.age + 1,
      survival: fish.survival * Math.exp(-fish.budget.hazard),
    },
    pace,
    digested,
    fluxes,
  };
}

export interface MetabolismResult {
  hours: FishHour[];
  /** Every fish fed, in the order handed in. */
  updatedFish: Fish[];
  /** Grams of food eaten from the tank. */
  foodConsumed: number;
  /** Grams of feces. */
  feces: number;
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
  config: LivestockConfig
): MetabolismResult {
  const hours = fish.map((f, i) => liveHour(f, paces[i], healing[i], config));
  const rooms = hours.map((hour) => gutRoom(hour.fish, hour.pace));
  const eaten = shareCapped(rooms, rooms, water.food).taken;
  return {
    hours,
    updatedFish: hours.map((hour, i) => ({ ...hour.fish, gut: hour.fish.gut + eaten[i] })),
    foodConsumed: sum(eaten),
    feces: sum(hours.map((hour) => hour.fluxes.feces)),
    burned: sum(hours.map((hour) => totalBurned(hour.fluxes))),
  };
}

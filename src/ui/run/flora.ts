/**
 * Flora derivations: what each plant and the algae are doing right now, and the
 * nutrient readings the Nutrients panel and the index rail share. Nothing here
 * invents a band — a nutrient reads short when the engine's own sufficiency
 * would rise if that one were topped up, so the panel can never name a
 * deficiency the plants are not actually feeling.
 */

import {
  calculateNutrientSufficiency,
  computeAlgaePopulation,
  computePlantVitality,
  getDosePreview,
  getMaxPlants,
  getPlantsToTrimCount,
  MAX_DOSE_ML,
  PLANT_SPECIES_DATA,
  type NutrientDemand,
  type Resources,
  type SimulationState,
  type VitalityFactor,
} from '../../simulation/index.js';
import { getDemandMultiplier } from '../../simulation/systems/nutrients.js';
import {
  getMassFromPpm,
  getPpm,
  IronResource,
  NitrateResource,
  PhosphateResource,
  PotassiumResource,
  type ResourceDefinition,
} from '../../simulation/resources/index.js';
import type {
  FertilizerFormula,
  NutrientsConfig,
  TunableConfig,
} from '../../simulation/config/index.js';
import { conditionStatus, conditionWord, type Status } from './status.js';

/**
 * Trim targets, in % of a plant's size. A calibrated planted tank settles at
 * 60–90 % (82 % measured at day 28 in
 * `docs/calibration/baselines/02-planted-equilibrium.md`), so every rung here is
 * reachable in an ordinary run.
 */
export const TRIM_TARGETS = [50, 75, 85];

// Low algae mass is good for the player, so the colours run green → coral as it climbs.
export function algaeStatus(mass: number): Status {
  return mass < 30 ? 'ok' : mass < 60 ? 'warn' : 'alert';
}

export function algaeWord(mass: number): string {
  if (mass < 30) return 'suppressed';
  if (mass < 60) return 'active';
  if (mass < 80) return 'spreading';
  return 'booming';
}

/** One row of the plant list, with the vitality behind it already resolved. */
export interface PlantRow {
  id: string;
  name: string;
  /** % of normal full size — plants grow past 100 % toward their species ceiling. */
  size: number;
  condition: number;
  status: Status;
  word: string;
  /** Condition change per hour: what the breakdown below it sums to. */
  net: number;
  stressors: VitalityFactor[];
  benefits: VitalityFactor[];
}

function acting(factors: VitalityFactor[]): VitalityFactor[] {
  return factors.filter((f) => f.amount > 0);
}

export function plantRows(state: SimulationState, config: TunableConfig): PlantRow[] {
  const { plants, resources, algae } = state;

  return plants.map((plant) => {
    const vitality = computePlantVitality({
      plant,
      resources,
      waterVolume: resources.water,
      plantsConfig: config.plants,
      nutrientSufficiency: calculateNutrientSufficiency(
        resources,
        resources.water,
        plant.species,
        config.nutrients
      ),
      algaeMass: algae.mass,
    });

    return {
      id: plant.id,
      name: PLANT_SPECIES_DATA[plant.species].name,
      size: plant.size,
      condition: plant.condition,
      status: conditionStatus(plant.condition),
      word: conditionWord(plant.condition),
      net: vitality.breakdown.net,
      stressors: acting(vitality.breakdown.stressors),
      benefits: acting(vitality.breakdown.benefits),
    };
  });
}

/**
 * The plants in trouble, worst first. One definition of ailing, so the card's
 * count and the rail's named plant can never disagree.
 */
export function ailingPlants(rows: PlantRow[]): PlantRow[] {
  return rows.filter((row) => row.status !== 'ok').sort((a, b) => a.condition - b.condition);
}

/** The algae, read the same way as a plant — but a stressor here is good news. */
export interface AlgaeRow {
  mass: number;
  status: Status;
  word: string;
  net: number;
  stressors: VitalityFactor[];
  benefits: VitalityFactor[];
}

export function algaeRow(state: SimulationState, config: TunableConfig): AlgaeRow {
  const population = computeAlgaePopulation({
    plants: state.plants,
    resources: state.resources,
    tankCapacity: state.tank.capacity,
    algaeConfig: config.algae,
    nutrientsConfig: config.nutrients,
  });

  return {
    mass: state.algae.mass,
    status: algaeStatus(state.algae.mass),
    word: algaeWord(state.algae.mass),
    net: population.net,
    stressors: acting(population.breakdown.stressors),
    benefits: acting(population.breakdown.benefits),
  };
}

export type NutrientKey = 'nitrate' | 'phosphate' | 'potassium' | 'iron';

const NUTRIENT_KEYS: NutrientKey[] = ['nitrate', 'phosphate', 'potassium', 'iron'];

const NUTRIENT_LABEL: Record<NutrientKey, string> = {
  nitrate: 'NO₃',
  phosphate: 'PO₄',
  potassium: 'K',
  iron: 'Fe',
};

const NUTRIENT_RESOURCE: Record<NutrientKey, ResourceDefinition<NutrientKey>> = {
  nitrate: NitrateResource,
  phosphate: PhosphateResource,
  potassium: PotassiumResource,
  iron: IronResource,
};

const OPTIMAL_PPM: Record<NutrientKey, (config: NutrientsConfig) => number> = {
  nitrate: (c) => c.optimalNitratePpm,
  phosphate: (c) => c.optimalPhosphatePpm,
  potassium: (c) => c.optimalPotassiumPpm,
  iron: (c) => c.optimalIronPpm,
};

/** Mass is stored in mg, so a drained nutrient lands near zero rather than on it. */
const DEPLETED_PPM = 0.001;

const DEMAND_RANK: Record<NutrientDemand, number> = { low: 0, medium: 1, high: 2 };

export interface NutrientReading {
  key: NutrientKey;
  label: string;
  ppm: number;
  text: string;
  /** ppm the hungriest plant in the tank needs; 0 when nothing is planted. */
  needed: number;
  neededText: string;
  /** Position against that need, 0–1. */
  fill: number;
  /** Topping this one up would raise the engine's sufficiency for some plant. */
  limiting: boolean;
  /** Coral empty, amber short, green at the need — grey while it holds nothing back. */
  status: Status;
}

/** The demand tier the tank is fed to: its hungriest plant. */
export function tankDemand(state: SimulationState): NutrientDemand | null {
  let hungriest: NutrientDemand | null = null;
  for (const plant of state.plants) {
    const demand = PLANT_SPECIES_DATA[plant.species].nutrientDemand;
    if (hungriest === null || DEMAND_RANK[demand] > DEMAND_RANK[hungriest]) hungriest = demand;
  }
  return hungriest;
}

export function nutrientReadings(
  state: SimulationState,
  config: TunableConfig
): NutrientReading[] {
  const nutrients = config.nutrients;
  const demand = tankDemand(state);
  const multiplier = demand === null ? 0 : getDemandMultiplier(demand, nutrients);
  const water = state.resources.water;

  const needs = Object.fromEntries(
    NUTRIENT_KEYS.map((key) => [key, OPTIMAL_PPM[key](nutrients) * multiplier])
  ) as Record<NutrientKey, number>;

  // Everything the plants ask for, present at once — the probe's yardstick.
  const met: Resources = { ...state.resources };
  if (water > 0) {
    for (const key of NUTRIENT_KEYS) {
      met[key] = Math.max(state.resources[key], getMassFromPpm(needs[key], water));
    }
  }

  /**
   * Ask the engine rather than restate it: hold every other nutrient at what the
   * plants need and see whether leaving this one where it is costs sufficiency.
   * That keeps the panel in step with the engine's own required-versus-booster
   * rules per demand tier, and stays right when several are empty at once.
   */
  const isLimiting = (key: NutrientKey): boolean => {
    if (needs[key] <= 0 || water <= 0) return false;
    const short: Resources = { ...met, [key]: state.resources[key] };
    return state.plants.some(
      (plant) =>
        calculateNutrientSufficiency(short, water, plant.species, nutrients) <
        calculateNutrientSufficiency(met, water, plant.species, nutrients)
    );
  };

  return NUTRIENT_KEYS.map((key) => {
    const resource = NUTRIENT_RESOURCE[key];
    const ppm = getPpm(state.resources[key], water);
    const needed = needs[key];
    const limiting = isLimiting(key);
    const depleted = ppm <= DEPLETED_PPM;

    return {
      key,
      label: NUTRIENT_LABEL[key],
      ppm,
      text: ppm.toFixed(resource.precision),
      needed,
      neededText: needed > 0 ? needed.toFixed(resource.precision) : '—',
      fill: needed > 0 ? Math.min(1, ppm / needed) : 0,
      limiting,
      status: limiting
        ? depleted
          ? 'alert'
          : 'warn'
        : needed > 0 && ppm >= needed
          ? 'ok'
          : 'neutral',
    };
  });
}

export interface NutrientAlert {
  text: string;
  status: Status;
}

/**
 * The one thing to say about the tank's nutrients. Shared by the index rail and
 * the Nutrients header so the two can never name different deficiencies.
 */
export function nutrientAlert(readings: NutrientReading[]): NutrientAlert | null {
  const short = readings.filter((r) => r.limiting);
  if (short.length === 0) return null;

  const status: Status = short.some((r) => r.status === 'alert') ? 'alert' : 'warn';
  if (short.length === readings.length) return { text: 'nothing dosed', status };
  if (short.length === 1) {
    const [only] = short;
    return { text: `${only.label} ${only.status === 'alert' ? 'depleted' : 'low'}`, status };
  }
  return { text: `${short.length} nutrients low`, status };
}

export interface NutrientDelta {
  key: NutrientKey;
  label: string;
  text: string;
}

/** What a dose of `ml` adds to this much water, per nutrient. */
export function doseDeltas(ml: number, water: number, formula: FertilizerFormula): NutrientDelta[] {
  const preview = getDosePreview(ml, water, formula);
  const ppm: Record<NutrientKey, number> = {
    nitrate: preview.nitratePpm,
    phosphate: preview.phosphatePpm,
    potassium: preview.potassiumPpm,
    iron: preview.ironPpm,
  };

  return NUTRIENT_KEYS.map((key) => ({
    key,
    label: NUTRIENT_LABEL[key],
    text: `+${ppm[key].toFixed(NUTRIENT_RESOURCE[key].precision)}`,
  }));
}

/** One line of dose deltas, wherever a dose is previewed. */
export function formatDose(deltas: NutrientDelta[]): string {
  return deltas.map((delta) => `${delta.text} ${delta.label}`).join(' · ');
}

export interface DoseAdvice {
  /** Whole ml of fertiliser that lifts every short nutrient to what the plants need. */
  ml: number;
  /** More than the engine takes in a single dose, so it wants splitting. */
  overSingleDose: boolean;
  /** Labels of the nutrients it clears, so the advice names its own scope. */
  covers: string[];
}

export function doseToCover(
  readings: NutrientReading[],
  state: SimulationState,
  config: TunableConfig
): DoseAdvice | null {
  const formula = config.nutrients.fertilizerFormula;
  const water = state.resources.water;
  const short = readings.filter((r) => r.limiting);
  if (short.length === 0 || water <= 0) return null;

  const ml = short.reduce(
    (most, r) => Math.max(most, ((r.needed - r.ppm) * water) / formula[r.key]),
    0
  );
  const whole = Math.max(1, Math.ceil(ml));
  return {
    ml: whole,
    overSingleDose: whole > MAX_DOSE_ML,
    covers: short.map((r) => r.label),
  };
}

export interface TrimTarget {
  target: number;
  count: number;
  disabled: boolean;
}

export function trimTargets(state: SimulationState): TrimTarget[] {
  return TRIM_TARGETS.map((target) => {
    const count = getPlantsToTrimCount(state, target);
    return { target, count, disabled: count === 0 };
  });
}

/** The section's headline figure, shared with the rail's Flora row. */
export function plantsAndAlgae(state: SimulationState): string {
  const algaePct = Math.round(state.algae.mass);
  const algae = algaePct < 1 ? 'no algae' : `algae ${algaePct} %`;
  return `${state.plants.length} of ${getMaxPlants(state.tank.capacity)} plants · ${algae}`;
}

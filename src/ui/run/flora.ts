/**
 * Flora derivations: what each plant is doing on the hour the next tick
 * settles and how the planting folds into species and families, how the bloom
 * reads off its coverage, and the tank's nutrient readings. Nothing here invents a band — a nutrient reads short when the
 * engine's own sufficiency would rise if that one were topped up, so no surface
 * can name a deficiency the plants are not actually feeling.
 */

import {
  calculateNutrientSufficiency,
  floorCover,
  getDosePreview,
  getPlantsToTrimCount,
  isOvergrown,
  MAX_DOSE_ML,
  PLANT_SPECIES_DATA,
  speciesHalfSaturation,
  type PlantSpecies,
  type Resources,
  type SimulationState,
} from '../../simulation/index.js';
import {
  getMassFromPpm,
  getPpm,
  IronResource,
  NitrateResource,
  PhosphateResource,
  PotassiumResource,
  type ResourceDefinition,
} from '../../simulation/resources/index.js';
import {
  NUTRIENTS,
  type FertilizerFormula,
  type Nutrient,
  type NutrientsConfig,
  type PlantsConfig,
  type TunableConfig,
} from '../../simulation/config/index.js';
import type { HourAhead } from './ahead.js';
import {
  bankShare,
  groupMember,
  groupReading,
  vitalReading,
  type Reading,
  type Status,
} from './status.js';

/**
 * Trim targets, % of a full unit. A planted tank settles at 60–90 %, so
 * every rung here is reachable in an ordinary run.
 */
export const TRIM_TARGETS = [50, 75, 85];

/**
 * The loosest rung on that ladder, and so the line a plant is "too big" against:
 * a plant above it is filling its unit and shading what's below.
 */
const TRIM_CEILING = Math.max(...TRIM_TARGETS);

/** Plants every rung of the trim ladder would cut — the reason to reach for it. */
export function overTrimCount(state: SimulationState): number {
  return getPlantsToTrimCount(state, TRIM_CEILING);
}

// Low algae mass is good for the player, so the colours run green → coral as it climbs.
export function algaeStatus(mass: number): Status {
  return mass < 30 ? 'ok' : mass < 60 ? 'warn' : 'alert';
}

export function algaeWord(mass: number): string {
  if (mass < 30) return 'sparse';
  if (mass < 60) return 'active';
  if (mass < 80) return 'spreading';
  return 'booming';
}

/** How the bloom reads off its coverage. */
export function algaeReading(mass: number): Reading {
  return { status: algaeStatus(mass), word: algaeWord(mass) };
}

/** One row of the plant list, read on the hour the next tick settles. */
export interface PlantRow {
  id: string;
  species: PlantSpecies;
  name: string;
  familyId: string;
  parentId: string | null;
  /** % of one full unit of its growth form; growth tapers to 100. */
  size: number;
  /** Hours in the tank. */
  age: number;
  condition: number;
  sick: boolean;
  reading: Reading;
  /** The day's light at its own height over the day's light its species starves under. */
  light: number;
  /** Its bank as a share of what the next offshoot costs. */
  bank: number;
}

export function plantRows(
  state: SimulationState,
  ahead: HourAhead,
  config: PlantsConfig
): PlantRow[] {
  return state.plants.map((plant, i) => {
    const { vitality, light } = ahead.plants[i];
    const { sick, reading } = vitalReading(plant.condition, vitality);
    return {
      id: plant.id,
      species: plant.species,
      name: PLANT_SPECIES_DATA[plant.species].name,
      familyId: plant.familyId,
      parentId: plant.parentId,
      size: plant.size,
      age: plant.age,
      condition: plant.condition,
      sick,
      reading,
      light: light.needShare,
      bank: bankShare(plant.surplus, config.surplusCap),
    };
  });
}

/** A share as the plant readings print it: floored, so it never reads a line it has not reached. */
export function sharePercent(share: number): number {
  return Math.floor(share * 100);
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
}

/** What a family or a species reads as, over every unit under it. */
export interface PlantGroupFigures {
  /** Full units' worth of plant: the sizes summed, over 100. */
  units: number;
  /** Mean condition across the units, the strip's figure. */
  condition: number;
  /** Hours the oldest unit has stood in the tank. */
  oldest: number;
  /** The worst-lit unit's light, as a share of its need. */
  light: number;
}

function figuresOf(members: PlantRow[]): PlantGroupFigures {
  return {
    units: members.reduce((sum, member) => sum + member.size, 0) / 100,
    condition: mean(members.map((member) => member.condition)),
    oldest: Math.max(...members.map((member) => member.age)),
    light: Math.min(...members.map((member) => member.light)),
  };
}

/** A founder and every unit budded down its line, read by the group rule over them. */
export interface PlantFamily extends PlantGroupFigures {
  familyId: string;
  reading: Reading;
  /** In planting order. */
  members: PlantRow[];
}

/**
 * A species read as its families, the way a fish species reads as its fish: the
 * group rule counts families, each standing as one member at its worst unit.
 */
export interface PlantSpeciesGroup extends PlantGroupFigures {
  species: PlantSpecies;
  name: string;
  reading: Reading;
  /** In the order they were founded. */
  families: PlantFamily[];
  /** Every unit of the species, in planting order. */
  members: PlantRow[];
}

function groupBy<K>(rows: PlantRow[], key: (row: PlantRow) => K): PlantRow[][] {
  const groups = new Map<K, PlantRow[]>();
  for (const row of rows) {
    const existing = groups.get(key(row));
    if (existing) existing.push(row);
    else groups.set(key(row), [row]);
  }
  return [...groups.values()];
}

export function groupPlantsBySpecies(rows: PlantRow[]): PlantSpeciesGroup[] {
  return groupBy(rows, (row) => row.species).map((members) => {
    const families = groupBy(members, (row) => row.familyId).map(
      (family): PlantFamily => ({
        familyId: family[0].familyId,
        ...figuresOf(family),
        reading: groupReading(family),
        members: family,
      })
    );
    return {
      species: members[0].species,
      name: members[0].name,
      ...figuresOf(members),
      reading: groupReading(families.map((family) => groupMember(family.members))),
      families,
      members,
    };
  });
}

/**
 * How much of the floor the planting claims. Past the whole floor it says the
 * planting has outgrown it, and never prints a figure that would put it back.
 */
export function floorPlanted(state: SimulationState): string {
  const percent = Math.round(floorCover(state.plants, state.tank.capacity) * 100);
  return isOvergrown(state)
    ? `floor outgrown · ${Math.max(101, percent)} % claimed`
    : `floor ${percent} % planted`;
}

const NUTRIENT_LABEL: Record<Nutrient, string> = {
  nitrate: 'NO₃',
  phosphate: 'PO₄',
  potassium: 'K',
  iron: 'Fe',
};

const NUTRIENT_RESOURCE: Record<Nutrient, ResourceDefinition<Nutrient>> = {
  nitrate: NitrateResource,
  phosphate: PhosphateResource,
  potassium: PotassiumResource,
  iron: IronResource,
};

/** Share of a plant's need a nutrient must meet for the panel to call it met — Monod never reaches 1. */
const NEED_SHARE = 0.9;

/** Mass is stored in mg, so a drained nutrient lands near zero rather than on it. */
const DEPLETED_PPM = 0.001;

export interface NutrientReading {
  key: Nutrient;
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

/** ppm at which the tank's hungriest plant has `NEED_SHARE` of its need met. */
function neededPpm(state: SimulationState, key: Nutrient, config: NutrientsConfig): number {
  const halfSaturation = Math.max(
    0,
    ...state.plants.map((plant) => speciesHalfSaturation(plant.species, key, config))
  );
  return (halfSaturation * NEED_SHARE) / (1 - NEED_SHARE);
}

export function nutrientReadings(
  state: SimulationState,
  config: TunableConfig
): NutrientReading[] {
  const nutrients = config.nutrients;
  const water = state.resources.water;

  const needs = Object.fromEntries(
    NUTRIENTS.map((key) => [key, neededPpm(state, key, nutrients)])
  ) as Record<Nutrient, number>;

  // Everything the plants ask for, present at once — the probe's yardstick.
  const met: Resources = { ...state.resources };
  if (water > 0) {
    for (const key of NUTRIENTS) {
      met[key] = Math.max(state.resources[key], getMassFromPpm(needs[key], water));
    }
  }

  /**
   * Ask the engine rather than restate it: hold every other nutrient at what the
   * plants need and see whether leaving this one where it is costs sufficiency.
   * That keeps the panel in step with each species' own demand, and stays right
   * when several are empty at once.
   */
  const isLimiting = (key: Nutrient): boolean => {
    if (needs[key] <= 0 || water <= 0) return false;
    const short: Resources = { ...met, [key]: state.resources[key] };
    return state.plants.some(
      (plant) =>
        calculateNutrientSufficiency(short, water, plant.species, nutrients) <
        calculateNutrientSufficiency(met, water, plant.species, nutrients)
    );
  };

  return NUTRIENTS.map((key) => {
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

/** The one thing to say about the tank's nutrients. */
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
  key: Nutrient;
  label: string;
  text: string;
}

/** What a dose of `ml` adds to this much water, per nutrient. */
export function doseDeltas(ml: number, water: number, formula: FertilizerFormula): NutrientDelta[] {
  const preview = getDosePreview(ml, water, formula);
  const ppm: Record<Nutrient, number> = {
    nitrate: preview.nitratePpm,
    phosphate: preview.phosphatePpm,
    potassium: preview.potassiumPpm,
    iron: preview.ironPpm,
  };

  return NUTRIENTS.map((key) => ({
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

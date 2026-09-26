/**
 * Flora derivations: what each plant is doing on the hour the next tick
 * settles, how the planting folds into species and families and how the reader
 * counts them, how the bloom reads off its coverage, and the tank's nutrient
 * readings. Nothing here invents a band — a nutrient reads short when the
 * engine's own sufficiency would rise if that one were topped up, and high past
 * a line the engine itself charges or alerts from, so no surface can name a
 * shortage or an excess the tank is not actually feeling.
 */

import {
  calculateNutrientSufficiency,
  tankPools,
  floorCover,
  getDosePreview,
  isOvergrown,
  MAX_DOSE_ML,
  PLANT_SPECIES_DATA,
  plantNitrateEdge,
  speciesHalfSaturation,
  type Plant,
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
  type PlantsConfig,
  type TunableConfig,
} from '../../simulation/config/index.js';
import { NITRATE_EDGE } from '../../simulation/livestock/tolerance.js';
import type { HourAhead } from './ahead.js';
import { groupBy, mean, numbered } from './fold.js';
import { plantLightStatus } from './light.js';
import {
  bankShare,
  groupMember,
  groupReading,
  vitalReading,
  worstStatus,
  type Reading,
  type Status,
} from './status.js';

/**
 * Trim targets, % of a full unit. A planted tank settles at 60–90 %, so
 * every rung here is reachable in an ordinary run.
 */
export const TRIM_TARGETS = [50, 75, 85];

/**
 * The bloom's ladder, each rung a multiple of the line it alerts over, so its
 * word and its tone move together. Low algae is good for the player, so the
 * tones run green → coral as it climbs.
 */
const ALGAE_LADDER: readonly { upTo: number; reading: Reading }[] = [
  { upTo: 0.5, reading: { status: 'ok', word: 'sparse' } },
  { upTo: 1, reading: { status: 'ok', word: 'active' } },
  { upTo: 2, reading: { status: 'warn', word: 'spreading' } },
  { upTo: Infinity, reading: { status: 'alert', word: 'booming' } },
];

/** How the bloom reads off its coverage, against the line it alerts over. */
export function algaeReading(mass: number, line: number): Reading {
  return ALGAE_LADDER.find((rung) => mass <= rung.upTo * line)!.reading;
}

export function algaeStatus(mass: number, line: number): Status {
  return algaeReading(mass, line).status;
}

/** Where a plant stands among its kin, numbered the way a reader counts. */
export interface PlantLabel {
  /** Its family, in the order its species' families were founded. */
  family: number;
  /** Itself, in the order its family's units were born. */
  unit: number;
  /** The unit it budded from, while that one stands. */
  parent: number | null;
}

type Kin = Pick<Plant, 'id' | 'species' | 'familyId' | 'parentId'>;

/** Every plant's label, by id. The ids stay the engine's; these are the reader's. */
export function plantLabels(plants: readonly Kin[]): Map<string, PlantLabel> {
  const families = new Map(
    groupBy(plants, (plant) => plant.species).flatMap((kind) => [
      ...numbered(new Set(kind.map((plant) => plant.familyId))),
    ])
  );
  const units = new Map(
    groupBy(plants, (plant) => plant.familyId).flatMap((family) => [
      ...numbered(family.map((plant) => plant.id)),
    ])
  );
  return new Map(
    plants.map((plant) => [
      plant.id,
      {
        family: families.get(plant.familyId)!,
        unit: units.get(plant.id)!,
        parent: plant.parentId === null ? null : (units.get(plant.parentId) ?? null),
      },
    ])
  );
}

/** A family as the console names it. */
export function familyTitle(name: string, label: PlantLabel): string {
  return `${name} family ${label.family}`;
}

/** A unit as the console names it, family first. */
export function unitTitle(name: string, label: PlantLabel): string {
  return `${familyTitle(name, label)} · #${label.unit}`;
}

/** One row of the plant list, read on the hour the next tick settles. */
export interface PlantRow {
  id: string;
  species: PlantSpecies;
  name: string;
  familyId: string;
  label: PlantLabel;
  /** % of one full unit of its growth form; growth tapers to 100. */
  size: number;
  /** Hours in the tank. */
  age: number;
  condition: number;
  sick: boolean;
  reading: Reading;
  /** The day's light at its own height over the day's light its species starves under. */
  light: number;
  lightStatus: Status;
  /** Its bank as a share of what the next offshoot costs. */
  bank: number;
}

export function plantRows(state: SimulationState, config: TunableConfig, ahead: HourAhead): PlantRow[] {
  const labels = plantLabels(state.plants);
  return state.plants.map((plant, i) => {
    const { vitality, light } = ahead.plants[i];
    const { sick, reading } = vitalReading(plant.condition, vitality);
    return {
      id: plant.id,
      species: plant.species,
      name: PLANT_SPECIES_DATA[plant.species].name,
      familyId: plant.familyId,
      label: labels.get(plant.id)!,
      size: plant.size,
      age: plant.age,
      condition: plant.condition,
      sick,
      reading,
      light: light.needShare,
      lightStatus: plantLightStatus(light, plant.species),
      bank: bankShare(plant.surplus, config.plants.surplusCap),
    };
  });
}

/** A share as the plant readings print it: rounded down, so it never reads a line it has not reached. */
export function sharePercent(share: number): number {
  return Math.floor(share * 100);
}

/** What a family or a species reads as, over every unit under it. */
export interface PlantGroupFigures {
  /** The sizes summed, % of one full unit of the growth form. */
  size: number;
  /** Mean condition across the units, the strip's figure. */
  condition: number;
  /** Hours the oldest unit has stood in the tank. */
  oldest: number;
  /** The worst-lit unit's light, as a share of its need. */
  light: number;
  /** The worst any unit's light reads: short, or burning. */
  lightStatus: Status;
}

function figuresOf(members: PlantRow[]): PlantGroupFigures {
  return {
    size: members.reduce((sum, member) => sum + member.size, 0),
    condition: mean(members.map((member) => member.condition)),
    oldest: Math.max(...members.map((member) => member.age)),
    light: Math.min(...members.map((member) => member.light)),
    lightStatus: members.map((member) => member.lightStatus).reduce(worstStatus),
  };
}

/** A founder and every unit budded down its line, read by the group rule over them. */
export interface PlantFamily extends PlantGroupFigures {
  familyId: string;
  /** Its number among its species' families. */
  number: number;
  reading: Reading;
  /** In birth order. */
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

export function groupPlantsBySpecies(rows: PlantRow[]): PlantSpeciesGroup[] {
  return groupBy(rows, (row) => row.species).map((members) => {
    const families = groupBy(members, (row) => row.familyId)
      .map((family): PlantFamily => {
        const born = [...family].sort((a, b) => a.label.unit - b.label.unit);
        return {
          familyId: family[0].familyId,
          number: family[0].label.family,
          ...figuresOf(born),
          reading: groupReading(born),
          members: born,
        };
      })
      .sort((a, b) => a.number - b.number);
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
 * How much of the floor the planting claims, never at a line it has not
 * reached: rounded down while it fits, and up once the planting has outgrown it.
 */
export function floorPlanted(state: SimulationState): string {
  const cover = floorCover(state.plants, state.tank.capacity);
  return isOvergrown(state)
    ? `floor outgrown · ${Math.ceil(cover * 100)} % claimed`
    : `floor ${sharePercent(cover)} % planted`;
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
  /** ppm past which it does harm; null where excess harms nothing. */
  ceiling: number | null;
  /** Past that ceiling. */
  excess: boolean;
  /** Coral empty or harming, amber short, green at the need — grey while it holds nothing back. */
  status: Status;
}

/**
 * Nitrate is the one plant food that is also a toxin: the engine alerts on it
 * for the fish, and charges each plant past its species' own edge — so its
 * ceiling is whichever comes first, and it is one reading wherever it shows.
 */
function ceilingPpm(state: SimulationState, key: Nutrient, config: PlantsConfig): number | null {
  if (key !== 'nitrate') return null;
  return Math.min(
    NITRATE_EDGE,
    ...state.plants.map((plant) => plantNitrateEdge(plant.species, config))
  );
}

/** ppm at which the tank's hungriest plant meets its need up to the edge where deficiency harm starts. */
function neededPpm(state: SimulationState, key: Nutrient, config: TunableConfig): number {
  const edge = config.plants.sufficiencyEdge;
  const halfSaturation = Math.max(
    0,
    ...state.plants.map((plant) => speciesHalfSaturation(plant.species, key, config.nutrients))
  );
  return (halfSaturation * edge) / (1 - edge);
}

export function nutrientReadings(
  state: SimulationState,
  config: TunableConfig
): NutrientReading[] {
  const nutrients = config.nutrients;
  const water = state.resources.water;

  const needs = Object.fromEntries(
    NUTRIENTS.map((key) => [key, neededPpm(state, key, config)])
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
  const [, bed] = tankPools(state);
  const sufficiency = (stock: Resources, species: PlantSpecies): number =>
    calculateNutrientSufficiency([{ stock, volume: water }, bed], species, nutrients);
  const isLimiting = (key: Nutrient): boolean => {
    if (needs[key] <= 0 || water <= 0) return false;
    const short: Resources = { ...met, [key]: state.resources[key] };
    return state.plants.some((plant) => sufficiency(short, plant.species) < sufficiency(met, plant.species));
  };

  return NUTRIENTS.map((key) => {
    const resource = NUTRIENT_RESOURCE[key];
    const ppm = getPpm(state.resources[key], water);
    const needed = needs[key];
    const limiting = isLimiting(key);
    const depleted = ppm <= DEPLETED_PPM;
    const ceiling = ceilingPpm(state, key, config.plants);
    const excess = ceiling !== null && ppm > ceiling;

    return {
      key,
      label: NUTRIENT_LABEL[key],
      ppm,
      text: ppm.toFixed(resource.precision),
      needed,
      neededText: needed > 0 ? needed.toFixed(resource.precision) : '—',
      fill: needed > 0 ? Math.min(1, ppm / needed) : 0,
      limiting,
      ceiling,
      excess,
      status: excess
        ? 'alert'
        : limiting
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

/** The one thing to say about the tank's nutrients: what harms the plants before what they lack. */
export function nutrientAlert(readings: NutrientReading[]): NutrientAlert | null {
  const excess = readings.find((r) => r.excess);
  if (excess) return { text: `${excess.label} high`, status: 'alert' };

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

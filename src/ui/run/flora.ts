/**
 * Flora derivations: what each plant is doing on the hour the next tick
 * settles, how the planting folds into species and families and how the reader
 * counts them, how each bloom reads off its coverage, and the tank's nutrient
 * readings, the bed's among them. Nothing here invents a band — a nutrient or
 * the bed reads short when the engine's own sufficiency would rise if it were
 * topped up, and high past a line the engine itself charges or alerts from, so
 * no surface can name a shortage or an excess the tank is not actually
 * feeling.
 */

import {
  bedPool,
  calculateNutrientSufficiency,
  canRootTab,
  floorCover,
  formShares,
  getDosePreview,
  getSubstrateNutrients,
  growthFormOf,
  isOvergrown,
  PLANT_SPECIES_DATA,
  plantFeeder,
  plantNitrateEdge,
  tankPools,
  type AlgaeKind,
  type LogEntry,
  type NutrientPool,
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
  FORMS_OF,
  mapNutrients,
  NUTRIENTS,
  type FertilizerFormula,
  type Nutrient,
  type NutrientVector,
  type PlantsConfig,
  type TunableConfig,
} from '../../simulation/config/index.js';
import { NITRATE_EDGE } from '../../simulation/livestock/tolerance.js';
import { COVERAGE_DECIMALS } from '../utils/units.js';
import type { HourAhead } from './ahead.js';
import { groupBy, mean, numbered } from './fold.js';
import { plantLightStatus } from './light.js';
import {
  bankShare,
  groupMember,
  groupReading,
  printsAsZero,
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

/** Whether there is any bloom to see: its coverage prints as more than none. */
function bloomShows(mass: number): boolean {
  return !printsAsZero(mass, COVERAGE_DECIMALS);
}

/**
 * A bloom's ladder above none, each rung a multiple of the line the tank alerts
 * over, so its word and its tone move together. Low algae is good for the
 * player, so the tones run green → coral as it climbs.
 */
const ALGAE_LADDER = [
  { upTo: 0.5, status: 'ok' },
  { upTo: 1, status: 'ok' },
  { upTo: 2, status: 'warn' },
  { upTo: Infinity, status: 'alert' },
] as const satisfies readonly { upTo: number; status: Status }[];

/** The rung a coverage that shows stands on, against the line the tank alerts over. */
function rungOf(mass: number, line: number): number {
  return ALGAE_LADDER.findIndex((step) => mass <= step.upTo * line);
}

type WordPer<T extends readonly unknown[]> = { [K in keyof T]: string };
type LadderWords = readonly [none: string, ...rungs: WordPer<typeof ALGAE_LADDER>];

/**
 * Each kind's words for its coverage, none first and then up the ladder: green
 * water reads as the water's clarity, film as how coated the glass is.
 */
const ALGAE_WORDS: Record<AlgaeKind, LadderWords> = {
  greenWater: ['clear', 'hazy', 'cloudy', 'green', 'pea soup'],
  film: ['clean', 'dusted', 'filmed', 'coated', 'smothered'],
};

/** How a bloom reads off its coverage, against the line the tank alerts over: its kind's word for none while there is none to see. */
export function algaeReading(kind: AlgaeKind, mass: number, line: number): Reading {
  const words = ALGAE_WORDS[kind];
  if (!bloomShows(mass)) return { status: 'ok', word: words[0] };
  const rung = rungOf(mass, line);
  return { status: ALGAE_LADDER[rung].status, word: words[rung + 1] };
}

/**
 * Whether the console reports a log line. The engine logs every die-back,
 * spores that starved in a dark tank among them; the console reports one only
 * where it took a bloom there was any of to see.
 */
export function isReported(log: LogEntry): boolean {
  return (
    log.event !== 'algae-died' ||
    (log.quantities ?? []).some((quantity) => quantity.kind === 'coverage' && bloomShows(quantity.percent))
  );
}

export function algaeStatus(mass: number, line: number): Status {
  return bloomShows(mass) ? ALGAE_LADDER[rungOf(mass, line)].status : 'ok';
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
    const { sick, reading } = vitalReading(plant.condition, vitality.newCondition);
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
  /** Some plant feeds on it from the water. */
  asked: boolean;
  /** ppm the hungriest plant in the tank needs beside what the forms it takes first meet; 0 when nothing is planted, or those forms meet it all. */
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

/** Whether a species feeds, at least in part, through its roots from the bed. */
export function feedsFromBed(species: PlantSpecies): boolean {
  return growthFormOf(species).rootShare > 0;
}

/** The plants that feed from the water, and the ones that feed through their roots from the bed. */
const FEEDS_FROM = {
  water: (plant: Plant): boolean => growthFormOf(plant.species).rootShare < 1,
  bed: (plant: Plant): boolean => feedsFromBed(plant.species),
};

/**
 * ppm, in one pool, at which the hungriest of these plants has its need there
 * met up to the edge where deficiency harm starts, counting what the forms it
 * takes first already meet — nitrate is asked only for what the ammonia leaves.
 * A plant feeding from both pools reaches that edge with each at its own.
 */
function neededPpm(plants: readonly Plant[], key: Nutrient, pool: NutrientPool, config: TunableConfig): number {
  const edge = config.plants.sufficiencyEdge;
  const forms = FORMS_OF[key];
  const before = forms.slice(0, forms.indexOf(key));
  return Math.max(
    0,
    ...plants.map((plant) => {
      const feeder = plantFeeder(plant.species, config.nutrients);
      const shares = formShares(pool, feeder);
      const left = before.reduce((unmet, f) => unmet * (1 - shares[f]), 1);
      const share = 1 - (1 - edge) / left;
      return share > 0 ? (feeder.halfSaturation[key] * share) / (1 - share) : 0;
    })
  );
}

/**
 * What each pool's feeders need, in ppm; both pools as the plants would read
 * them with all of it present, the reference every shortage is read against;
 * and the plants' sufficiency on any pair.
 */
export interface NutrientProbe {
  need: { water: NutrientVector; bed: NutrientVector };
  water: Resources;
  bed: NutrientVector;
  sufficiency: (water: Resources, bed: NutrientVector, species: PlantSpecies) => number;
}

export function nutrientProbe(state: SimulationState, config: TunableConfig): NutrientProbe {
  const water = state.resources.water;
  const capacity = state.tank.capacity;
  const standing = state.equipment.substrate.nutrients;
  const [inWater, inBed] = tankPools(state);
  const need = {
    water: mapNutrients((n) => neededPpm(state.plants.filter(FEEDS_FROM.water), n, inWater, config)),
    bed: mapNutrients((n) => neededPpm(state.plants.filter(FEEDS_FROM.bed), n, inBed, config)),
  };
  const met: Resources = { ...state.resources };
  if (water > 0) {
    for (const n of NUTRIENTS) met[n] = Math.max(met[n], getMassFromPpm(need.water[n], water));
  }
  return {
    need,
    water: met,
    bed: mapNutrients((n) => Math.max(standing[n], getMassFromPpm(need.bed[n], capacity))),
    sufficiency: (w, b, species) =>
      calculateNutrientSufficiency(
        [{ stock: w, volume: water }, bedPool(b, capacity)],
        species,
        config.nutrients
      ),
  };
}

export function nutrientReadings(
  state: SimulationState,
  config: TunableConfig,
  probe: NutrientProbe = nutrientProbe(state, config)
): NutrientReading[] {
  const water = state.resources.water;
  const plants = state.plants.filter(FEEDS_FROM.water);

  /**
   * Ask the engine rather than restate it: hold every other nutrient, in both
   * pools, at what the plants need and see whether leaving this one where it
   * is costs sufficiency. That keeps the panel in step with each species' own
   * demand, and stays right when several are empty at once.
   */
  const isLimiting = (key: Nutrient, needed: number): boolean => {
    if (needed <= 0 || water <= 0) return false;
    const short: Resources = { ...probe.water, [key]: state.resources[key] };
    return plants.some(
      (plant) =>
        probe.sufficiency(short, probe.bed, plant.species) <
        probe.sufficiency(probe.water, probe.bed, plant.species)
    );
  };

  return NUTRIENTS.map((key) => {
    const resource = NUTRIENT_RESOURCE[key];
    const ppm = getPpm(state.resources[key], water);
    const needed = probe.need.water[key];
    const limiting = isLimiting(key, needed);
    const depleted = ppm <= DEPLETED_PPM;
    const ceiling = ceilingPpm(state, key, config.plants);
    const excess = ceiling !== null && ppm > ceiling;

    return {
      key,
      label: NUTRIENT_LABEL[key],
      ppm,
      text: ppm.toFixed(resource.precision),
      asked: plants.length > 0,
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

/** Tabs are counted to a tenth. */
export const TAB_DECIMALS = 1;

export interface BedReading {
  /** The nutrient the reading is on: the one the bed runs shortest on against its root feeders' need, or with none the one it holds least of. */
  nutrient: Nutrient | null;
  /** Tabs' worth of that nutrient in the bed. */
  tabs: number;
  text: string;
  /** Where that reading stands once tabs cover every nutrient's need; 0 when nothing roots in it. */
  needed: number;
  neededText: string;
  /** Tabs' worth of that nutrient a fresh bag of aqua soil holds in this tank — the reading's full scale. */
  scale: number;
  /** Topping the bed up would raise the engine's sufficiency for some root feeder. */
  limiting: boolean;
  /** A bare bottom: nothing for roots, and no tab goes in. */
  bare: boolean;
  /** Whole tabs that lift the reading to that need; null while the bed holds nothing back, or tabs can't cover what it lacks. */
  advice: number | null;
  status: Status;
}

/**
 * The bed as its root feeders read it, in the tabs a keeper pushes into it —
 * short on the same probe as the water's nutrients. A tab lifts every nutrient
 * by one tab's worth, so the reading is taken on one nutrient and its need is
 * where that reading stands once the worst-covered nutrient is met: the marker
 * sits in the band exactly when every nutrient meets the need, and the advice
 * is the gap between the two — offered only where tabs can cover everything
 * the bed lacks: not over a bare bottom, and not while it lacks a nutrient
 * the tab carries none of. `on` holds the reading to a nutrient, so a state
 * and its outcome read on the same scale.
 */
export function bedReading(
  state: SimulationState,
  config: TunableConfig,
  probe: NutrientProbe = nutrientProbe(state, config),
  on?: Nutrient | null
): BedReading {
  const tab = config.nutrients.rootTab;
  const capacity = state.tank.capacity;
  const stock = state.equipment.substrate.nutrients;
  const roots = state.plants.filter(FEEDS_FROM.bed);
  const need = mapNutrients((n) => getMassFromPpm(probe.need.bed[n], capacity));
  const holdsBack = (bed: NutrientVector): boolean =>
    roots.some(
      (plant) =>
        probe.sufficiency(probe.water, bed, plant.species) <
        probe.sufficiency(probe.water, probe.bed, plant.species)
    );
  const limiting = holdsBack(stock);
  const bare = !canRootTab(state);
  const tabsCover = !bare && !holdsBack(mapNutrients((n) => (tab[n] > 0 ? probe.bed[n] : stock[n])));

  const against = roots.length > 0 ? need : tab;
  const carried = NUTRIENTS.filter((n) => tab[n] > 0);
  const nutrient =
    on ?? carried.sort((a, b) => stock[a] / against[a] - stock[b] / against[b])[0] ?? null;
  const tabsOf = (vector: NutrientVector): number => (nutrient ? vector[nutrient] / tab[nutrient] : 0);
  const tabs = tabsOf(stock);
  const short = carried.length > 0 ? Math.max(...carried.map((n) => (need[n] - stock[n]) / tab[n])) : 0;
  const needed = roots.length > 0 && nutrient ? tabs + short : 0;

  return {
    nutrient,
    tabs,
    text: tabs.toFixed(TAB_DECIMALS),
    needed,
    neededText: needed > 0 ? needed.toFixed(TAB_DECIMALS) : '—',
    scale: tabsOf(getSubstrateNutrients('aqua_soil', capacity)),
    limiting,
    bare,
    advice: limiting && tabsCover ? Math.ceil(short) : null,
    status: limiting
      ? printsAsZero(tabs, TAB_DECIMALS)
        ? 'alert'
        : 'warn'
      : needed > 0 && tabs >= needed
        ? 'ok'
        : 'neutral',
  };
}

export interface NutrientAlert {
  text: string;
  status: Status;
}

/** What the water lacks, in one phrase. */
function waterShortage(readings: NutrientReading[]): NutrientAlert | null {
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

/**
 * The one thing to say about the tank's nutrients: what harms the plants before
 * what they lack, and what the water lacks beside what the bed does.
 */
export function nutrientAlert(readings: NutrientReading[], bed: BedReading): NutrientAlert | null {
  const excess = readings.find((r) => r.excess);
  if (excess) return { text: `${excess.label} high`, status: 'alert' };

  const water = waterShortage(readings);
  const roots: NutrientAlert | null = bed.limiting
    ? { text: bed.bare ? 'no bed' : `bed ${bed.status === 'alert' ? 'empty' : 'low'}`, status: bed.status }
    : null;
  if (water === null || roots === null) return water ?? roots;
  return { text: `${water.text} · ${roots.text}`, status: worstStatus(water.status, roots.status) };
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
  return { ml: Math.max(1, Math.ceil(ml)), covers: short.map((r) => r.label) };
}

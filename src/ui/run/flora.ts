/**
 * Flora derivations: what each plant is doing on the hour the next tick
 * settles, how the planting folds into species and families and how the reader
 * counts them, how each bloom reads off its coverage, and the tank's nutrient
 * readings, the bed's among them. Nothing here invents a band — a planting is
 * fed to the degree its stores are, so a pool reads short of a nutrient where
 * a plant's store of it has fallen under the Droop edge the engine charges
 * deficiency from and the pool holds less than the stores lack, and high past
 * a line the engine itself charges or alerts from, so no surface can name a
 * shortage or an excess the tank is not actually feeling.
 */

import {
  canRootTab,
  droopLimits,
  fillAtDroop,
  floorCover,
  getDosePreview,
  getSubstrateNutrients,
  growthFormOf,
  isOvergrown,
  nutrientsIn,
  offshootShare,
  plantFeeder,
  plantParams,
  poolDraws,
  sizeOf,
  storeFill,
  storeGap,
  tankPools,
  PLANT_SPECIES_DATA,
  plantNitrateEdge,
  type AlgaeKind,
  type LogEntry,
  type Plant,
  type PlantSpecies,
  type PoolDraw,
  type SimulationState,
} from '../../simulation/index.js';
import {
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
import { BLOOM_COVERAGE_LINE, bloomLevel, PLANT_LIGHT_LINE } from '../../simulation/alerts/index.js';
import { COVERAGE_DECIMALS } from '../utils/units.js';
import type { HourAhead } from './ahead.js';
import { groupBy, mean, numbered } from './fold.js';
import { plantLightStatus } from './light.js';
import {
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
 * Where a figure's tone turns, as a multiple of the line the engine alerts
 * past. Low algae is good for the player, so the tones run green → coral as it
 * climbs.
 */
const TONE_TURNS = { warn: 1, alert: 2 } as const;

function lineStatus(multiple: number): Status {
  return multiple > TONE_TURNS.alert ? 'alert' : multiple > TONE_TURNS.warn ? 'warn' : 'ok';
}

/**
 * A bloom's words above none, each rung reaching to a multiple of the coverage
 * a bloom alerts past; the rungs past the tone's turns are its amber and coral
 * words.
 */
const ALGAE_LADDER = [0.5, TONE_TURNS.warn, TONE_TURNS.alert, Infinity] as const;

/** The rung a coverage that shows stands on. */
function rungOf(mass: number): number {
  return ALGAE_LADDER.findIndex((upTo) => mass / BLOOM_COVERAGE_LINE <= upTo);
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

/** How the share of the plants' light a bloom takes reads, %. */
export function lightTakenStatus(taken: number): Status {
  return lineStatus(taken / PLANT_LIGHT_LINE);
}

/**
 * How a bloom reads: its kind's word for its coverage — none while there is
 * none to see — in the tone of its `bloomLevel`, amber exactly where it
 * alerts. `taken` is the share of the plants' light it takes, %.
 */
export function algaeReading(kind: AlgaeKind, mass: number, taken: number): Reading {
  const words = ALGAE_WORDS[kind];
  return {
    status: lineStatus(bloomLevel(mass, taken).level),
    word: bloomShows(mass) ? words[rungOf(mass) + 1] : words[0],
  };
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
  /** The day's light at its own height over the day its species is rated to live on. */
  light: number;
  lightStatus: Status;
  /** Its offshoot buffer as a share of its next plantlet. */
  plantlet: number;
}

export function plantRows(state: SimulationState, ahead: HourAhead): PlantRow[] {
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
      size: sizeOf(plant),
      age: plant.age,
      condition: plant.condition,
      sick,
      reading,
      light: light.needShare,
      lightStatus: plantLightStatus(light, plant.species),
      plantlet: offshootShare(plant),
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

export const NUTRIENT_LABEL: Record<Nutrient, string> = {
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

/** A store as its strip reads it: its fill, 0–1, banded from where its Droop edge sits, and coral under it. */
export interface StoresFigure {
  fill: number;
  edge: number;
  status: Status;
}

/** A store's fill, full at 1 — shedding keeps the stores, so a shrunk plant's can run past it. */
export function storesFigure(fill: number, edge: number): StoresFigure {
  const held = Math.min(1, fill);
  return { fill: held, edge, status: held < edge ? 'alert' : 'ok' };
}

const NO_STORES: StoresFigure = { fill: 0, edge: 0, status: 'neutral' };

/**
 * What one pool's feeders hold in their stores, per nutrient: the store that
 * runs its feeder's Droop limit lowest, and what their stores lack of full at
 * their weight on the pool past what it holds.
 */
export interface PoolStores {
  /** Some plant feeds from the pool. */
  asked: boolean;
  /** The lowest-running store of each, quiet while nothing feeds here. */
  stores: Record<Nutrient, StoresFigure>;
  /** That store's Droop limit. */
  limit: NutrientVector;
  /** mg the feeders' stores lack of full, at their weight on the pool, past what it holds. */
  unmet: NutrientVector;
  /** Short, on the rule this file opens with. */
  short: Nutrient[];
}

export interface PlantingStores {
  water: PoolStores;
  bed: PoolStores;
}

/** A plant as the pools feed it: its draw on each, and its stores. */
interface Feeding {
  draws: readonly PoolDraw[];
  fill: NutrientVector;
  limits: NutrientVector;
  edge: NutrientVector;
  gap: NutrientVector;
}

function poolStores(feedings: readonly Feeding[], pool: number, held: NutrientVector): PoolStores {
  const feeders = feedings.filter(({ draws }) => draws[pool].weight > 0);
  const lowest = mapNutrients((n) =>
    feeders.reduce<Feeding | null>((low, feeder) => (low && low.limits[n] <= feeder.limits[n] ? low : feeder), null)
  );
  const stores = mapNutrients((n) => {
    const feeder = lowest[n];
    return feeder ? storesFigure(feeder.fill[n], feeder.edge[n]) : NO_STORES;
  });
  const unmet = mapNutrients((n) =>
    Math.max(0, feeders.reduce((sum, { draws, gap }) => sum + draws[pool].weight * gap[n], 0) - held[n])
  );
  return {
    asked: feeders.length > 0,
    stores,
    limit: mapNutrients((n) => lowest[n]?.limits[n] ?? 0),
    unmet,
    short: NUTRIENTS.filter((n) => stores[n].status === 'alert' && unmet[n] > 0),
  };
}

/** The planting's stores as each pool's feeders hold them — what every nutrient reading is read against. */
export function plantingStores(state: SimulationState, config: TunableConfig): PlantingStores {
  const pools = tankPools(state);
  const feedings = state.plants.map((plant): Feeding => {
    const p = plantParams(plant.species, config.plants);
    return {
      draws: poolDraws(pools, plantFeeder(plant.species, config.nutrients)),
      fill: storeFill(plant.budget, p),
      limits: droopLimits(plant.budget, p),
      edge: fillAtDroop(p, config.plants.droopEdge),
      gap: storeGap(plant.budget, p),
    };
  });
  return {
    water: poolStores(feedings, 0, nutrientsIn(pools[0].stock)),
    bed: poolStores(feedings, 1, nutrientsIn(pools[1].stock)),
  };
}

export interface NutrientReading {
  key: Nutrient;
  label: string;
  ppm: number;
  text: string;
  /** Some plant feeds on it from the water. */
  asked: boolean;
  /** The water feeders' lowest-running store of it. */
  stores: StoresFigure;
  /** Short, on the rule this file opens with. */
  short: boolean;
  /** The water holds none of it, in any of its forms. */
  depleted: boolean;
  /** mg the water feeders' stores lack of it past what the water holds. */
  unmet: number;
  /** ppm past which it does harm; null where excess harms nothing. */
  ceiling: number | null;
  /** Past that ceiling. */
  excess: boolean;
  /** The ppm's: coral past the ceiling, ink short of it. */
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

/** The nutrient whose store runs its Droop limit lowest — the one that rules growth. */
export function rulingNutrient(limits: Readonly<NutrientVector>): Nutrient {
  return NUTRIENTS.reduce((least, n) => (limits[n] < limits[least] ? n : least));
}

/** Whether a species feeds, at least in part, through its roots from the bed. */
export function feedsFromBed(species: PlantSpecies): boolean {
  return growthFormOf(species).rootShare > 0;
}

export function nutrientReadings(
  state: SimulationState,
  config: TunableConfig,
  stores: PlantingStores = plantingStores(state, config)
): NutrientReading[] {
  const water = state.resources.water;
  const { asked, unmet, short } = stores.water;

  return NUTRIENTS.map((key) => {
    const resource = NUTRIENT_RESOURCE[key];
    const ppm = getPpm(state.resources[key], water);
    const ceiling = ceilingPpm(state, key, config.plants);
    const excess = ceiling !== null && ppm > ceiling;

    return {
      key,
      label: NUTRIENT_LABEL[key],
      ppm,
      text: ppm.toFixed(resource.precision),
      asked,
      stores: stores.water.stores[key],
      short: short.includes(key),
      depleted: FORMS_OF[key].every((form) => getPpm(state.resources[form], water) <= DEPLETED_PPM),
      unmet: unmet[key],
      ceiling,
      excess,
      status: excess ? 'alert' : 'ok',
    };
  });
}

/** Tabs are counted to a tenth. */
export const TAB_DECIMALS = 1;

export interface BedReading {
  /** The nutrient the reading is on: of those a tab carries, the one the bed holds fewest tabs' worth of. */
  nutrient: Nutrient | null;
  /** Tabs' worth of that nutrient in the bed. */
  tabs: number;
  text: string;
  /** Tabs' worth of that nutrient a fresh bag of aqua soil holds in this tank — the reading's full scale. */
  scale: number;
  /** Some plant feeds through its roots from the bed. */
  asked: boolean;
  /** The root feeders' store that runs its Droop limit lowest, over every nutrient. */
  stores: StoresFigure;
  /** That store's nutrient. */
  ruling: Nutrient;
  /** Short of some nutrient, on the rule this file opens with. */
  short: boolean;
  /** A bare bottom: nothing for roots, and no tab goes in. */
  bare: boolean;
  /** The bed holds none of that nutrient. */
  empty: boolean;
  /** Whole tabs that put in the bed what its root feeders' stores lack past what it holds; null while it holds that, or tabs can't cover it. */
  advice: number | null;
}

/**
 * The bed as its root feeders read it, in the tabs a keeper pushes into it,
 * beside their stores as the water's nutrients are. The reading is taken on
 * the nutrient the bed holds fewest tabs' worth of, so the marker falls as
 * soon as any carried nutrient runs out; the advice is what the root feeders'
 * stores lack of full past what the bed holds, offered only where tabs can
 * cover it — not over a bare bottom, and not while it lacks a nutrient the tab
 * carries none of. `on` holds the reading to a nutrient, so a state and its
 * outcome read on the same scale.
 */
export function bedReading(
  state: SimulationState,
  config: TunableConfig,
  stores: PlantingStores = plantingStores(state, config),
  on?: Nutrient | null
): BedReading {
  const tab = config.nutrients.rootTab;
  const capacity = state.tank.capacity;
  const stock = state.equipment.substrate.nutrients;
  const { asked, limit, unmet, short } = stores.bed;
  const bare = !canRootTab(state);
  const carried = NUTRIENTS.filter((n) => tab[n] > 0);
  const nutrient = on ?? [...carried].sort((a, b) => stock[a] / tab[a] - stock[b] / tab[b])[0] ?? null;
  const tabsOf = (vector: NutrientVector): number => (nutrient ? vector[nutrient] / tab[nutrient] : 0);
  const tabs = tabsOf(stock);
  const lacking = NUTRIENTS.filter((n) => unmet[n] > 0);
  const tabsCover = !bare && lacking.every((n) => tab[n] > 0);
  const lack = Math.max(0, ...lacking.map((n) => unmet[n] / tab[n]));
  const ruling = rulingNutrient(limit);

  return {
    nutrient,
    tabs,
    text: tabs.toFixed(TAB_DECIMALS),
    scale: tabsOf(getSubstrateNutrients('aqua_soil', capacity)),
    asked,
    stores: stores.bed.stores[ruling],
    ruling,
    short: short.length > 0,
    bare,
    empty: printsAsZero(tabs, TAB_DECIMALS),
    advice: tabsCover && lack > 0 ? Math.ceil(lack) : null,
  };
}

export interface NutrientAlert {
  text: string;
  status: Status;
}

/** A water nutrient the plants go short on, or that holds nothing left to refill their stores. */
function flagged(reading: NutrientReading): boolean {
  return reading.short || (reading.asked && reading.depleted);
}

/** What the water lacks, in one phrase. */
function waterShortage(readings: NutrientReading[]): NutrientAlert | null {
  const lacking = readings.filter(flagged);
  if (lacking.length === 0) return null;

  const status: Status = lacking.some((r) => r.short) ? 'alert' : 'warn';
  const word = status === 'alert' ? 'short' : 'depleted';
  if (lacking.length === readings.length && lacking.every((r) => r.depleted)) return { text: 'nothing dosed', status };
  if (lacking.length === 1) return { text: `${lacking[0].label} ${word}`, status };
  return { text: `${lacking.length} nutrients ${word}`, status };
}

/** What the bed lacks, in one phrase: short coral, bare or empty amber. */
function bedShortage(bed: BedReading): NutrientAlert | null {
  if (!bed.asked || !(bed.short || bed.bare || bed.empty)) return null;
  const text = bed.bare ? 'no bed' : bed.empty ? 'bed empty' : 'bed short';
  return { text, status: bed.short ? 'alert' : 'warn' };
}

/**
 * The one thing to say about the tank's nutrients: what harms the plants before
 * what they lack, and what the water lacks beside what the bed does.
 */
export function nutrientAlert(readings: NutrientReading[], bed: BedReading): NutrientAlert | null {
  const excess = readings.find((r) => r.excess);
  if (excess) return { text: `${excess.label} high`, status: 'alert' };

  const water = waterShortage(readings);
  const roots = bedShortage(bed);
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
  /** Whole ml of fertiliser that puts in the water what the plants' stores lack of every nutrient it carries past what the water holds. */
  ml: number;
  /** Labels of the nutrients it covers, so the advice names its own scope. */
  covers: string[];
}

export function doseToCover(
  readings: NutrientReading[],
  state: SimulationState,
  config: TunableConfig
): DoseAdvice | null {
  const formula = config.nutrients.fertilizerFormula;
  const lacking = readings.filter((r) => r.unmet > 0 && formula[r.key] > 0);
  if (lacking.length === 0 || state.resources.water <= 0) return null;

  const ml = Math.max(...lacking.map((r) => r.unmet / formula[r.key]));
  return { ml: Math.ceil(ml), covers: lacking.map((r) => r.label) };
}

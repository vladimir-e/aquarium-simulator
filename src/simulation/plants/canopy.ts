/**
 * The canopy — how much plant there is, where it stands, and the light at its
 * own height.
 *
 * A unit spreads its leaves evenly from the floor to its height over its own
 * footprint. The light it reads is the substrate PAR scaled by
 *
 *   leaf  s_i = f · exp( k·z_i + ½·k_L·LAI_i·(1 − u_i) − Σ_{j≠i} c_j·τ_j(z_i) ),  z_i = h_i / 2
 *   top   χ_i = f · exp( k·h_i − Σ_{j≠i} c_j·τ_j(h_i) )
 *
 *   τ_j(z) = 1 − exp(−k_L·LAI_j·u_j·max(0, 1 − z/h_j))
 *   c_j    = F_j / A
 *
 * with u the size as a share of a full unit; k the water's extinction as it
 * stands and k_L the leaves'; f the share of a leaf's light the film coating it
 * passes; LAI, F a form's leaf area index and footprint; A the floor area; h
 * the plant's height. Water above a leaf is a gain over the substrate. A unit's
 * own crown is written against a full unit's, so a lone grown plant reads the
 * care-sheet light at its leaf and a sparse one is less self-shaded; the crown
 * top has none of its own leaves above it. Other crowns fall at random over the
 * floor, so each takes at most its floor share, and a crown no taller than a
 * leaf never shades it.
 */

import type { Blooms, Plant, Resources, SimulationState } from '../state.js';
import { calculateFloorArea, calculateTankHeight } from '../state.js';
import type { OpticsConfig } from '../config/optics.js';
import { calculateParAtDepth, dailyLightIntegral } from '../equipment/light.js';
import { growthFormOf, plantTraits, type PlantSpecies } from './species.js';
import { dailyLightEdge } from '../systems/flora.js';
import type { AlgaeKind } from '../algae/traits.js';
import { mapKinds } from '../algae/blooms.js';
import { bloomPass, lightLoss, waterExtinction, type LightLoss } from '../algae/light-loss.js';

type Unit = Pick<Plant, 'species' | 'size'>;

/**
 * cm² of leaf a rate unit is: the unit photosynthesis, respiration, plant power
 * and plant waste are all rated in. 30 mg of CO₂ an hour over 0.05 m² is about
 * 3.8 µmol/m²/s, inside the 1–10 µmol/m²/s that saturated submerged leaves fix.
 */
export const LEAF_AREA_PER_RATE_UNIT = 500;

export function plantHeight(plant: Unit, waterDepth: number): number {
  const form = growthFormOf(plant.species);
  return Math.min(waterDepth, form.heightCm * (plant.size / 100) ** form.heightExponent);
}

/** One-sided leaf area, cm². */
export function leafArea(plant: Unit): number {
  const form = growthFormOf(plant.species);
  return form.leafAreaIndex * form.footprintCm2 * (plant.size / 100);
}

export function rateUnits(plant: Unit): number {
  return leafArea(plant) / LEAF_AREA_PER_RATE_UNIT;
}

/**
 * The share of the lamp's light each taker lets through to a plant's mean leaf;
 * their product is the leaf's share of the lamp.
 */
export interface LightPath {
  water: number;
  /** Past 1 where its own crown, sparser than a full unit's, shades its leaf less than the care sheet assumes. */
  canopy: number;
  blooms: Record<AlgaeKind, number>;
}

/** Light at a plant's height over the PAR at the substrate. */
export interface CanopyLight {
  /** At its mean leaf: what it earns and starves on. */
  leaf: number;
  /** At the top of its crown: what burns it. */
  top: number;
  path: LightPath;
}

/** Share of the floor one unit of the species claims: its footprint over the floor area. */
export function floorShare(species: PlantSpecies, capacity: number): number {
  return growthFormOf(species).footprintCm2 / calculateFloorArea(capacity);
}

interface Crown {
  height: number;
  leafAreaIndex: number;
  floorShare: number;
}

function crownOf(plant: Unit, waterDepth: number, capacity: number): Crown {
  return {
    height: plantHeight(plant, waterDepth),
    leafAreaIndex: growthFormOf(plant.species).leafAreaIndex * (plant.size / 100),
    floorShare: floorShare(plant.species, capacity),
  };
}

/** Share of the floor's light a crown takes at height `z`: c·τ(z). */
function shadeAt(crown: Crown, z: number, leafAttenuation: number): number {
  if (crown.height <= z) return 0;
  return crown.floorShare * (1 - Math.exp(-leafAttenuation * crown.leafAreaIndex * (1 - z / crown.height)));
}

function overLeaf(plant: Unit, depth: number, optics: OpticsConfig, loss: LightLoss): Pick<LightPath, 'water' | 'blooms'> {
  const below = depth - plantHeight(plant, depth) / 2;
  return {
    water: Math.exp(-optics.waterAttenuationPerCm * below),
    blooms: mapKinds((kind) => bloomPass(loss.blooms[kind], below)),
  };
}

/**
 * Per plant, in `plants` order, through the water and the blooms as they
 * stand. A lone unit above a few % of a unit reads more light at its leaf the
 * smaller it is. Below that a rosette or clump loses water gain faster than it
 * gains self-shade relief, and in a shorter canopy the neighbours' shade takes
 * the relief back.
 */
export function canopyLight(
  plants: readonly Unit[],
  capacity: number,
  optics: OpticsConfig,
  blooms: Blooms
): CanopyLight[] {
  const depth = calculateTankHeight(capacity);
  const k = optics.leafAttenuationPerLai;
  const loss = lightLoss(blooms, optics);
  const { extinction, leafPass } = loss;
  const crowns = plants.map((plant) => crownOf(plant, depth, capacity));

  return plants.map((plant, i) => {
    const own = crowns[i];
    const meanLeaf = own.height / 2;
    let aboveLeaf = 0;
    let aboveTop = 0;
    for (let j = 0; j < crowns.length; j++) {
      if (j === i) continue;
      aboveLeaf += shadeAt(crowns[j], meanLeaf, k);
      aboveTop += shadeAt(crowns[j], own.height, k);
    }
    const selfShadeRelief = 0.5 * k * growthFormOf(plant.species).leafAreaIndex * (1 - plant.size / 100);
    return {
      leaf: leafPass * Math.exp(extinction * meanLeaf + selfShadeRelief - aboveLeaf),
      top: leafPass * Math.exp(extinction * own.height - aboveTop),
      path: { ...overLeaf(plant, depth, optics, loss), canopy: Math.exp(selfShadeRelief - aboveLeaf) },
    };
  });
}

/** The light one plant stands in, at its own height. */
export interface PlantLight {
  /** PAR at its mean leaf, µmol/m²/s. */
  par: number;
  /** PAR at the top of its crown, what the light-high stressor reads. */
  crownPar: number;
  /** The day's light at its mean leaf, mol/m²/d. */
  dailyLight: number;
  /** That day's light over the daily light the species starves under. */
  needShare: number;
  /** The day's light at the substrate that leaves its leaf on the species edge. */
  substrateEdge: number;
  heightCm: number;
  path: LightPath;
}

/** A plant's light at its place in the canopy, on the tank's light as it stands. */
export function lightAtHeight(
  plant: Unit,
  canopy: CanopyLight,
  resources: Pick<Resources, 'light' | 'lightByHour'>,
  waterDepth: number
): PlantLight {
  const dailyLight = dailyLightIntegral(resources.lightByHour) * canopy.leaf;
  const edge = dailyLightEdge(plantTraits(plant.species));
  return {
    par: resources.light * canopy.leaf,
    crownPar: resources.light * canopy.top,
    dailyLight,
    needShare: dailyLight / edge,
    substrateEdge: edge / canopy.leaf,
    heightCm: plantHeight(plant, waterDepth),
    path: canopy.path,
  };
}

/** Floor the planting claims, cm²: every unit's footprint, grown or not. */
export function plantedFootprint(plants: readonly Pick<Plant, 'species'>[]): number {
  return plants.reduce((sum, plant) => sum + growthFormOf(plant.species).footprintCm2, 0);
}

/** Footprint planted over floor area. Past 1 the planting has outgrown its floor. */
export function floorCover(plants: readonly Pick<Plant, 'species'>[], capacity: number): number {
  return plantedFootprint(plants) / calculateFloorArea(capacity);
}

/** Share of the substrate light the canopy takes before it reaches the floor. */
export function floorShade(plants: readonly Unit[], capacity: number, optics: OpticsConfig): number {
  const depth = calculateTankHeight(capacity);
  const taken = plants.reduce(
    (sum, plant) => sum + shadeAt(crownOf(plant, depth, capacity), 0, optics.leafAttenuationPerLai),
    0
  );
  return 1 - Math.exp(-taken);
}

/**
 * PAR that reaches the floor while the lamp is on: its rating through the
 * water as it stands, less the canopy's floor shade.
 */
export function floorLight(
  state: Pick<SimulationState, 'plants' | 'tank' | 'equipment' | 'algae'>,
  optics: OpticsConfig
): number {
  const { light } = state.equipment;
  const depth = calculateTankHeight(state.tank.capacity);
  const landed = calculateParAtDepth(light.enabled ? light.par : 0, depth, waterExtinction(state.algae, optics));
  return landed * (1 - floorShade(state.plants, state.tank.capacity, optics));
}

/**
 * The share of the planting's light each kind of bloom takes: what it takes at
 * each plant's mean leaf, weighted by the plant's leaf area. With nothing
 * planted it takes none.
 */
export function plantLightTaken(
  state: Pick<SimulationState, 'plants' | 'tank' | 'algae'>,
  optics: OpticsConfig
): Record<AlgaeKind, number> {
  const depth = calculateTankHeight(state.tank.capacity);
  const loss = lightLoss(state.algae, optics);
  const passed = state.plants.map((plant) => overLeaf(plant, depth, optics, loss).blooms);
  const leaf = state.plants.reduce((sum, plant) => sum + leafArea(plant), 0);
  return mapKinds((kind) =>
    leaf > 0 ? state.plants.reduce((sum, plant, i) => sum + leafArea(plant) * (1 - passed[i][kind]), 0) / leaf : 0
  );
}

export function isOvergrown(state: Pick<SimulationState, 'plants' | 'tank'>): boolean {
  return floorCover(state.plants, state.tank.capacity) > 1;
}

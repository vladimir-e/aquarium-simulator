import type { Resources, SimulationState } from '../state.js';
import { calculateFloorArea, calculateTankGlassSurface, calculateTankHeight } from '../core/geometry.js';
import type { OpticsConfig } from '../config/optics.js';
import type { ActionType } from '../actions/types.js';
import { calculateHardscapeTotalSurface } from '../equipment/hardscape.js';
import { dailyLightIntegral } from '../equipment/light.js';
import { floorShade } from '../plants/canopy.js';
import { dailyLightEdge } from '../systems/flora.js';
import type { AlgaeHabitat, AlgaeTraits } from './traits.js';
import { waterExtinction } from './light-loss.js';

/** What a habitat is read off: the tank's geometry, its hardscape, the canopy over its floor and the water over both. */
export type HabitatTank = Pick<SimulationState, 'tank' | 'equipment' | 'plants' | 'algae'>;

/**
 * The mean PAR over a water column of this depth and extinction, as a multiple
 * of the PAR at its floor: Beer–Lambert averaged from the surface down,
 * `(e^{kD} − 1) / kD`.
 */
export function columnGain(depthCm: number, extinction: number): number {
  const attenuation = extinction * depthCm;
  return attenuation > 0 ? Math.expm1(attenuation) / attenuation : 1;
}

export type HabitatPlace = 'column' | 'walls' | 'floor' | 'hardscape';

/**
 * The pieces each habitat is made of, by place. The column is the tank's
 * litres. The surfaces are the lit ones that do not grow: the glass walls, the
 * floor and the hardscape on it.
 */
const HABITATS: Record<AlgaeHabitat, (tank: HabitatTank) => Partial<Record<HabitatPlace, number>>> = {
  column: ({ tank }) => ({ column: tank.capacity }),
  surfaces: ({ tank, equipment }) => {
    const floor = calculateFloorArea(tank.capacity);
    return {
      walls: calculateTankGlassSurface(tank.capacity) - floor,
      floor,
      hardscape: calculateHardscapeTotalSurface(equipment.hardscape.items),
    };
  },
};

export type BloomRemoval = Extract<ActionType, 'waterChange' | 'scrubAlgae'>;

/** The keeper's action that takes a bloom out of its habitat. */
export const REMOVED_BY: Readonly<Record<AlgaeHabitat, BloomRemoval>> = {
  column: 'waterChange',
  surfaces: 'scrubAlgae',
};

const PLACE_NAMES: Readonly<Record<HabitatPlace, string>> = {
  column: 'the water column',
  walls: 'the glass',
  floor: 'the floor',
  hardscape: 'the hardscape',
};

/** Places in the keeper's words, as a list: "the glass, the floor and the hardscape". */
export function namePlaces(places: readonly HabitatPlace[]): string {
  const names = places.map((place) => PLACE_NAMES[place]);
  const last = names.pop() ?? '';
  return names.length > 0 ? `${names.join(', ')} and ${last}` : last;
}

function pieces(habitat: AlgaeHabitat, tank: HabitatTank): [HabitatPlace, number][] {
  return Object.entries(HABITATS[habitat](tank)) as [HabitatPlace, number][];
}

/** The places that hold some of a habitat in this tank. */
export function habitatPlaces(habitat: AlgaeHabitat, tank: HabitatTank): HabitatPlace[] {
  return pieces(habitat, tank)
    .filter(([, size]) => size > 0)
    .map(([place]) => place);
}

/** The places that hold some of a habitat once `cleared` is laid bare. */
export function placesKept(habitat: AlgaeHabitat, cleared: HabitatPlace, tank: HabitatTank): HabitatPlace[] {
  return habitatPlaces(habitat, tank).filter((place) => place !== cleared);
}

/** Litres of column, or cm² of surface. */
export function habitatSize(habitat: AlgaeHabitat, tank: HabitatTank): number {
  return pieces(habitat, tank).reduce((sum, [, size]) => sum + size, 0);
}

/** The share of a habitat that lies at this place, 0–1: none where the habitat has no piece there. */
export function placeShare(habitat: AlgaeHabitat, place: HabitatPlace, tank: HabitatTank): number {
  const size = habitatSize(habitat, tank);
  return size > 0 ? (HABITATS[habitat](tank)[place] ?? 0) / size : 0;
}

/**
 * The mean PAR over a habitat as a multiple of the PAR at the substrate, each
 * piece weighted by its size: the column's mean through the column and on the
 * walls that span it, what the canopy leaves on the floor and the hardscape.
 * The column's mean is read through the water as it stands, so a bloom in it
 * shades itself and the walls.
 */
export function habitatGain(habitat: AlgaeHabitat, tank: HabitatTank, optics: OpticsConfig): number {
  const column = columnGain(calculateTankHeight(tank.tank.capacity), waterExtinction(tank.algae, optics));
  const underCanopy = 1 - floorShade(tank.plants, tank.tank.capacity, optics);
  const gain: Record<HabitatPlace, number> = {
    column,
    walls: column,
    floor: underCanopy,
    hardscape: underCanopy,
  };
  const size = habitatSize(habitat, tank);
  return size > 0 ? pieces(habitat, tank).reduce((sum, [place, piece]) => sum + piece * gain[place], 0) / size : 0;
}

/** The light a bloom lives in: the mean over its habitat. */
export interface BloomLight {
  /** µmol/m²/s. */
  par: number;
  /** mol/m²/d. */
  dailyLight: number;
  /** That day's light over the daily light the bloom starves under. */
  needShare: number;
}

export function bloomLight(
  resources: Pick<Resources, 'light' | 'lightByHour'>,
  gain: number,
  traits: AlgaeTraits
): BloomLight {
  const dailyLight = dailyLightIntegral(resources.lightByHour) * gain;
  return {
    par: resources.light * gain,
    dailyLight,
    needShare: dailyLight / dailyLightEdge(traits),
  };
}

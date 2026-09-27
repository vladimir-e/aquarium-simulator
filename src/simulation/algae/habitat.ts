import type { Resources, SimulationState } from '../state.js';
import { calculateFloorArea, calculateTankGlassSurface, calculateTankHeight } from '../state.js';
import type { OpticsConfig } from '../config/optics.js';
import { calculateHardscapeTotalSurface } from '../equipment/hardscape.js';
import { dailyLightIntegral } from '../equipment/light.js';
import { floorShade } from '../plants/canopy.js';
import { dailyLightEdge } from '../systems/flora.js';
import type { AlgaeHabitat, AlgaeTraits } from './traits.js';

/** What a habitat is read off: the tank's geometry, its hardscape and the canopy over its floor. */
export type HabitatTank = Pick<SimulationState, 'tank' | 'equipment' | 'plants'>;

/**
 * The mean PAR over a water column of this depth, as a multiple of the PAR at
 * its floor: Beer–Lambert averaged from the surface down, `(e^{kD} − 1) / kD`.
 */
export function columnGain(depthCm: number, optics: OpticsConfig): number {
  const attenuation = optics.waterAttenuationPerCm * depthCm;
  return attenuation > 0 ? Math.expm1(attenuation) / attenuation : 1;
}

/** Where a piece of habitat lies: the water column, the glass walls, or the bed — the floor and the hardscape on it. */
export type HabitatPlace = 'column' | 'walls' | 'bed';

/**
 * The pieces each habitat is made of, by place. The column is the tank's
 * litres. The surfaces are the lit ones that do not grow: the glass walls and
 * the bed.
 */
const HABITATS: Record<AlgaeHabitat, (tank: HabitatTank) => Partial<Record<HabitatPlace, number>>> = {
  column: ({ tank }) => ({ column: tank.capacity }),
  surfaces: ({ tank, equipment }) => {
    const floor = calculateFloorArea(tank.capacity);
    return {
      walls: calculateTankGlassSurface(tank.capacity) - floor,
      bed: floor + calculateHardscapeTotalSurface(equipment.hardscape.items),
    };
  },
};

function pieces(habitat: AlgaeHabitat, tank: HabitatTank): [HabitatPlace, number][] {
  return Object.entries(HABITATS[habitat](tank)) as [HabitatPlace, number][];
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
 * walls that span it, what the canopy leaves on the bed.
 */
export function habitatGain(habitat: AlgaeHabitat, tank: HabitatTank, optics: OpticsConfig): number {
  const column = columnGain(calculateTankHeight(tank.tank.capacity), optics);
  const gain: Record<HabitatPlace, number> = {
    column,
    walls: column,
    bed: 1 - floorShade(tank.plants, tank.tank.capacity, optics),
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

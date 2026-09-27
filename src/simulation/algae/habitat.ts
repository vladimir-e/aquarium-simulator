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

/** Where a stretch of habitat sits in the light: spanning the column, or on the floor under the canopy. */
type Exposure = 'column' | 'floor';

/** One stretch of a habitat: how much of it there is, and where it sits in the light. */
interface Stretch {
  size: number;
  exposure: Exposure;
}

/**
 * The stretches each habitat is made of. The column is the tank's litres. The
 * surfaces are the lit ones that do not grow: the glass walls, which span the
 * column, and the floor and hardscape under the canopy.
 */
const HABITATS: Record<AlgaeHabitat, (tank: HabitatTank) => Stretch[]> = {
  column: ({ tank }) => [{ size: tank.capacity, exposure: 'column' }],
  surfaces: ({ tank, equipment }) => {
    const floor = calculateFloorArea(tank.capacity);
    return [
      { size: calculateTankGlassSurface(tank.capacity) - floor, exposure: 'column' },
      { size: floor + calculateHardscapeTotalSurface(equipment.hardscape.items), exposure: 'floor' },
    ];
  },
};

/** Litres of column, or cm² of surface. */
export function habitatSize(habitat: AlgaeHabitat, tank: HabitatTank): number {
  return HABITATS[habitat](tank).reduce((sum, stretch) => sum + stretch.size, 0);
}

/**
 * The mean PAR over a habitat as a multiple of the PAR at the substrate, each
 * stretch weighted by its size: the column's mean where it spans the column,
 * what the canopy leaves where it lies on the floor.
 */
export function habitatGain(habitat: AlgaeHabitat, tank: HabitatTank, optics: OpticsConfig): number {
  const gain: Record<Exposure, number> = {
    column: columnGain(calculateTankHeight(tank.tank.capacity), optics),
    floor: 1 - floorShade(tank.plants, tank.tank.capacity, optics),
  };
  const stretches = HABITATS[habitat](tank);
  const size = stretches.reduce((sum, stretch) => sum + stretch.size, 0);
  return size > 0 ? stretches.reduce((sum, stretch) => sum + stretch.size * gain[stretch.exposure], 0) / size : 0;
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

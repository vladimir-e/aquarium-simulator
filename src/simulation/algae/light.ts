import type { Resources } from '../state.js';
import type { OpticsConfig } from '../config/optics.js';
import { dailyLightIntegral } from '../equipment/light.js';
import { dailyLightEdge } from '../systems/flora.js';
import type { AlgaeTraits } from './traits.js';

/** The light a bloom lives in: the mean over the water column. */
export interface BloomLight {
  /** µmol/m²/s. */
  par: number;
  /** mol/m²/d. */
  dailyLight: number;
  /** That day's light over the daily light the bloom starves under. */
  needShare: number;
}

/**
 * The mean PAR over a water column of this depth, as a multiple of the PAR at
 * its floor: Beer–Lambert averaged from the surface down, `(e^{kD} − 1) / kD`.
 */
export function columnGain(depthCm: number, optics: OpticsConfig): number {
  const attenuation = optics.waterAttenuationPerCm * depthCm;
  return attenuation > 0 ? Math.expm1(attenuation) / attenuation : 1;
}

export function bloomLight(
  resources: Pick<Resources, 'light' | 'lightByHour'>,
  depthCm: number,
  optics: OpticsConfig,
  traits: AlgaeTraits
): BloomLight {
  const gain = columnGain(depthCm, optics);
  const dailyLight = dailyLightIntegral(resources.lightByHour) * gain;
  return {
    par: resources.light * gain,
    dailyLight,
    needShare: dailyLight / dailyLightEdge(traits),
  };
}

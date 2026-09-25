import { describe, it, expect } from 'vitest';
import { getSaturationIrradiance, PLANT_SPECIES_DATA, type PlantSpecies } from './species.js';
import { plantsDefaults } from '../config/plants.js';

describe('getSaturationIrradiance', () => {
  it('orders the roster the way the bands do', () => {
    const species = Object.keys(PLANT_SPECIES_DATA) as PlantSpecies[];
    for (const one of species) {
      for (const other of species) {
        const closer =
          PLANT_SPECIES_DATA[one].tolerableLight[0] < PLANT_SPECIES_DATA[other].tolerableLight[0];
        if (closer) {
          expect(getSaturationIrradiance(one, plantsDefaults)).toBeLessThan(
            getSaturationIrradiance(other, plantsDefaults)
          );
        }
      }
    }
  });

  it('scales with the tuned factor', () => {
    const at = (saturationIrradianceFactor: number): number =>
      getSaturationIrradiance('java_fern', { ...plantsDefaults, saturationIrradianceFactor });

    expect(at(3)).toBeCloseTo(2 * at(1.5), 10);
  });
});

import { describe, it, expect } from 'vitest';
import { getSaturationIrradiance, PLANT_SPECIES_DATA, type PlantSpecies } from './species.js';
import { plantsDefaults } from '../config/plants.js';

describe('getSaturationIrradiance', () => {
  it('reads the roster the published macrophyte ranges expect', () => {
    // Shade species saturate at 10–30 µmol/m²/s and sun species at 50–150; all
    // five land inside, which is the evidence the band carries this by itself.
    expect(getSaturationIrradiance('anubias', plantsDefaults)).toBe(16);
    expect(getSaturationIrradiance('java_fern', plantsDefaults)).toBe(20);
    expect(getSaturationIrradiance('amazon_sword', plantsDefaults)).toBe(40);
    expect(getSaturationIrradiance('dwarf_hairgrass', plantsDefaults)).toBe(50);
    expect(getSaturationIrradiance('monte_carlo', plantsDefaults)).toBe(60);
  });

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
    const config = { ...plantsDefaults, saturationIrradianceFactor: 3 };

    expect(getSaturationIrradiance('java_fern', config)).toBe(30);
  });
});

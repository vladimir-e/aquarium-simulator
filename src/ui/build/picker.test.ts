import { describe, it, expect } from 'vitest';
import {
  createSimulation,
  FISH_SPECIES_DATA,
  getMaxFishMass,
  getMaxPlants,
  type Fish,
  type PlantSpecies,
  type SimulationState,
} from '../../simulation/index.js';
import { pickerOptions, type PickerOption } from './picker';
import { bioload } from './stocking';

function makeFish(overrides: Partial<Fish> & { id: string }): Fish {
  return {
    species: 'neon_tetra',
    mass: 0.5,
    health: 100,
    age: 0,
    satiation: 90,
    sex: 'male',
    stage: 'adult',
    hardinessOffset: 0,
    surplus: 0,
    ...overrides,
  };
}

function tank(capacity = 200): SimulationState {
  return createSimulation({ tankCapacity: capacity });
}

function planted(count: number, species: PlantSpecies, state = tank(19)): SimulationState {
  return {
    ...state,
    plants: Array.from({ length: count }, (_, i) => ({
      id: `plant_${i}`,
      species,
      size: 50,
      condition: 100,
      surplus: 0,
    })) as SimulationState['plants'],
  };
}

function option(options: PickerOption[], species: string): PickerOption {
  return options.find((candidate) => candidate.species === species)!;
}

function fish(state: SimulationState, count = 1): PickerOption[] {
  return pickerOptions('fish', state, count, 'metric');
}

function plants(state: SimulationState): PickerOption[] {
  return pickerOptions('plant', state, 1, 'metric');
}

describe('fish options', () => {
  it('counts headroom in whole fish of the species, off the physical ceiling', () => {
    const state = tank(1); // 500 g of fish, physically
    const neon = option(fish(state), 'neon_tetra');

    expect(getMaxFishMass(1)).toBe(500);
    expect(neon.headroom).toBe(500 / FISH_SPECIES_DATA.neon_tetra.adultMass);
  });

  it('refuses in the action’s own words once nothing more fits', () => {
    const state: SimulationState = {
      ...tank(1),
      fish: [makeFish({ id: 'whale', mass: 499.8 })],
    };
    const neon = option(fish(state), 'neon_tetra');

    expect(neon.headroom).toBe(0);
    expect(neon.refusal).toBe('Tank at fish capacity (~500g of fish max)');
  });

  it('says nothing while one more fits, and leaves the shortfall to the count', () => {
    const state: SimulationState = {
      ...tank(1),
      fish: [makeFish({ id: 'whale', mass: 499 })],
    };
    const neon = option(fish(state, 5), 'neon_tetra');

    // Two fit, five were asked for — the drawer's "Only 2 fit", not a refusal.
    expect(neon.headroom).toBe(2);
    expect(neon.refusal).toBeNull();
  });

  it('reads a species out of its band against the tank’s own temperature', () => {
    const state = tank();
    const cold: SimulationState = {
      ...state,
      resources: { ...state.resources, temperature: 21 },
    };
    const angel = option(fish(cold), 'angelfish'); // wants 24–30 °C

    expect(angel.fit).toBe('wants 24–30°C — tank holds 21.0°C');
    expect(angel.status).toBe('warn');
  });

  it('reads the fit through the same bioload the module’s row reads', () => {
    const state: SimulationState = {
      ...tank(150),
      fish: Array.from({ length: 20 }, (_, i) => makeFish({ id: `c${i}`, species: 'corydoras' })),
    };
    const cory = option(fish(state, 3), 'corydoras');
    const after = bioload(state.fish, 150, { species: 'corydoras', count: 3 });

    expect(cory.fit).toContain(`bioload ${after.ratio.toFixed(1)}× after`);
    expect(after.status).toBe('alert');
    expect(cory.status).toBe('alert');
  });

  it('stays quiet where the stocking leaves room to spare', () => {
    const neon = option(fish(tank(150), 1), 'neon_tetra');

    expect(neon.status).toBe('neutral');
    expect(neon.fit).toContain('bioload 0.0× after');
  });
});

describe('plant options', () => {
  it('reads the free slots against the tank’s ceiling', () => {
    const anubias = option(plants(planted(1, 'java_fern')), 'anubias');

    expect(anubias.headroom).toBe(getMaxPlants(19) - 1);
    expect(anubias.fit).toBe(`${getMaxPlants(19) - 1} of ${getMaxPlants(19)} slots free`);
  });

  it('refuses in the action’s own words once every slot is taken', () => {
    const anubias = option(plants(planted(getMaxPlants(19), 'java_fern')), 'anubias');

    expect(anubias.headroom).toBe(0);
    expect(anubias.refusal).toBe(`Tank at plant capacity (${getMaxPlants(19)} plants max)`);
  });

  it('names the substrate before the slots — a full tank is the lesser problem', () => {
    // Bare bottom and every slot taken: the plant could not go in either way.
    const state = planted(getMaxPlants(19), 'java_fern');
    const carpet = option(plants(state), 'monte_carlo');

    expect(state.equipment.substrate.type).toBe('none');
    expect(carpet.refusal).toContain('aqua soil');
  });
});

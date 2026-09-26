import { describe, it, expect } from 'vitest';
import {
  createSimulation,
  FISH_SPECIES_DATA,
  getMaxFishMass,
  calculateFloorArea,
  checkPlantFootprint,
  GROWTH_FORMS,
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
    const state = tank(1);
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

    expect(neon.headroom).toBe(2);
    expect(neon.refusal).toBeNull();
  });

  it('reads a species out of its band against the tank’s own temperature', () => {
    const state = tank();
    const cold: SimulationState = {
      ...state,
      resources: { ...state.resources, temperature: 21 },
    };
    const angel = option(fish(cold), 'angelfish');

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
  const clump = GROWTH_FORMS.attached.footprintCm2;
  const floorFull = Math.floor(calculateFloorArea(19) / clump);

  it('reads the floor left, and how many more units it takes', () => {
    const anubias = option(plants(planted(1, 'java_fern')), 'anubias');
    const free = calculateFloorArea(19) - clump;

    expect(anubias.headroom).toBe(Math.floor(free / clump));
    expect(anubias.fit).toBe(`${Math.floor(free)} cm² of floor free`);
  });

  it('agrees with the engine’s floor check on the line and the headroom, to the last unit', () => {
    const soil = (capacity: number): SimulationState => {
      const state = tank(capacity);
      state.equipment.substrate.type = 'aqua_soil';
      return state;
    };
    const carpet = GROWTH_FORMS.carpet.footprintCm2;
    const edge = Math.floor(calculateFloorArea(362) / carpet);
    expect(Math.round(calculateFloorArea(362) - edge * carpet)).toBe(carpet);

    const tanks = [
      planted(edge, 'monte_carlo', soil(362)),
      planted(1, 'java_fern', soil(19)),
      planted(floorFull, 'java_fern', soil(19)),
      planted(3, 'amazon_sword', soil(200)),
      planted(40, 'monte_carlo', soil(200)),
    ];
    for (const state of tanks) {
      for (const candidate of plants(state)) {
        const species = candidate.species as PlantSpecies;
        const check = checkPlantFootprint(state.plants, species, state.tank.capacity);
        let fits = 0;
        const grown = [...state.plants];
        while (checkPlantFootprint(grown, species, state.tank.capacity).ok) {
          grown.push({ ...grown[0], species });
          fits++;
        }

        expect(candidate.headroom).toBe(fits);
        expect(Number(/^\d+/.exec(candidate.fit)![0]) >= check.needed).toBe(check.ok);
        expect(candidate.refusal).toBe(check.ok ? null : check.message);
      }
    }
  });

  it('refuses in the action’s own words once the floor is taken', () => {
    const state = planted(floorFull, 'java_fern');
    const anubias = option(plants(state), 'anubias');

    expect(anubias.headroom).toBe(0);
    expect(anubias.refusal).toBe(checkPlantFootprint(state.plants, 'anubias', 19).message);
  });

  it('names the substrate before the floor — a full tank is the lesser problem', () => {
    const state = planted(floorFull, 'java_fern');
    const carpet = option(plants(state), 'monte_carlo');

    expect(state.equipment.substrate.type).toBe('none');
    expect(carpet.refusal).toContain('aqua soil');
  });
});

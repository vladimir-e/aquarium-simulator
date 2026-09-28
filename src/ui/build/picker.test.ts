import { describe, it, expect } from 'vitest';
import {
  applyAction,
  createSimulation,
  DEFAULT_CONFIG,
  FISH_SPECIES_DATA,
  getMaxFishMass,
  calculateFloorArea,
  checkPlantFootprint,
  GROWTH_FORMS,
  STOCKED_FISH_SIZE,
  type Fish,
  type PlantSpecies,
  type SimulationState,
} from '../../simulation/index.js';
import { getGhMass } from '../../simulation/resources/index.js';
import { pickerOptions, type PickerOption } from './picker';
import { bioload } from './stocking';
import { bedReading, type BedReading } from '../run';

function makeFish(overrides: Partial<Fish> & { id: string }): Fish {
  return {
    species: 'neon_tetra',
    mass: 0.5,
    health: 100,
    age: 0,
    gut: 0,
    sex: 'male',
    hardinessOffset: 0,
    surplus: 0,
    ovary: 0,
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

function fish(state: SimulationState, count = 1, size = STOCKED_FISH_SIZE): PickerOption[] {
  return pickerOptions('fish', state, 'metric', bedReading(state, DEFAULT_CONFIG), { count, size });
}

function plants(state: SimulationState, bed: BedReading = bedReading(state, DEFAULT_CONFIG)): PickerOption[] {
  return pickerOptions('plant', state, 'metric', bed);
}

describe('fish options', () => {
  it('counts headroom in whole fish of the species, off the physical ceiling', () => {
    const state = tank(1);
    const neon = option(fish(state), 'neon_tetra');

    expect(getMaxFishMass(1)).toBe(500);
    expect(neon.headroom).toBe(500 / FISH_SPECIES_DATA.neon_tetra.adultMass);
  });

  it('counts headroom at the stocked size, so more small fish fit than adults', () => {
    const state = tank(1);
    const adults = option(fish(state), 'neon_tetra').headroom;
    const small = option(fish(state, 1, 25), 'neon_tetra').headroom;

    expect(small).toBe(Math.floor(500 / (0.25 * FISH_SPECIES_DATA.neon_tetra.adultMass)));
    expect(small).toBeGreaterThan(adults);
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

  it('reads every band the engine stresses a fish past, and names the widest miss', () => {
    const state = tank();
    const soft: SimulationState = {
      ...state,
      resources: { ...state.resources, gh: getGhMass(2.6, state.resources.water) },
    };
    const guppy = option(fish(soft), 'guppy');

    expect(guppy.fit).toBe(`wants GH ${FISH_SPECIES_DATA.guppy.ghRange.join('–')} — tank holds 2.6`);
    expect(guppy.status).toBe('warn');
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
    const carpet = GROWTH_FORMS.carpet.footprintCm2;
    const brim = Array.from({ length: 2000 }, (_, i) => i + 20).find(
      (capacity) => calculateFloorArea(capacity) % carpet >= carpet - 0.5
    )!;
    const edge = Math.floor(calculateFloorArea(brim) / carpet);

    const tanks = [
      planted(edge, 'monte_carlo', tank(brim)),
      planted(1, 'java_fern', tank(19)),
      planted(floorFull, 'java_fern', tank(19)),
      planted(3, 'amazon_sword', tank(200)),
      planted(40, 'monte_carlo', tank(200)),
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
        if (!check.ok) {
          expect(Number(/(\d+) cm² free/.exec(check.message)![1])).toBeLessThan(check.needed);
        }
      }
    }
  });

  it('tells a root feeder over an empty bed that its roots need tabs, without refusing it', () => {
    const gravel = tank(200);
    gravel.equipment.substrate.type = 'gravel';
    const empty = plants(gravel, bedReading(gravel, DEFAULT_CONFIG));
    const tabbed = applyAction(gravel, { type: 'rootTab', count: 2 }).state;

    expect(option(empty, 'amazon_sword')).toMatchObject({ note: 'Its roots need tabs — the bed is empty.', refusal: null });
    expect(option(empty, 'java_fern').note).toBeNull();
    expect(option(plants(tabbed, bedReading(tabbed, DEFAULT_CONFIG)), 'amazon_sword').note).toBeNull();
  });

  it('tells a root feeder over a bare bottom that its roots have no bed', () => {
    const bare = tank(200);
    expect(bedReading(bare, DEFAULT_CONFIG).bare).toBe(true);
    expect(option(plants(bare), 'amazon_sword')).toMatchObject({ note: 'Its roots have no bed to feed from.', refusal: null });
    expect(option(plants(bare), 'java_fern').note).toBeNull();
  });

  it('refuses in the action’s own words once the floor is taken', () => {
    const state = planted(floorFull, 'java_fern');
    const anubias = option(plants(state), 'anubias');

    expect(anubias.headroom).toBe(0);
    expect(anubias.refusal).toBe(checkPlantFootprint(state.plants, 'anubias', 19).message);
  });

  it('offers every species over a bare bottom — the bed decides how a plant feeds, not whether it goes in', () => {
    const state = tank(200);
    expect(state.equipment.substrate.type).toBe('none');
    for (const candidate of plants(state)) expect(candidate.refusal).toBeNull();
  });
});

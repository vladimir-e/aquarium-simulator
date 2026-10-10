import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { bloomMass, columnGain, habitatPlaces, habitatSize, massOf, namePlaces, placeShare, type HabitatPlace } from './habitat.js';
import { ALGAE, ALGAE_KINDS, clearPlace, coverageAt, EMPTY_BLOOM, habitatGain, waterExtinction } from './index.js';
import { createSimulation } from '../state.js';
import { calculateFloorArea, calculateTankGlassSurface, calculateTankHeight } from '../core/geometry.js';
import { opticsDefaults } from '../config/optics.js';
import { floorShade } from '../plants/canopy.js';
import { createHardscapeItem, HARDSCAPE_SURFACE } from '../equipment/hardscape.js';
import { liftHardscape, placeHardscape } from '../equipment/index.js';
import { plantRecord } from '../tests/plant.js';
import { bloomAt, kindTissue } from '../tests/blooms.js';

const tank = createSimulation({ tankCapacity: 100 });
const planted = produce(tank, (draft) => {
  draft.plants = [
    plantRecord({ id: 'a', species: 'amazon_sword', size: 100 }),
    plantRecord({ id: 'b', species: 'java_fern', size: 100 }),
  ];
});
const rocked = placeHardscape(tank, createHardscapeItem('rock', 'neutral_rock'));
const K_W = opticsDefaults.waterAttenuationPerCm;

describe('columnGain', () => {
  it('is the mean of Beer–Lambert over the column, over the PAR at its floor', () => {
    const depth = 40;
    const k = opticsDefaults.waterAttenuationPerCm;
    const steps = 10_000;
    let sum = 0;
    for (let i = 0; i < steps; i++) sum += Math.exp(k * (depth - ((i + 0.5) / steps) * depth));
    expect(columnGain(depth, k)).toBeCloseTo(sum / steps, 6);
    expect(columnGain(depth, k)).toBeGreaterThan(1);
    expect(columnGain(depth, 0)).toBe(1);
  });
});

describe('the column', () => {
  it('is the tank’s litres, lit at the column’s mean whatever stands in it', () => {
    expect(habitatSize('column', tank)).toBe(100);
    for (const state of [tank, planted, rocked]) {
      expect(habitatGain('column', state, opticsDefaults)).toBe(columnGain(calculateTankHeight(100), K_W));
    }
  });
});

describe('under green water', () => {
  const green = (mass: number): typeof tank =>
    produce(tank, (draft) => void (draft.algae.greenWater = bloomAt(draft, 'greenWater', mass)));
  const depth = calculateTankHeight(100);
  const ofLamp = (state: typeof tank, habitat: 'column' | 'surfaces'): number =>
    habitatGain(habitat, state, opticsDefaults) * Math.exp(-waterExtinction(state, opticsDefaults) * depth);

  it('reads the column’s mean through the water as it stands', () => {
    expect(habitatGain('column', green(40), opticsDefaults)).toBe(
      columnGain(depth, waterExtinction(green(40), opticsDefaults))
    );
  });

  it('dims its own column and every surface under it the thicker it grows', () => {
    for (const habitat of ['column', 'surfaces'] as const) {
      expect(ofLamp(green(30), habitat)).toBeLessThan(ofLamp(green(0), habitat));
      expect(ofLamp(green(90), habitat)).toBeLessThan(ofLamp(green(30), habitat));
    }
  });
});

describe('the surfaces', () => {
  it('are the glass and the hardscape, and do not move when plants grow', () => {
    expect(habitatSize('surfaces', tank)).toBe(calculateTankGlassSurface(100));
    expect(habitatSize('surfaces', planted)).toBe(habitatSize('surfaces', tank));
    expect(habitatSize('surfaces', rocked)).toBe(calculateTankGlassSurface(100) + HARDSCAPE_SURFACE.neutral_rock);
  });

  it('weigh the walls at the column’s mean and the floor and hardscape at what the canopy leaves', () => {
    const glass = calculateTankGlassSurface(100);
    const floor = calculateFloorArea(100);
    const column = columnGain(calculateTankHeight(100), K_W);
    const underCanopy = 1 - floorShade(planted.plants, 100, opticsDefaults);

    expect(habitatGain('surfaces', tank, opticsDefaults)).toBeCloseTo(((glass - floor) * column + floor) / glass, 12);
    expect(habitatGain('surfaces', planted, opticsDefaults)).toBeCloseTo(
      ((glass - floor) * column + floor * underCanopy) / glass,
      12
    );
    expect(habitatGain('surfaces', planted, opticsDefaults)).toBeLessThan(habitatGain('surfaces', tank, opticsDefaults));
  });
});

const PLACES: readonly HabitatPlace[] = ['column', 'walls', 'floor', 'hardscape'];
const HABITATS = ['column', 'surfaces'] as const;

describe('placeShare', () => {
  it('shares every habitat out whole among its places, and gives none where it has no piece', () => {
    for (const habitat of HABITATS) {
      for (const state of [tank, planted, rocked]) {
        expect(PLACES.reduce((sum, place) => sum + placeShare(habitat, place, state), 0)).toBeCloseTo(1, 12);
        for (const place of PLACES) {
          expect(placeShare(habitat, place, state) > 0).toBe(habitatPlaces(habitat, state).includes(place));
        }
      }
    }
    expect(placeShare('column', 'walls', tank)).toBe(0);
    expect(placeShare('surfaces', 'column', tank)).toBe(0);
    expect(placeShare('surfaces', 'hardscape', tank)).toBe(0);
  });

  it('gives the walls and the floor less of the surfaces as hardscape joins them', () => {
    expect(placeShare('surfaces', 'walls', rocked)).toBeLessThan(placeShare('surfaces', 'walls', tank));
    expect(placeShare('surfaces', 'floor', rocked)).toBeLessThan(placeShare('surfaces', 'floor', tank));
    expect(placeShare('surfaces', 'hardscape', rocked)).toBeCloseTo(
      HARDSCAPE_SURFACE.neutral_rock / habitatSize('surfaces', rocked),
      12
    );
  });
});

describe('namePlaces', () => {
  it('lists the places in the keeper\'s words, the last joined by "and"', () => {
    expect(namePlaces(['floor'])).toBe('the floor');
    expect(namePlaces(['floor', 'hardscape'])).toBe('the floor and the hardscape');
    expect(namePlaces(['walls', 'floor', 'hardscape'])).toBe('the glass, the floor and the hardscape');
  });
});

describe('the kinds', () => {
  it('open empty and healthy in a new tank', () => {
    for (const kind of ALGAE_KINDS) expect(tank.algae[kind]).toEqual(EMPTY_BLOOM);
  });
});

describe('a habitat that changes size', () => {
  const coated = produce(tank, (draft) => {
    for (const kind of ALGAE_KINDS) draft.algae[kind] = bloomAt(draft, kind, 40);
  });

  it('reads a bloom’s mass as its structure over what the full habitat holds', () => {
    for (const kind of ALGAE_KINDS) {
      const { habitat } = ALGAE[kind];
      expect(bloomMass(coated, kind)).toBeCloseTo(massOf(kindTissue(coated, kind), habitatSize(habitat, coated), ALGAE[kind]), 12);
      expect(bloomMass(coated, kind)).toBeCloseTo(40, 12);
    }
  });

  it('moves the coverage and keeps the tissue when bare surface comes in', () => {
    const placed = placeHardscape(coated, createHardscapeItem('rock', 'neutral_rock'));
    for (const kind of ALGAE_KINDS) {
      const { habitat } = ALGAE[kind];
      const grown = habitatSize(habitat, placed) / habitatSize(habitat, coated);
      expect(kindTissue(placed, kind)).toBeCloseTo(kindTissue(coated, kind), 12);
      expect(bloomMass(placed, kind)).toBeCloseTo(40 / grown, 12);
    }
    expect(placed.algae).toEqual(coated.algae);
  });

  it('takes the film on a lifted piece out with it, the coverage left as it was', () => {
    const withRock = produce(placeHardscape(tank, createHardscapeItem('rock', 'neutral_rock')), (draft) => {
      for (const kind of ALGAE_KINDS) draft.algae[kind] = bloomAt(draft, kind, 40);
    });
    const lifted = liftHardscape(withRock, 'rock');
    for (const kind of ALGAE_KINDS) expect(bloomMass(lifted, kind)).toBeCloseTo(40, 12);
    expect(kindTissue(lifted, 'film')).toBeLessThan(kindTissue(withRock, 'film'));
    expect(lifted.algae.greenWater).toEqual(withRock.algae.greenWater);
  });
});

describe('coverageAt', () => {
  it('is each kind’s mass times the share of its habitat at the place', () => {
    const blooms = produce(rocked, (draft) => {
      for (const kind of ALGAE_KINDS) draft.algae[kind] = bloomAt(draft, kind, 60);
    });
    for (const place of PLACES) {
      const at = coverageAt(blooms, place);
      for (const kind of ALGAE_KINDS) expect(at[kind]).toBeCloseTo(60 * placeShare(ALGAE[kind].habitat, place, rocked), 12);
    }
  });
});

describe('clearPlace', () => {
  const coated = produce(rocked, (draft) => {
    for (const kind of ALGAE_KINDS) draft.algae[kind] = bloomAt(draft, kind, 60, 70);
  });

  it('takes out the tissue at the place and keeps the rest, the population’s condition and densities with it', () => {
    for (const place of PLACES) {
      const cleared = { ...coated, algae: clearPlace(coated, place) };
      for (const kind of ALGAE_KINDS) {
        const share = placeShare(ALGAE[kind].habitat, place, coated);
        const { budget } = coated.algae[kind];
        expect(kindTissue(cleared, kind)).toBeCloseTo(kindTissue(coated, kind) * (1 - share), 12);
        expect(cleared.algae[kind].condition).toBe(70);
        expect(cleared.algae[kind].budget.reserve).toBeCloseTo(budget.reserve * (1 - share), 12);
      }
    }
  });

  it('takes a part of a place, in proportion', () => {
    const half = { ...coated, algae: clearPlace(coated, 'column', 0.5) };
    expect(kindTissue(half, 'greenWater')).toBeCloseTo(kindTissue(coated, 'greenWater') / 2, 12);
  });
});

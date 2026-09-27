import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { columnGain, habitatGain, habitatPlaces, habitatSize, namePlaces, placeShare, type HabitatPlace } from './habitat.js';
import { ALGAE, ALGAE_KINDS, clearPlace, coverageAt, emptyBlooms, resettle, waterExtinction } from './index.js';
import { calculateFloorArea, calculateTankGlassSurface, calculateTankHeight, createSimulation } from '../state.js';
import { opticsDefaults } from '../config/optics.js';
import { floorShade } from '../plants/canopy.js';
import { createHardscapeItem, HARDSCAPE_SURFACE } from '../equipment/hardscape.js';
import { liftHardscape, placeHardscape } from '../equipment/index.js';
import { plantRecord } from '../tests/plant.js';
import { kindTissue } from '../tests/blooms.js';

const tank = createSimulation({ tankCapacity: 100 });
const planted = produce(tank, (draft) => {
  draft.plants = [
    plantRecord({ id: 'a', species: 'amazon_sword', size: 100, condition: 100, surplus: 0 }),
    plantRecord({ id: 'b', species: 'java_fern', size: 100, condition: 100, surplus: 0 }),
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
  const green = (mass: number): typeof tank => produce(tank, (draft) => void (draft.algae.greenWater.mass = mass));
  const depth = calculateTankHeight(100);
  const ofLamp = (state: typeof tank, habitat: 'column' | 'surfaces'): number =>
    habitatGain(habitat, state, opticsDefaults) * Math.exp(-waterExtinction(state.algae, opticsDefaults) * depth);

  it('reads the column’s mean through the water as it stands', () => {
    expect(habitatGain('column', green(40), opticsDefaults)).toBe(
      columnGain(depth, waterExtinction(green(40).algae, opticsDefaults))
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
    for (const kind of ALGAE_KINDS) expect(tank.algae[kind]).toEqual({ mass: 0, condition: 100, surplus: 0 });
  });
});

describe('resettle', () => {
  const coated = produce(tank, (draft) => {
    for (const kind of ALGAE_KINDS) draft.algae[kind].mass = 40;
  });

  it('keeps a bloom’s tissue when bare surface comes in: the coverage thins by the share of habitat it gained', () => {
    const placed = placeHardscape(coated, createHardscapeItem('rock', 'neutral_rock'));
    for (const kind of ALGAE_KINDS) {
      const { habitat } = ALGAE[kind];
      const grown = habitatSize(habitat, placed) / habitatSize(habitat, coated);
      expect(kindTissue(placed, kind)).toBeCloseTo(kindTissue(coated, kind), 12);
      expect(placed.algae[kind].mass).toBeCloseTo(40 / grown, 12);
    }
    expect(placed.algae).not.toEqual(coated.algae);
  });

  it('leaves the coverage as it was when habitat goes out, taking its share of the tissue with it', () => {
    const withRock = placeHardscape(coated, createHardscapeItem('rock', 'neutral_rock'));
    const lifted = liftHardscape(withRock, 'rock');
    expect(lifted.algae).toEqual(withRock.algae);
    expect(resettle(withRock.algae, withRock, lifted)).toEqual(withRock.algae);
  });
});

describe('coverageAt', () => {
  it('is each kind’s mass times the share of its habitat at the place', () => {
    const blooms = produce(emptyBlooms(), (draft) => {
      for (const kind of ALGAE_KINDS) draft[kind].mass = 60;
    });
    for (const place of PLACES) {
      const at = coverageAt(blooms, place, rocked);
      for (const kind of ALGAE_KINDS) expect(at[kind]).toBeCloseTo(60 * placeShare(ALGAE[kind].habitat, place, rocked), 12);
    }
  });
});

describe('clearPlace', () => {
  const coated = produce(rocked, (draft) => {
    for (const kind of ALGAE_KINDS) draft.algae[kind] = { mass: 60, condition: 70, surplus: 4 };
  });

  it('takes out the tissue at the place and keeps the rest, the population’s condition and bank with it', () => {
    for (const place of PLACES) {
      const cleared = { ...coated, algae: clearPlace(coated.algae, place, coated) };
      for (const kind of ALGAE_KINDS) {
        const share = placeShare(ALGAE[kind].habitat, place, coated);
        expect(kindTissue(cleared, kind)).toBeCloseTo(kindTissue(coated, kind) * (1 - share), 12);
        expect(cleared.algae[kind]).toMatchObject({ condition: 70, surplus: 4 });
      }
    }
  });
});

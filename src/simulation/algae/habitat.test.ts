import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { columnGain, habitatGain, habitatSize, placeShare } from './habitat.js';
import { ALGAE, ALGAE_KINDS, combinedCoverage, emptyBlooms, kindsIn, resettle } from './index.js';
import { calculateFloorArea, calculateTankGlassSurface, calculateTankHeight, createSimulation } from '../state.js';
import { opticsDefaults } from '../config/optics.js';
import { floorShade } from '../plants/canopy.js';
import { createHardscapeItem, HARDSCAPE_SURFACE } from '../equipment/hardscape.js';
import { liftHardscape, placeHardscape } from '../equipment/index.js';
import { plantRecord } from '../tests/plant.js';

const tank = createSimulation({ tankCapacity: 100 });
const planted = produce(tank, (draft) => {
  draft.plants = [
    plantRecord({ id: 'a', species: 'amazon_sword', size: 100, condition: 100, surplus: 0 }),
    plantRecord({ id: 'b', species: 'java_fern', size: 100, condition: 100, surplus: 0 }),
  ];
});
const rocked = placeHardscape(tank, createHardscapeItem('rock', 'neutral_rock'));

describe('columnGain', () => {
  it('is the mean of Beer–Lambert over the column, over the PAR at its floor', () => {
    const depth = 40;
    const k = opticsDefaults.waterAttenuationPerCm;
    const steps = 10_000;
    let sum = 0;
    for (let i = 0; i < steps; i++) sum += Math.exp(k * (depth - ((i + 0.5) / steps) * depth));
    expect(columnGain(depth, opticsDefaults)).toBeCloseTo(sum / steps, 6);
    expect(columnGain(depth, opticsDefaults)).toBeGreaterThan(1);
    expect(columnGain(depth, { ...opticsDefaults, waterAttenuationPerCm: 0 })).toBe(1);
  });
});

describe('the column', () => {
  it('is the tank’s litres, lit at the column’s mean whatever stands in it', () => {
    expect(habitatSize('column', tank)).toBe(100);
    for (const state of [tank, planted, rocked]) {
      expect(habitatGain('column', state, opticsDefaults)).toBe(columnGain(calculateTankHeight(100), opticsDefaults));
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
    const column = columnGain(calculateTankHeight(100), opticsDefaults);
    const underCanopy = 1 - floorShade(planted.plants, 100, opticsDefaults);

    expect(habitatGain('surfaces', tank, opticsDefaults)).toBeCloseTo(((glass - floor) * column + floor) / glass, 12);
    expect(habitatGain('surfaces', planted, opticsDefaults)).toBeCloseTo(
      ((glass - floor) * column + floor * underCanopy) / glass,
      12
    );
    expect(habitatGain('surfaces', planted, opticsDefaults)).toBeLessThan(habitatGain('surfaces', tank, opticsDefaults));
  });
});

describe('placeShare', () => {
  it('shares every habitat out whole among its places, and gives none where it has no piece', () => {
    const places = ['column', 'walls', 'bed'] as const;
    for (const habitat of ['column', 'surfaces'] as const) {
      for (const state of [tank, planted, rocked]) {
        expect(places.reduce((sum, place) => sum + placeShare(habitat, place, state), 0)).toBeCloseTo(1, 12);
      }
    }
    expect(placeShare('column', 'walls', tank)).toBe(0);
    expect(placeShare('surfaces', 'column', tank)).toBe(0);
  });

  it('gives the walls less of the surfaces as hardscape joins the bed', () => {
    expect(placeShare('surfaces', 'walls', rocked)).toBeLessThan(placeShare('surfaces', 'walls', tank));
  });
});

describe('the kinds', () => {
  it('each live in one habitat, and every habitat’s kinds are the kinds', () => {
    expect([...kindsIn('column'), ...kindsIn('surfaces')].sort()).toEqual([...ALGAE_KINDS].sort());
    for (const kind of kindsIn('column')) expect(ALGAE[kind].habitat).toBe('column');
  });

  it('open empty and healthy in a new tank', () => {
    for (const kind of ALGAE_KINDS) expect(tank.algae[kind]).toEqual({ mass: 0, condition: 100, surplus: 0 });
  });
});

describe('combinedCoverage', () => {
  const blooms = (masses: Record<string, number>): ReturnType<typeof emptyBlooms> =>
    produce(emptyBlooms(), (draft) => {
      for (const kind of ALGAE_KINDS) draft[kind].mass = masses[kind] ?? 0;
    });

  it('is one kind’s coverage alone, and none on an empty tank', () => {
    expect(combinedCoverage(emptyBlooms())).toBe(0);
    for (const kind of ALGAE_KINDS) expect(combinedCoverage(blooms({ [kind]: 40 }))).toBeCloseTo(40, 12);
  });

  it('lets the light through each kind in turn, so it never passes 100', () => {
    const all = blooms(Object.fromEntries(ALGAE_KINDS.map((kind) => [kind, 50])));
    expect(combinedCoverage(all)).toBeCloseTo(100 * (1 - 0.5 ** ALGAE_KINDS.length), 12);
    expect(combinedCoverage(blooms(Object.fromEntries(ALGAE_KINDS.map((kind) => [kind, 100]))))).toBe(100);
  });
});

describe('resettle', () => {
  const coated = produce(tank, (draft) => {
    for (const kind of ALGAE_KINDS) draft.algae[kind].mass = 40;
  });

  it('keeps a bloom’s tissue when bare surface comes in: the coverage thins by the share of habitat it gained', () => {
    const placed = placeHardscape(coated, createHardscapeItem('rock', 'neutral_rock'));
    for (const kind of kindsIn('surfaces')) {
      const tissue = (state: typeof coated): number => state.algae[kind].mass * habitatSize('surfaces', state);
      expect(tissue(placed)).toBeCloseTo(tissue(coated), 9);
      expect(placed.algae[kind].mass).toBeLessThan(40);
    }
    for (const kind of kindsIn('column')) expect(placed.algae[kind]).toEqual(coated.algae[kind]);
  });

  it('leaves the coverage as it was when habitat goes out, taking its share of the tissue with it', () => {
    const withRock = placeHardscape(coated, createHardscapeItem('rock', 'neutral_rock'));
    const lifted = liftHardscape(withRock, 'rock');
    expect(lifted.algae).toEqual(withRock.algae);
    expect(resettle(withRock.algae, withRock, lifted)).toEqual(withRock.algae);
  });
});

import { describe, it, expect } from 'vitest';
import { loadFish, loadRate, stepLoad, waterToxins } from './toxicokinetics.js';
import { freeAmmoniaPpm } from './nitrogen-cycle.js';
import { structuralLength } from './deb.js';
import { livestockDefaults as config, TOXINS, ZERO_TOXINS, mapToxins, type ToxinVector } from '../config/livestock.js';
import { createSimulation } from '../state.js';
import { getMassFromPpm, getPpm } from '../resources/index.js';
import { speciesTau } from '../livestock/species.js';
import { fishRecord } from '../tests/fish.js';

const clean = createSimulation({ tankCapacity: 100 }).resources;
const tank = {
  ...clean,
  ammonia: getMassFromPpm(2, clean.water),
  nitrite: getMassFromPpm(5, clean.water),
  nitrate: getMassFromPpm(60, clean.water),
};

describe('waterToxins', () => {
  it('reads free NH3, nitrite and nitrate off the water in ppm', () => {
    expect(waterToxins(tank)).toEqual({
      ammonia: freeAmmoniaPpm(tank),
      nitrite: getPpm(tank.nitrite, tank.water),
      nitrate: getPpm(tank.nitrate, tank.water),
    });
  });
});

describe('stepLoad', () => {
  const rates = [0.01, 0.3, 1, 5, 50, Infinity];

  it.each(rates)('moves a load toward the level at rate %s and never past it, from either side', (rate) => {
    for (const [load, level] of [
      [0, 1.7],
      [1.7, 0],
      [0.3, 0.9],
      [0.9, 0.3],
    ]) {
      const next = stepLoad(load, level, rate);
      expect(Math.abs(level - next)).toBeLessThan(Math.abs(level - load));
      expect(Math.sign(level - next) * Math.sign(level - load)).not.toBe(-1);
    }
  });

  it('holds a load already at its level', () => {
    expect(stepLoad(0.4, 0.4, 0.3)).toBe(0.4);
  });

  it('closes half the gap to a held level at ln 2 / k, stepped hour by hour', () => {
    const hours = 7;
    const rate = Math.LN2 / hours;
    let load = 0;
    for (let h = 0; h < hours; h++) load = stepLoad(load, 2, rate);
    expect(load).toBeCloseTo(1, 12);
  });
});

describe('loadRate', () => {
  it('runs at the toxin’s rate at 1 cm and τ 1, with τ, over the structural length', () => {
    expect(loadRate(0.3, 1, 1)).toBe(0.3);
    expect(loadRate(0.3, 2, 1)).toBeCloseTo(2 * loadRate(0.3, 1, 1), 15);
    expect(loadRate(0.3, 1, 2)).toBeCloseTo(loadRate(0.3, 1, 1) / 2, 15);
  });
});

describe('loadFish', () => {
  const levels = waterToxins(tank);
  const hourIn = (fish = fishRecord(), tau = 1): ToxinVector => loadFish(fish, levels, tau, config.loadRate).load;

  it('steps every load at its own toxin’s rate, at the fish’s length and pace', () => {
    const fish = fishRecord({ load: mapToxins((t) => 3 * levels[t]) });
    const length = structuralLength(fish.budget);
    const tau = speciesTau(fish.species, 26);
    expect(loadFish(fish, levels, tau, config.loadRate).load).toEqual(
      mapToxins((t) => stepLoad(fish.load[t], levels[t], loadRate(config.loadRate[t], tau, length)))
    );
  });

  it('leaves the rest of the fish as it was', () => {
    const fish = fishRecord();
    expect({ ...loadFish(fish, levels, 1, config.loadRate), load: fish.load }).toEqual(fish);
  });

  it('loads a shorter fish faster than a longer one', () => {
    const [fry, adult] = [hourIn(fishRecord({ size: 20 })), hourIn(fishRecord({ size: 80 }))];
    for (const t of TOXINS) expect(fry[t]).toBeGreaterThan(adult[t]);
  });

  it('loads a warmer fish faster than a colder one', () => {
    const fish = fishRecord();
    const [warm, cold] = [hourIn(fish, speciesTau(fish.species, 28)), hourIn(fish, speciesTau(fish.species, 20))];
    for (const t of TOXINS) expect(warm[t]).toBeGreaterThan(cold[t]);
  });

  it('loads nothing from clean water into an unloaded fish', () => {
    expect(loadFish(fishRecord(), waterToxins(clean), 1, config.loadRate).load).toEqual(ZERO_TOXINS);
  });
});

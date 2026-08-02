/**
 * Anchors for what circulation does to a stocked tank.
 *
 * These pin outcome, not mechanism: whether a tank someone actually set up
 * damages its fish over weeks. `fish-health.test.ts` pins the stressor itself.
 *
 * The preset comes from `src/ui/presets.ts` rather than being restated here —
 * the headline anchor is about the tank that ships, and a copy of it in this
 * file would drift away from the one players load.
 */

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import {
  createSimulation,
  FISH_SPECIES_DATA,
  type FishSpecies,
  type SimulationState,
} from '../state.js';
import { FILTER_SPECS, type FilterType } from '../equipment/filter.js';
import { getPresetById } from '../../ui/presets.js';
import { DAY, flowReading, run, stock, watchFlow } from './tanks.js';

const VOLUMES = [20, 40, 75, 150, 300, 568];

/** The filter class each species would sanely be kept on. */
const SANE_PAIRING: ReadonlyArray<{ filter: FilterType; species: FishSpecies }> = [
  { filter: 'sponge', species: 'betta' },
  { filter: 'hob', species: 'angelfish' },
  { filter: 'canister', species: 'neon_tetra' },
  { filter: 'sump', species: 'guppy' },
];

/**
 * Evaporation is not what these anchors are about, and the shipped presets
 * carry no lid and no ATO — so a reading meant to isolate circulation starts
 * from the water level the tank is supposed to hold.
 */
const atFullWater = (state: SimulationState): SimulationState =>
  produce(state, (draft) => {
    draft.resources.water = draft.tank.capacity;
  });

describe('flow tolerance', () => {
  it('charges the same damage at every volume, for the same filter class', () => {
    const stress = VOLUMES.filter((litres) => litres <= FILTER_SPECS.sump.maxCapacityLiters).map(
      (litres) => flowReading('neon_tetra', litres, { filter: 'sump' }).stress
    );

    expect(stress.every((s) => s > 0)).toBe(true);
    expect(new Set(stress).size).toBe(1);
  });

  it('never damages the species a filter class is for, at any volume it is rated to', () => {
    for (const { filter, species } of SANE_PAIRING) {
      for (const litres of VOLUMES) {
        const { turnover, stress, net } = flowReading(species, litres, { filter });

        expect(turnover).toBeLessThanOrEqual(FISH_SPECIES_DATA[species].maxTurnover);
        expect(stress).toBe(0);
        expect(net).toBeGreaterThan(0);
      }
    }
  });

  it('reads one powerhead as a washing machine in a nano and a current in a big tank', () => {
    const nano = flowReading('neon_tetra', 20, { powerhead: 240 });
    const big = flowReading('neon_tetra', 300, { powerhead: 240 });

    expect(nano.lph).toBe(big.lph);
    expect(nano.turnover).toBeGreaterThan(40);
    expect(nano.net).toBeLessThan(0);

    expect(big.turnover).toBeLessThan(FISH_SPECIES_DATA.neon_tetra.maxTurnover);
    expect(big.stress).toBe(0);
    expect(big.net).toBeGreaterThan(0);
  });

  it('kills a nano roster with the powerhead the same roster survives in a big tank', () => {
    const stocked = (litres: number): SimulationState =>
      stock(
        atFullWater(
          run(
            createSimulation({
              tankCapacity: litres,
              substrate: { type: 'aqua_soil' },
              filter: { enabled: true, type: 'sponge' },
              powerhead: { enabled: true, flowRateGPH: 240 },
              heater: { targetTemperature: 25, wattage: Math.max(100, litres) },
            }),
            30 * DAY
          )
        ),
        'neon_tetra',
        6,
        { sex: 'male' }
      );

    const routine = { feed: 0.25, waterChange: 0.25, topOff: true };
    const nano = watchFlow(stocked(20), 60, routine);
    const big = watchFlow(stocked(300), 60, routine);

    expect(nano.survivors).toBe(0);
    expect(nano.firstDeathDay).toBeLessThan(2);

    expect(big.peakStress).toBe(0);
    expect(big.survivors).toBe(6);
    expect(big.minHealth).toBeGreaterThan(90);
  });

  it('runs the shipped community preset for 90 days without flow costing a tetra anything', () => {
    const preset = getPresetById('community');
    if (preset === undefined) throw new Error('the community preset is gone');

    const cycled = atFullWater(run(createSimulation(preset.config), 30 * DAY));
    const stocked = stock(cycled, 'neon_tetra', 12, { sex: 'male' });

    expect(flowReading('neon_tetra', preset.config.tankCapacity, { filter: 'canister' }).stress).toBe(
      0
    );

    const watched = watchFlow(stocked, 90, { feed: 0.25, waterChange: 0.25, topOff: true });

    expect(watched.survivors).toBe(12);
    expect(watched.firstDeathDay).toBeNull();
    expect(watched.minHealth).toBeGreaterThan(90);
    // The preset ships lidless with no ATO, so the tank sits a little under
    // capacity between top-offs and the turnover creeps over the tetra's 8.
    // What that is worth has to stay a rounding error against the ~1 %/h the
    // fish recovers at.
    expect(watched.peakStress).toBeLessThan(0.05);
  });
});

/**
 * Anchors for what circulation does to a stocked tank.
 *
 * These pin outcome, not mechanism: whether a tank someone actually set up
 * damages its fish over weeks. `fish-health.test.ts` pins the stressor itself.
 *
 * The tanks come from `src/ui/presets.ts` rather than being restated here — the
 * setups that ship are the ones that have to survive, and a copy of them in
 * this file would drift away from the ones players load.
 */

import { describe, it, expect } from 'vitest';
import {
  createSimulation,
  FISH_SPECIES_DATA,
  type FishSpecies,
  type SimulationState,
} from '../state.js';
import { FILTER_SPECS, type FilterType } from '../equipment/filter.js';
import { applyAction } from '../actions/index.js';
import { PRESETS, type PresetId } from '../../ui/presets.js';
import { DAY, flowReading, run, stock, watchFlow } from './tanks.js';

const VOLUMES = [20, 40, 75, 150, 300, 568];

/** The filter class each species would sanely be kept on. */
const SANE_PAIRING: ReadonlyArray<{ filter: FilterType; species: FishSpecies }> = [
  { filter: 'sponge', species: 'betta' },
  { filter: 'hob', species: 'angelfish' },
  { filter: 'canister', species: 'neon_tetra' },
  { filter: 'sump', species: 'guppy' },
];

/** What a keeper would put in each tank the game ships. */
const PRESET_STOCK: Record<PresetId, { species: FishSpecies; count: number }> = {
  bare: { species: 'guppy', count: 4 },
  betta: { species: 'betta', count: 1 },
  planted: { species: 'neon_tetra', count: 6 },
  community: { species: 'neon_tetra', count: 12 },
  angelfish: { species: 'angelfish', count: 4 },
};

const KEEPER_ROUTINE = { feed: 0.25, waterChange: 0.25, topOff: true };

const topOff = (state: SimulationState): SimulationState =>
  applyAction(state, { type: 'topOff' }).state;

/** A preset's own tank, cycled on its bed and stocked with what it is for. */
function shipped(id: PresetId): SimulationState {
  const preset = PRESETS.find((p) => p.id === id);
  if (preset === undefined) throw new Error(`the ${id} preset is gone`);

  const { species, count } = PRESET_STOCK[id];
  return stock(topOff(run(createSimulation(preset.config), 30 * DAY)), species, count, {
    sex: 'male',
  });
}

describe('flow tolerance', () => {
  it('charges the same damage at every volume, for a species kept above its class', () => {
    const stress = VOLUMES.map((litres) => flowReading('betta', litres, { filter: 'sump' }).stress);

    expect(stress.every((s) => s > 0)).toBe(true);
    expect(new Set(stress).size).toBe(1);
  });

  it('never damages the species a filter class is for, at any volume it is rated to', () => {
    for (const { filter, species } of SANE_PAIRING) {
      const rated = VOLUMES.filter((litres) => litres <= FILTER_SPECS[filter].maxCapacityLiters);
      expect(rated.length).toBeGreaterThan(0);

      for (const litres of rated) {
        const { turnover, stress } = flowReading(species, litres, { filter });

        expect(turnover).toBeLessThan(FISH_SPECIES_DATA[species].maxTurnover);
        expect(stress).toBe(0);
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
  });

  it('kills a nano roster with the powerhead the same roster survives in a big tank', () => {
    const stocked = (litres: number): SimulationState =>
      stock(
        topOff(
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

    const nano = watchFlow(stocked(20), 60, KEEPER_ROUTINE);
    const big = watchFlow(stocked(300), 60, KEEPER_ROUTINE);

    expect(nano.survivors).toBe(0);
    expect(nano.firstDeathDay).toBeLessThan(2);

    expect(big.peakStress).toBe(0);
    expect(big.survivors).toBe(6);
    expect(big.minHealth).toBeGreaterThan(90);
  });

  it.each(PRESETS)(
    'runs the shipped $name for 90 days without its circulation costing a fish anything',
    ({ id }) => {
      const { species } = PRESET_STOCK[id];
      const watched = watchFlow(shipped(id), 90, KEEPER_ROUTINE);

      expect(watched.peakTurnover).toBeLessThan(FISH_SPECIES_DATA[species].maxTurnover);
      expect(watched.peakStress).toBe(0);
    }
  );

  it('holds the community preset’s twelve tetras for 90 days', () => {
    const watched = watchFlow(shipped('community'), 90, KEEPER_ROUTINE);

    expect(watched.survivors).toBe(12);
    expect(watched.firstDeathDay).toBeNull();
    expect(watched.minHealth).toBeGreaterThan(90);
  });
});

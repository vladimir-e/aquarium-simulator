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
import { createSimulation, type SimulationState } from '../state.js';
import { FISH_SPECIES_DATA, type FishSpecies } from '../livestock/species.js';
import { FILTER_SPECS, FILTER_TYPES, type FilterType } from '../equipment/filter.js';
import type { PowerheadFlowRate } from '../equipment/powerhead.js';
import { applyAction } from '../actions/index.js';
import { getPresetById, PRESETS, type PresetDefinition, type PresetId } from '../presets.js';
import { DAY, DEFAULT_RNG_SEED, flowReading, run, stock, watchFlow } from './tanks.js';

const VOLUMES = [20, 40, 75, 150, 300, 568];

/** The filter class each species sanely lives on — the tolerance table in the task. */
const SANE_PAIRING: ReadonlyArray<{ species: FishSpecies; filter: FilterType }> = [
  { species: 'betta', filter: 'sponge' },
  { species: 'angelfish', filter: 'canister' },
  { species: 'neon_tetra', filter: 'canister' },
  { species: 'guppy', filter: 'sump' },
  { species: 'corydoras', filter: 'sump' },
];

/** What a keeper would put in each tank the game ships. */
const PRESET_STOCK: Record<PresetId, { species: FishSpecies; count: number }> = {
  bare: { species: 'guppy', count: 4 },
  betta: { species: 'betta', count: 1 },
  planted: { species: 'neon_tetra', count: 6 },
  community: { species: 'neon_tetra', count: 12 },
  angelfish: { species: 'angelfish', count: 4 },
};

const community = getPresetById('community');
if (community === undefined) throw new Error('the community preset is gone');

const KEEPER_ROUTINE = { feed: 0.25, waterChange: 0.25, topOff: true };

/**
 * Every shipped tank on both sides of the one habit that moves turnover: a
 * keeper who tops off daily, and one who lets the tank evaporate between
 * water changes. The margin over the filter class exists for the second.
 */
const SHIPPED_RUNS = PRESETS.flatMap((preset) =>
  [true, false].map((topOff) => ({ preset, topOff }))
);

const toppedOff = (state: SimulationState): SimulationState =>
  applyAction(state, { type: 'topOff' }).state;

/**
 * A preset's own tank, cycled on its bed and stocked with what it is for.
 *
 * Named stream: stocking draws a hardiness offset and a health offset per fish,
 * and the assertions below are that no fish is damaged at all over ninety days.
 * On an unnamed stream that anchor would be decided by the roll.
 */
function shipped(preset: PresetDefinition): SimulationState {
  const { species, count } = PRESET_STOCK[preset.id];
  return stock(
    toppedOff(run(createSimulation(preset.config, undefined, DEFAULT_RNG_SEED), 30 * DAY)),
    species,
    count,
    { sex: 'male' }
  );
}

/** A cycled tank on the named circulation, stocked with six tetras. */
function stockedOn(
  litres: number,
  filter: FilterType,
  powerhead: PowerheadFlowRate
): SimulationState {
  const cycled = run(
    createSimulation(
      {
        tankCapacity: litres,
        substrate: { type: 'aqua_soil' },
        filter: { enabled: true, type: filter },
        powerhead: { enabled: true, flowRateGPH: powerhead },
        heater: { targetTemperature: 25, wattage: Math.max(100, litres) },
      },
      undefined,
      DEFAULT_RNG_SEED
    ),
    30 * DAY
  );
  return stock(toppedOff(cycled), 'neon_tetra', 6, { sex: 'male' });
}

describe('flow tolerance', () => {
  it('sees the damage a tank sitting on a tolerance takes the moment it evaporates', () => {
    const { maxTurnover } = FISH_SPECIES_DATA.neon_tetra;
    const full = stock(
      toppedOff(
        run(
          createSimulation(
            { tankCapacity: 100, filter: { enabled: true, type: 'sump' } },
            undefined,
            DEFAULT_RNG_SEED
          ),
          DAY
        )
      ),
      'neon_tetra',
      1,
      { sex: 'male' }
    );

    expect(full.resources.flow / full.resources.water).toBe(maxTurnover);
    expect(watchFlow(full, 1 / DAY).peakStress).toBeGreaterThan(0);
  });

  it('charges the same damage at every volume, for a species kept above its class', () => {
    const stress = VOLUMES.map((litres) => flowReading('betta', litres, { filter: 'sump' }).stress);

    expect(stress.every((s) => s > 0)).toBe(true);
    expect(new Set(stress).size).toBe(1);
  });

  it('never damages a species on its own class, or on any gentler one', () => {
    for (const { species, filter } of SANE_PAIRING) {
      const gentler = FILTER_TYPES.slice(0, FILTER_TYPES.indexOf(filter) + 1);

      for (const type of gentler) {
        const rated = VOLUMES.filter((litres) => litres <= FILTER_SPECS[type].maxCapacityLiters);
        expect(rated.length).toBeGreaterThan(0);

        for (const litres of rated) {
          const { turnover, stress } = flowReading(species, litres, { filter: type });

          expect(turnover).toBeLessThan(FISH_SPECIES_DATA[species].maxTurnover);
          expect(stress).toBe(0);
        }
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
    const nano = watchFlow(stockedOn(20, 'sponge', 240), 60, KEEPER_ROUTINE);
    const big = watchFlow(stockedOn(300, 'sponge', 240), 60, KEEPER_ROUTINE);

    expect(nano.survivors).toBe(0);
    expect(nano.firstDeathDay).toBeLessThan(2);

    expect(big.peakStress).toBe(0);
    expect(big.survivors).toBe(6);
    expect(big.minHealth).toBeGreaterThan(90);
  });

  it('holds a big planted tank stacking the smallest powerhead on a canister', () => {
    const watched = watchFlow(stockedOn(300, 'canister', 240), 90, KEEPER_ROUTINE);

    expect(watched.peakTurnover).toBeGreaterThan(FISH_SPECIES_DATA.neon_tetra.maxTurnover);
    expect(watched.peakStress).toBeLessThan(0.3);
    expect(watched.survivors).toBe(6);
    expect(watched.minHealth).toBeGreaterThan(90);
  });

  it('still kills the same roster when that powerhead is turned all the way up', () => {
    const watched = watchFlow(stockedOn(300, 'canister', 850), 90, KEEPER_ROUTINE);

    expect(watched.peakTurnover).toBeGreaterThan(18);
    expect(watched.survivors).toBe(0);
    expect(watched.firstDeathDay).toBeLessThan(7);
  });

  it.each(SHIPPED_RUNS)(
    'runs the shipped $preset.name for 90 days, topping off $topOff, without its circulation costing a fish anything',
    ({ preset, topOff }) => {
      const { species } = PRESET_STOCK[preset.id];
      const watched = watchFlow(shipped(preset), 90, { ...KEEPER_ROUTINE, topOff });

      expect(watched.peakTurnover).toBeLessThan(FISH_SPECIES_DATA[species].maxTurnover);
      expect(watched.peakStress).toBe(0);
    }
  );

  it('holds the community preset’s twelve tetras for 90 days', () => {
    const watched = watchFlow(shipped(community), 90, KEEPER_ROUTINE);

    expect(watched.survivors).toBe(12);
    expect(watched.firstDeathDay).toBeNull();
    expect(watched.minHealth).toBeGreaterThan(90);
  });
});

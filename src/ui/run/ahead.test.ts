import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { createSimulation, getPresetById, tick, type SimulationState } from '../../simulation/index.js';
import { bankSurplus, spendAlgaeSurplus } from '../../simulation/algae/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { readHourAhead } from './ahead.js';

const config = DEFAULT_CONFIG;

/**
 * The planted preset, stocked and recovering from a bad spell so every organism
 * is moving — but for a grown sword towering over the rest on a full bank, which buds.
 */
function recovering(): SimulationState {
  const preset = getPresetById('planted')!;
  const stocked = createSimulation(preset.config, {
    ...preset.seed,
    plants: [
      { species: 'amazon_sword', size: 100 },
      { species: 'java_fern', count: 2, size: 60 },
      { species: 'monte_carlo', count: 2, size: 40 },
    ],
    fish: [{ species: 'neon_tetra', count: 6 }],
  });
  return produce(stocked, (draft) => {
    for (const plant of draft.plants) plant.condition = 60;
    Object.assign(draft.plants[0], { condition: 100, surplus: config.plants.surplusCap });
    for (const fish of draft.fish) {
      fish.health = 70;
      fish.surplus = config.livestock.surplusCap / 2;
    }
    draft.algae.mass = 20;
  });
}

/** Every hour of a day, with the tick that hour runs. */
function day(): { state: SimulationState; next: SimulationState }[] {
  const hours = [];
  let state = recovering();
  for (let hour = 0; hour < 24; hour++) {
    const next = tick(state, config);
    hours.push({ state, next });
    state = next;
  }
  return hours;
}

describe('readHourAhead', () => {
  it('reads each plant exactly as the next tick runs it, at every hour of the day', () => {
    const hours = day();
    expect(hours.some(({ state, next }) => next.plants.length > state.plants.length)).toBe(true);

    for (const { state, next } of hours) {
      const ahead = readHourAhead(state, config);
      const after = state.plants.map((plant) => next.plants.find((p) => p.id === plant.id)!);

      expect(ahead.plants.map((v) => v.newCondition)).toEqual(after.map((plant) => plant.condition));
      expect(ahead.banks).toEqual(after.map((plant) => plant.surplus));
    }
  });

  it('reads each fish exactly as the next tick runs it, at every hour of the day', () => {
    for (const { state, next } of day()) {
      expect(readHourAhead(state, config).fish.map((v) => v.newCondition)).toEqual(
        state.fish.map((fish) => next.fish.find((f) => f.id === fish.id)!.health)
      );
    }
  });

  it('reads the bloom exactly as the next tick banks it, at every hour of the day', () => {
    const { algae } = config;
    for (const { state, next } of day()) {
      const { net } = readHourAhead(state, config).algae;
      const lit = next.resources.light > 0;
      const bank = bankSurplus(state.algae.surplus, net, algae.surplusCap, lit);
      const shrunk = {
        ...state.algae,
        surplus: bank.surplus,
        mass: Math.max(0, state.algae.mass - bank.overflowDamage),
      };
      const grown = lit ? spendAlgaeSurplus(shrunk, algae) : shrunk;

      expect(grown.mass).toBe(next.algae.mass);
      expect(grown.surplus).toBe(next.algae.surplus);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import {
  createSimulation,
  dailyLightIntegral,
  getPresetById,
  tick,
  type SimulationState,
} from '../../simulation/index.js';
import { bankSurplus, spendAlgaeSurplus } from '../../simulation/algae/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { readHourAhead } from './ahead.js';

const config = DEFAULT_CONFIG;

/**
 * The planted preset, stocked and recovering from a bad spell so every organism
 * is moving — but for a grown sword towering over the rest on a full bank, which
 * buds, and a female neon on a full bank beside a male, who spawns.
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
    Object.assign(draft.fish[0], { sex: 'female', health: 100, surplus: config.livestock.surplusCap });
    draft.fish[1].sex = 'male';
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

const hours = day();

describe('readHourAhead', () => {
  it('reads each plant exactly as the next tick runs it, at every hour of the day', () => {
    expect(hours.some(({ state, next }) => next.plants.length > state.plants.length)).toBe(true);

    for (const { state, next } of hours) {
      const ahead = readHourAhead(state, config);
      const after = state.plants.map((plant) => next.plants.find((p) => p.id === plant.id)!);

      expect(ahead.plants.map((plant) => plant.vitality.newCondition)).toEqual(
        after.map((plant) => plant.condition)
      );
      expect(ahead.plants.map((plant) => plant.bank)).toEqual(after.map((plant) => plant.surplus));
    }
  });

  it('reads each plant starving exactly while its own light falls short of its need', () => {
    const dim = produce(recovering(), (draft) => {
      const scale = 15 / draft.equipment.light.par;
      draft.equipment.light.par = 15;
      draft.resources.lightByHour = draft.resources.lightByHour.map((par) => par * scale);
    });
    const starving = [recovering(), dim].flatMap((state) =>
      readHourAhead(state, config).plants.map(({ vitality, light }) => {
        const starvation = vitality.breakdown.stressors.find((s) => s.key === 'lightStarvation')!;
        expect(starvation.amount > 0).toBe(light.needShare < 1);
        return light.needShare < 1;
      })
    );

    expect(starving).toContain(true);
    expect(starving).toContain(false);
  });

  it('reads the day of light the next tick leaves the tank on', () => {
    for (const { state, next } of hours) {
      expect(readHourAhead(state, config).dailyLight).toBe(
        dailyLightIntegral(next.resources.lightByHour)
      );
    }
  });

  it('reads each fish exactly as the next tick runs it, a spawn included, at every hour of the day', () => {
    expect(hours.some(({ state, next }) => next.clutches.length > state.clutches.length)).toBe(true);

    for (const { state, next } of hours) {
      const ahead = readHourAhead(state, config);
      const after = state.fish.map((fish) => next.fish.find((f) => f.id === fish.id)!);

      expect(ahead.fish.map((fish) => fish.vitality.newCondition)).toEqual(
        after.map((fish) => fish.health)
      );
      expect(ahead.fish.map((fish) => fish.bank)).toEqual(after.map((fish) => fish.surplus));
    }
  });

  it('reads the bloom exactly as the next tick banks and grows it, at every hour of the day', () => {
    const { algae } = config;
    for (const { state, next } of hours) {
      const ahead = readHourAhead(state, config);
      const lit = next.resources.light > 0;
      const bank = bankSurplus(state.algae.surplus, ahead.algae.net, algae.surplusCap, lit);
      const shrunk = {
        ...state.algae,
        surplus: bank.surplus,
        mass: Math.max(0, state.algae.mass - bank.overflowDamage),
      };
      const grown = lit ? spendAlgaeSurplus(shrunk, algae) : shrunk;

      expect(grown).toEqual(next.algae);
      expect(ahead.algaeMass).toBe(next.algae.mass);
    }
  });
});

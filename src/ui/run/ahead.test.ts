import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import {
  ALGAE_KINDS,
  applyEffects,
  calculateDecay,
  createSimulation,
  dailyLightIntegral,
  getPresetById,
  processBreeding,
  processFlora,
  processLivestock,
  tick,
  type SimulationState,
} from '../../simulation/index.js';
import { settleEnvironment } from '../../simulation/tick.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { readHourAhead } from './ahead.js';

const config = DEFAULT_CONFIG;

/**
 * The planted preset, stocked, fed and recovering from a bad spell so every
 * organism is moving — but for a grown sword towering over the rest on a full
 * bank, which buds, and a female neon on a full bank beside a male, who spawns.
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
    for (const kind of ALGAE_KINDS) draft.algae[kind].mass = 20;
    draft.resources.food = 1;
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
      expect(ahead.plants.map(({ vitality, spent }) => vitality.surplus - spent)).toEqual(
        after.map((plant) => plant.surplus)
      );
      expect(ahead.plants.map((plant) => plant.buds)).toEqual(
        state.plants.map((plant) =>
          next.plants.some((p) => p.parentId === plant.id && !state.plants.some((q) => q.id === p.id))
        )
      );
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
      expect(ahead.fish.map(({ vitality, spent }) => vitality.surplus - spent)).toEqual(
        after.map((fish) => fish.surplus)
      );
    }
  });

  it('buys nothing with the bank of an organism the next tick takes', () => {
    const dying = produce(recovering(), (draft) => {
      draft.equipment.light.enabled = false;
      draft.resources.lightByHour.fill(0);
      draft.resources.ammonia = 500 * draft.resources.water;
      Object.assign(draft.plants[1], { condition: 0.001, surplus: 1 });
      for (const fish of draft.fish) Object.assign(fish, { health: 0.5, surplus: 1 });
      for (const kind of ALGAE_KINDS) Object.assign(draft.algae[kind], { condition: 0.001, surplus: 1 });
    });
    const ahead = readHourAhead(dying, config);
    const next = tick(dying, config);
    const gone = <T extends { id: string }>(before: T[], after: T[]): boolean[] =>
      before.map((o) => !after.some((a) => a.id === o.id));

    expect(gone(dying.fish, next.fish)).toContain(true);
    expect(gone(dying.plants, next.plants)).toContain(true);
    gone(dying.fish, next.fish).forEach((died, i) => died && expect(ahead.fish[i].spent).toBe(0));
    gone(dying.plants, next.plants).forEach((died, i) => died && expect(ahead.plants[i].spent).toBe(0));
    expect(next.logs.filter((log) => log.event === 'algae-died')).toHaveLength(ALGAE_KINDS.length);
    for (const kind of ALGAE_KINDS) expect(ahead.algae[kind].spent).toBe(0);
  });

  it('reads the waste the fish pass, the ammonia they breathe out and the food they leave to rot off the hour the plants and bloom leave them', () => {
    const fed = hours.map(({ state }) => readHourAhead(state, config));
    expect(fed.some((ahead) => ahead.fishWaste > 0 && ahead.gillAmmonia > 0 && ahead.foodWaste > 0)).toBe(true);

    for (const { state } of hours) {
      const ahead = readHourAhead(state, config);
      const settled = settleEnvironment(state, config);
      const flora = processFlora(settled, config);
      const livestock = processLivestock(applyEffects(flora.state, flora.effects, config), config);
      const delta = (resource: string, source: string): number =>
        livestock.effects
          .filter((e) => e.resource === resource && e.source === source)
          .reduce((sum, e) => sum + e.delta, 0);
      const left = processBreeding(applyEffects(livestock.state, livestock.effects, config), config)
        .state.resources;

      expect(ahead.fishWaste).toBeCloseTo(delta('waste', 'fish-metabolism'), 12);
      expect(ahead.gillAmmonia).toBeCloseTo(delta('ammonia', 'fish-gill-excretion'), 12);
      expect(ahead.foodWaste).toBe(
        calculateDecay(left.food, left.temperature, left.oxygen, config.decay) *
          config.decay.wasteConversionRatio
      );
    }
  });

  it('reads every bloom exactly as the next tick runs it, at every hour of the day', () => {
    for (const { state, next } of hours) {
      const ahead = readHourAhead(state, config);

      for (const kind of ALGAE_KINDS) {
        expect(ahead.algae[kind].condition).toBe(next.algae[kind].condition);
        expect(ahead.algae[kind].surplus).toBe(next.algae[kind].surplus);
        expect(ahead.algae[kind].mass).toBe(next.algae[kind].mass);
      }
    }
  });

  it('reads the spores diluting a bloom’s bank as nothing spent', () => {
    const empty = produce(recovering(), (draft) => {
      for (const kind of ALGAE_KINDS) Object.assign(draft.algae[kind], { mass: 0, surplus: 5 });
    });
    const ahead = readHourAhead(empty, config);

    for (const kind of ALGAE_KINDS) {
      expect(ahead.algae[kind].spent).toBe(0);
      expect(ahead.algae[kind].surplus).toBe(0);
      expect(tick(empty, config).algae[kind].surplus).toBe(0);
    }
  });
});

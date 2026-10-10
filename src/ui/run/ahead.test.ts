import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import {
  ALGAE_KINDS,
  applyEffects,
  createSimulation,
  dailyLightIntegral,
  getPresetById,
  processBodies,
  processFlora,
  processLivestock,
  tick,
  type Fish,
  type SimulationState,
} from '../../simulation/index.js';
import { settleEnvironment } from '../../simulation/tick.js';
import { spawnsAt } from '../../simulation/systems/brood.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { ammoniaPerGramOfFood } from '../../simulation/config/livestock.js';
import { holdingEggs } from '../../simulation/tests/fish.js';
import { readHourAhead } from './ahead.js';

const config = DEFAULT_CONFIG;

function ripe(fish: Fish, eggs: number): void {
  fish.deb = holdingEggs(fish, eggs).deb;
}

/**
 * The planted preset, stocked, fed and recovering from a bad spell so every
 * organism is moving — but for a grown sword towering over the rest on a full
 * bank, which buds, and a ripe female neon beside a ripe male, who spawn.
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
    for (const fish of draft.fish) fish.health = 70;
    Object.assign(draft.fish[0], { sex: 'female', health: 100 });
    ripe(draft.fish[0], spawnsAt('neon_tetra') - 0.1);
    draft.fish[1].sex = 'male';
    ripe(draft.fish[1], 20);
    for (const kind of ALGAE_KINDS) draft.algae[kind].mass = 20;
    draft.resources.food = 1;
  });
}

/** Two neons over a clutch of their eggs that hatches on the next tick. */
function hatching(): SimulationState {
  const stocked = createSimulation({ tankCapacity: 100 }, { fish: [{ species: 'neon_tetra', count: 2 }] });
  return produce(stocked, (draft) => {
    draft.clutches = [{ id: 'scattered', species: 'neon_tetra', eggs: 40.5, development: 0.9999 }];
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

/** The bodies pass the next tick runs, and the grams it moves into a resource from a source. */
function bodiesOf(state: SimulationState): {
  bodies: ReturnType<typeof processBodies>;
  delta: (resource: string, source: string) => number;
} {
  const flora = processFlora(settleEnvironment(state, config), config);
  const livestock = processLivestock(applyEffects(flora.state, flora.effects, config), config);
  const bodies = processBodies(applyEffects(livestock.state, livestock.effects, config), config);
  const delta = (resource: string, source: string): number =>
    [...livestock.effects, ...bodies.effects]
      .filter((e) => e.resource === resource && e.source === source)
      .reduce((sum, e) => sum + e.delta, 0);
  return { bodies, delta };
}

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
      expect(ahead.fish.map(({ hour }) => hour.fish.deb.structure)).toEqual(after.map((fish) => fish.deb.structure));
      expect(ahead.fish.map(({ hour }) => hour.fish.deb.reserve)).toEqual(after.map((fish) => fish.deb.reserve));
    }
  });

  it('buys nothing with the bank of an organism the next tick takes', () => {
    const dying = produce(recovering(), (draft) => {
      draft.equipment.light.enabled = false;
      draft.resources.lightByHour.fill(0);
      draft.resources.ammonia = 500 * draft.resources.water;
      Object.assign(draft.plants[1], { condition: 0.001, surplus: 1 });
      for (const kind of ALGAE_KINDS) Object.assign(draft.algae[kind], { condition: 0.001, surplus: 1 });
    });
    const ahead = readHourAhead(dying, config);
    const next = tick(dying, config);
    const gone = <T extends { id: string }>(before: T[], after: T[]): boolean[] =>
      before.map((o) => !after.some((a) => a.id === o.id));

    expect(gone(dying.plants, next.plants)).toContain(true);
    gone(dying.plants, next.plants).forEach((died, i) => died && expect(ahead.plants[i].spent).toBe(0));
    expect(next.logs.filter((log) => log.event === 'algae-died')).toHaveLength(ALGAE_KINDS.length);
    for (const kind of ALGAE_KINDS) expect(ahead.algae[kind].spent).toBe(0);
  });

  it('reads the waste the fish pass, the ammonia they breathe out and the food they leave to rot off the hour the plants and bloom leave them', () => {
    const fed = hours.map(({ state }) => readHourAhead(state, config));
    expect(fed.some((ahead) => ahead.fishWaste > 0 && ahead.gillAmmonia > 0 && ahead.foodWaste > 0)).toBe(true);

    const readsTheRot = (state: SimulationState, next: SimulationState): void => {
      const ahead = readHourAhead(state, config);
      const rotted = bodiesOf(state).bodies.state.resources.food - next.resources.food;
      const share = config.decay.wasteConversionRatio;
      expect(ahead.foodWaste).toBeCloseTo(rotted * share, 12);
      expect(ahead.foodAmmonia).toBeCloseTo(rotted * (1 - share) * ammoniaPerGramOfFood(config.livestock), 12);
    };

    for (const { state, next } of hours) {
      const ahead = readHourAhead(state, config);
      const { bodies, delta } = bodiesOf(state);

      expect(ahead.fishWaste).toBeCloseTo(delta('waste', 'fish-metabolism') + delta('waste', 'dead-eggs'), 12);
      expect(ahead.gillAmmonia).toBeCloseTo(delta('ammonia', 'fish-gill-excretion'), 12);
      expect(bodies.state.fish.length).toBeGreaterThan(0);
      readsTheRot(state, next);
    }

    const stifled = produce(hatching(), (draft) => {
      draft.resources.oxygen = 0.05;
      draft.resources.food = 1;
    });
    const { bodies, delta } = bodiesOf(stifled);
    expect(bodies.burned).toBeGreaterThan(0);
    expect(-delta('oxygen', 'fish-broods')).toBeGreaterThan(stifled.resources.oxygen / 2);
    readsTheRot(stifled, tick(stifled, config));
  });

  it('reads the eggs a clutch loses as waste the same hour', () => {
    const state = hatching();
    const { bodies, delta } = bodiesOf(state);

    expect(delta('waste', 'dead-eggs')).toBeGreaterThan(0);
    expect(bodies.waste).toBeCloseTo(delta('waste', 'dead-eggs'), 15);
    expect(readHourAhead(state, config).fishWaste).toBeCloseTo(
      delta('waste', 'fish-metabolism') + delta('waste', 'dead-eggs'),
      12
    );
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

  it('reads a livebearer as brooding in the hour she gives birth', () => {
    const stocked = createSimulation({ tankCapacity: 100 }, { fish: [{ species: 'guppy', count: 2 }] });
    const due = produce(stocked, (draft) => {
      Object.assign(draft.fish[0], { sex: 'female', health: 100 });
      ripe(draft.fish[0], 10);
      Object.assign(draft.fish[1], { sex: 'male', health: 100 });
      ripe(draft.fish[1], 10);
      draft.clutches = [{ id: 'due', species: 'guppy', eggs: 10, development: 0.9999, motherId: draft.fish[0].id }];
    });
    const next = tick(due, config);

    expect(next.clutches.some((c) => c.motherId === due.fish[0].id && c.id !== 'due')).toBe(true);
    expect(readHourAhead(due, config).fish.map((fish) => fish.broods)).toEqual([true, true]);
  });
});

import { describe, it, expect } from 'vitest';
import { produce, type Draft } from 'immer';
import {
  alerts,
  checkAlerts,
  bloomAlert,
  bloomAlerts,
  highAmmoniaAlert,
  ammoniaAlertLine,
  highCo2Alert,
  highNitrateAlert,
  highNitriteAlert,
  lowOxygenAlert,
  waterLevelAlert,
  waterLevelAlertLine,
  BLOOM_COVERAGE_LINE,
  PLANT_LIGHT_LINE,
  HIGH_CO2_THRESHOLD,
  type Alert,
} from './index.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../config/index.js';
import { computeFishVitality } from '../systems/fish-health.js';
import { createFish } from '../livestock/create-fish.js';
import { plantLightTaken } from '../plants/canopy.js';
import { plantRecord } from '../tests/plant.js';
import { FREE_AMMONIA_EDGE, NITRATE_EDGE, NITRITE_EDGE, OXYGEN_EDGE } from '../livestock/tolerance.js';
import { createSimulation, type AlertState, type SimulationState } from '../state.js';
import { getPh } from '../core/carbonate.js';
import { ALGAE_KINDS, type AlgaeKind } from '../algae/index.js';

const CAPACITY = 100;
const config = DEFAULT_CONFIG;
const LEVEL_LINE = waterLevelAlertLine(config);

type Setter = (draft: Draft<SimulationState>, value: number) => void;

interface Case {
  alert: Alert;
  flag: keyof AlertState;
  source: string;
  set: Setter;
  firing: number;
  quiet: number;
  edge: { value: number; fires: boolean };
  decimals: number;
}

const ppm =
  (resource: 'ammonia' | 'nitrite' | 'nitrate'): Setter =>
  (draft, value): void => {
    draft.resources[resource] = value * draft.resources.water;
  };

const CASES: Case[] = [
  {
    alert: waterLevelAlert,
    flag: 'waterLevelCritical',
    source: 'evaporation',
    set: (draft, percent): void => {
      draft.resources.water = (percent / 100) * CAPACITY;
    },
    firing: LEVEL_LINE / 2,
    quiet: (LEVEL_LINE + 100) / 2,
    edge: { value: LEVEL_LINE, fires: false },
    decimals: 1,
  },
  ...ALGAE_KINDS.map(
    (kind, i): Case => ({
      alert: bloomAlerts[i],
      flag: kind,
      source: 'algae',
      set: (draft, mass): void => {
        draft.algae[kind].mass = mass;
      },
      firing: BLOOM_COVERAGE_LINE + 5,
      quiet: BLOOM_COVERAGE_LINE / 2,
      edge: { value: BLOOM_COVERAGE_LINE, fires: false },
      decimals: 1,
    })
  ),
  {
    alert: highAmmoniaAlert,
    flag: 'highAmmonia',
    source: 'nitrogen-cycle',
    set: (draft, free): void => {
      draft.resources.ammonia =
        (free / FREE_AMMONIA_EDGE) * ammoniaAlertLine(draft.resources) * draft.resources.water;
    },
    firing: FREE_AMMONIA_EDGE * 2,
    quiet: FREE_AMMONIA_EDGE / 2,
    edge: { value: FREE_AMMONIA_EDGE, fires: false },
    decimals: 3,
  },
  {
    alert: highNitriteAlert,
    flag: 'highNitrite',
    source: 'nitrogen-cycle',
    set: ppm('nitrite'),
    firing: NITRITE_EDGE * 2,
    quiet: NITRITE_EDGE / 2,
    edge: { value: NITRITE_EDGE, fires: false },
    decimals: 3,
  },
  {
    alert: highNitrateAlert,
    flag: 'highNitrate',
    source: 'nitrogen-cycle',
    set: ppm('nitrate'),
    firing: NITRATE_EDGE * 2,
    quiet: NITRATE_EDGE / 2,
    edge: { value: NITRATE_EDGE, fires: false },
    decimals: 1,
  },
  {
    alert: lowOxygenAlert,
    flag: 'lowOxygen',
    source: 'gas-exchange',
    set: (draft, oxygen): void => {
      draft.resources.oxygen = oxygen;
    },
    firing: OXYGEN_EDGE / 2,
    quiet: OXYGEN_EDGE * 2,
    edge: { value: OXYGEN_EDGE, fires: false },
    decimals: 1,
  },
  {
    alert: highCo2Alert,
    flag: 'highCo2',
    source: 'gas-exchange',
    set: (draft, co2): void => {
      draft.resources.co2 = co2;
    },
    firing: HIGH_CO2_THRESHOLD + 5,
    quiet: HIGH_CO2_THRESHOLD / 2,
    edge: { value: HIGH_CO2_THRESHOLD, fires: false },
    decimals: 1,
  },
];

function tank({ set }: Case, value: number, triggered = false, tick = 0): SimulationState {
  return produce(createSimulation({ tankCapacity: CAPACITY }), (draft) => {
    set(draft, value);
    draft.tick = tick;
    for (const flag of Object.keys(draft.alertState) as (keyof AlertState)[]) {
      draft.alertState[flag] = triggered;
    }
  });
}

describe.each(CASES)('$alert.id', (c) => {
  it('fires one warning on crossing, stamped with the tick', () => {
    const result = c.alert.check(tank(c, c.firing, false, 42), config);

    expect(result.log).toMatchObject({ severity: 'warning', source: c.source, tick: 42 });
    expect(result.alertState[c.flag]).toBe(true);
  });

  it('stays quiet while latched, and clears once the condition passes', () => {
    const held = c.alert.check(tank(c, c.firing, true), config);
    expect(held.log).toBeNull();
    expect(held.alertState[c.flag]).toBe(true);

    const cleared = c.alert.check(tank(c, c.quiet, true), config);
    expect(cleared.log).toBeNull();
    expect(cleared.alertState[c.flag]).toBe(false);
  });

  it('treats the threshold itself as the documented side', () => {
    expect(c.alert.check(tank(c, c.edge.value), config).log !== null).toBe(c.edge.fires);
  });

  it('prints a reading just past its line on the harm side of it, never on the line', () => {
    const past = c.edge.value * (1 + Math.sign(c.firing - c.edge.value) * 1e-4);
    const message = c.alert.check(tank(c, past), config).log!.message;

    expect(message).not.toContain(c.edge.value.toFixed(c.decimals));
  });
});

function tuned(waterLevelStressThreshold: number): TunableConfig {
  return { ...config, livestock: { ...config.livestock, waterLevelStressThreshold } };
}

describe('waterLevelAlert', () => {
  it('stays quiet on an empty tank', () => {
    expect(waterLevelAlert.check(tank(CASES[0]!, 0), config).log).toBeNull();
  });

  it('reports the level and the share of capacity', () => {
    const message = waterLevelAlert.check(tank(CASES[0]!, 15), config).log!.message;
    expect(message).toContain('15.0L');
    expect(message).toContain('15.0%');
  });

  it('fires exactly where the water starts to harm fish, wherever that is tuned', () => {
    for (const line of [30, 50, 70]) {
      const at = tuned(line);
      for (const percent of [line - 5, line, line + 5]) {
        const state = tank(CASES[0]!, percent);
        const fish = createFish({ species: 'neon_tetra', stage: 'adult', rng: { ...state.rng } });
        const { stressors } = computeFishVitality(
          fish,
          state.resources,
          [],
          state.resources.water,
          CAPACITY,
          at.livestock
        ).breakdown;
        const harmed = stressors.find((s) => s.key === 'waterLevel')!.amount > 0;

        expect(waterLevelAlert.check(state, at).log !== null).toBe(harmed);
      }
    }
  });
});

describe('bloomAlert', () => {
  const planted = (kind: AlgaeKind, mass: number): SimulationState =>
    produce(createSimulation({ tankCapacity: CAPACITY }), (draft) => {
      draft.plants = [
        plantRecord({ id: 'carpet', species: 'monte_carlo', size: 80, condition: 100, surplus: 0 }),
        plantRecord({ id: 'sword', species: 'amazon_sword', size: 80, condition: 100, surplus: 0 }),
      ];
      draft.algae[kind].mass = mass;
    });

  it.each(ALGAE_KINDS)('fires for %s over planting exactly where it takes the line’s share of the plants’ light, whatever its coverage', (kind) => {
    for (let mass = 5; mass <= 95; mass += 5) {
      const state = planted(kind, mass);
      const taken = plantLightTaken(state, config.optics)[kind] * 100;
      expect(bloomAlert(kind).check(state, config).log !== null).toBe(taken > PLANT_LIGHT_LINE);
    }
    expect(bloomAlert(kind).check(planted(kind, 95), config).log).not.toBeNull();
  });

  it('is each kind’s own: one kind’s bloom raises its flag alone', () => {
    const state = produce(createSimulation({ tankCapacity: CAPACITY }), (draft) => {
      draft.algae.film.mass = BLOOM_COVERAGE_LINE + 10;
    });
    const { alertState } = checkAlerts(state, config);
    expect(alertState.film).toBe(true);
    expect(alertState.greenWater).toBe(false);
  });

  it('names the verb that takes its kind out', () => {
    const message = (kind: AlgaeKind): string => bloomAlert(kind).check(planted(kind, 95), config).log!.message;
    expect(message('greenWater')).toContain('water change');
    expect(message('film')).toContain('scrub');
  });
});

describe('highAmmoniaAlert', () => {
  const at = (tanPpm: number, kh: number): SimulationState =>
    produce(createSimulation({ tankCapacity: CAPACITY, tapKh: kh }), (draft) => {
      draft.resources.ammonia = tanPpm * draft.resources.water;
    });

  it('reads free NH₃, so one test-kit reading fires in hard water and not in soft', () => {
    const soft = at(1, 1);
    const hard = at(1, 12);

    expect(getPh(hard.resources)).toBeGreaterThan(getPh(soft.resources));
    expect(highAmmoniaAlert.check(hard, config).log).not.toBeNull();
    expect(highAmmoniaAlert.check(soft, config).log).toBeNull();
  });

  it('draws its total-ammonia line lower as pH climbs', () => {
    expect(ammoniaAlertLine(at(0, 12).resources)).toBeLessThan(ammoniaAlertLine(at(0, 1).resources));
  });
});

describe('checkAlerts', () => {
  it('registers every alert once', () => {
    expect(new Set(alerts.map((a) => a.id)).size).toBe(alerts.length);
    for (const { alert } of CASES) expect(alerts).toContain(alert);
  });

  it('is silent on a fresh tank', () => {
    const result = checkAlerts(createSimulation({ tankCapacity: CAPACITY }), config);

    expect(result.logs).toEqual([]);
    expect(Object.values(result.alertState).every((flag) => !flag)).toBe(true);
  });

  it('collects the logs that fire and merges every flag', () => {
    const state = produce(createSimulation({ tankCapacity: CAPACITY }), (draft) => {
      draft.resources.water = 10;
      draft.resources.co2 = HIGH_CO2_THRESHOLD + 5;
      draft.alertState.highCo2 = true;
    });
    const result = checkAlerts(state, config);

    expect(result.logs.map((l) => l.source)).toEqual(['evaporation']);
    expect(result.alertState.waterLevelCritical).toBe(true);
    expect(result.alertState.highCo2).toBe(true);
  });
});

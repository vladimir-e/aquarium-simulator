import { describe, it, expect } from 'vitest';
import { produce, type Draft } from 'immer';
import {
  alerts,
  checkAlerts,
  highAlgaeAlert,
  highAmmoniaAlert,
  ammoniaAlertLine,
  highCo2Alert,
  highNitrateAlert,
  highNitriteAlert,
  lowOxygenAlert,
  waterLevelAlert,
  algaeAlertLine,
  waterLevelAlertLine,
  HIGH_CO2_THRESHOLD,
  type Alert,
} from './index.js';
import { DEFAULT_CONFIG, type TunableConfig } from '../config/index.js';
import { computeFishVitality } from '../systems/fish-health.js';
import { buildPlantStressors } from '../systems/plant-vitality.js';
import { createFish } from '../livestock/create-fish.js';
import { createPlant } from '../plants/create-plant.js';
import { lightAtHeight } from '../plants/canopy.js';
import { FREE_AMMONIA_EDGE, NITRATE_EDGE, NITRITE_EDGE, OXYGEN_EDGE } from '../livestock/tolerance.js';
import { createSimulation, type AlertState, type SimulationState } from '../state.js';
import { getPh } from '../core/carbonate.js';

const CAPACITY = 100;
const config = DEFAULT_CONFIG;
const LEVEL_LINE = waterLevelAlertLine(config);
const ALGAE_LINE = algaeAlertLine(config);

type Setter = (draft: Draft<SimulationState>, value: number) => void;

interface Case {
  alert: Alert;
  flag: keyof AlertState;
  source: string;
  set: Setter;
  firing: number;
  quiet: number;
  edge: { value: number; fires: boolean };
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
  },
  {
    alert: highAlgaeAlert,
    flag: 'highAlgae',
    source: 'algae',
    set: (draft, mass): void => {
      draft.algae.mass = mass;
    },
    firing: ALGAE_LINE + 5,
    quiet: ALGAE_LINE / 2,
    edge: { value: ALGAE_LINE, fires: false },
  },
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
  },
  {
    alert: highNitriteAlert,
    flag: 'highNitrite',
    source: 'nitrogen-cycle',
    set: ppm('nitrite'),
    firing: NITRITE_EDGE * 2,
    quiet: NITRITE_EDGE / 2,
    edge: { value: NITRITE_EDGE, fires: false },
  },
  {
    alert: highNitrateAlert,
    flag: 'highNitrate',
    source: 'nitrogen-cycle',
    set: ppm('nitrate'),
    firing: NITRATE_EDGE * 2,
    quiet: NITRATE_EDGE / 2,
    edge: { value: NITRATE_EDGE, fires: false },
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
});

function tuned(waterLevelStressThreshold: number, algaeShadingThreshold: number): TunableConfig {
  return {
    ...config,
    livestock: { ...config.livestock, waterLevelStressThreshold },
    plants: { ...config.plants, algaeShadingThreshold },
  };
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

  it('never reports a level rounded up to the line it is under', () => {
    const message = waterLevelAlert.check(tank(CASES[0]!, LEVEL_LINE - 0.01), config).log!.message;
    expect(message).toContain(`${(LEVEL_LINE - 0.1).toFixed(1)}%`);
  });

  it('fires exactly where the water starts to harm fish, wherever that is tuned', () => {
    for (const line of [30, 50, 70]) {
      const at = tuned(line, ALGAE_LINE);
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

describe('highAlgaeAlert', () => {
  it('never reports a bloom rounded down to the line it is over', () => {
    const message = highAlgaeAlert.check(tank(CASES[1]!, ALGAE_LINE + 0.01), config).log!.message;
    expect(message).toContain(`${(ALGAE_LINE + 0.1).toFixed(1)}`);
  });

  it('fires exactly where the bloom starts to shade plants, wherever that is tuned', () => {
    for (const line of [20, 30, 50]) {
      const at = tuned(LEVEL_LINE, line);
      for (const mass of [line - 5, line, line + 5]) {
        const state = tank(CASES[1]!, mass);
        const plant = createPlant({ species: 'java_fern', rng: { ...state.rng } });
        const shading = buildPlantStressors({
          plant,
          resources: state.resources,
          waterVolume: state.resources.water,
          plantsConfig: at.plants,
          nutrientSufficiency: 1,
          algaeMass: mass,
          light: lightAtHeight(plant, { leaf: 1, top: 1 }, state.resources, 40),
        }).find((s) => s.key === 'algae')!;

        expect(highAlgaeAlert.check(state, at).log !== null).toBe(shading.amount > 0);
      }
    }
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

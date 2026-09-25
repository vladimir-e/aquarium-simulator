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
  HIGH_ALGAE_THRESHOLD,
  HIGH_CO2_THRESHOLD,
  WATER_LEVEL_CRITICAL_THRESHOLD,
  type Alert,
} from './index.js';
import { FREE_AMMONIA_EDGE, NITRATE_EDGE, NITRITE_EDGE, OXYGEN_EDGE } from '../livestock/tolerance.js';
import { createSimulation, type AlertState, type SimulationState } from '../state.js';
import { getPh } from '../core/carbonate.js';

const CAPACITY = 100;

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
    set: (draft, share): void => {
      draft.resources.water = share * CAPACITY;
    },
    firing: WATER_LEVEL_CRITICAL_THRESHOLD / 2,
    quiet: 0.5,
    edge: { value: WATER_LEVEL_CRITICAL_THRESHOLD, fires: false },
  },
  {
    alert: highAlgaeAlert,
    flag: 'highAlgae',
    source: 'algae',
    set: (draft, mass): void => {
      draft.algae.mass = mass;
    },
    firing: HIGH_ALGAE_THRESHOLD + 5,
    quiet: HIGH_ALGAE_THRESHOLD / 2,
    edge: { value: HIGH_ALGAE_THRESHOLD, fires: true },
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
    const result = c.alert.check(tank(c, c.firing, false, 42));

    expect(result.log).toMatchObject({ severity: 'warning', source: c.source, tick: 42 });
    expect(result.alertState[c.flag]).toBe(true);
  });

  it('stays quiet while latched, and clears once the condition passes', () => {
    const held = c.alert.check(tank(c, c.firing, true));
    expect(held.log).toBeNull();
    expect(held.alertState[c.flag]).toBe(true);

    const cleared = c.alert.check(tank(c, c.quiet, true));
    expect(cleared.log).toBeNull();
    expect(cleared.alertState[c.flag]).toBe(false);
  });

  it('treats the threshold itself as the documented side', () => {
    expect(c.alert.check(tank(c, c.edge.value)).log !== null).toBe(c.edge.fires);
  });
});

describe('waterLevelAlert', () => {
  it('stays quiet on an empty tank', () => {
    expect(waterLevelAlert.check(tank(CASES[0]!, 0)).log).toBeNull();
  });

  it('reports the level and the share of capacity', () => {
    const message = waterLevelAlert.check(tank(CASES[0]!, 0.15)).log!.message;
    expect(message).toContain('15.0L');
    expect(message).toContain('15.0%');
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
    expect(highAmmoniaAlert.check(hard).log).not.toBeNull();
    expect(highAmmoniaAlert.check(soft).log).toBeNull();
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
    const result = checkAlerts(createSimulation({ tankCapacity: CAPACITY }));

    expect(result.logs).toEqual([]);
    expect(Object.values(result.alertState).every((flag) => !flag)).toBe(true);
  });

  it('collects the logs that fire and merges every flag', () => {
    const state = produce(createSimulation({ tankCapacity: CAPACITY }), (draft) => {
      draft.resources.water = 10;
      draft.resources.co2 = HIGH_CO2_THRESHOLD + 5;
      draft.alertState.highCo2 = true;
    });
    const result = checkAlerts(state);

    expect(result.logs.map((l) => l.source)).toEqual(['evaporation']);
    expect(result.alertState.waterLevelCritical).toBe(true);
    expect(result.alertState.highCo2).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import {
  GAUGE_SCALE,
  gaugeFill,
  gaugeValues,
  waterAlert,
  waterGauges,
  type WaterGauge,
} from './gauges';
import { snapshotFromState } from './history';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import {
  HIGH_AMMONIA_THRESHOLD,
  HIGH_NITRATE_THRESHOLD,
  HIGH_NITRITE_THRESHOLD,
} from '../../simulation/alerts/index.js';
import { createSimulation, type SimulationState } from '../../simulation/index.js';

function tank(): SimulationState {
  return createSimulation({ tankCapacity: 200 });
}

function gauges(state: SimulationState, history = [snapshotFromState(state)]): WaterGauge[] {
  return waterGauges({ state, phConfig: DEFAULT_CONFIG.ph, history, units: 'metric' });
}

function byKey(state: SimulationState, key: string): WaterGauge {
  const gauge = gauges(state).find((g) => g.key === key);
  if (!gauge) throw new Error(`no gauge for ${key}`);
  return gauge;
}

describe('gaugeFill', () => {
  it('places a value along its own scale', () => {
    expect(gaugeFill('temperature', 25)).toBeCloseTo(0.5, 5);
    expect(gaugeFill('water', 100)).toBe(1);
    expect(gaugeFill('nitrate', 50)).toBeCloseTo(0.5, 5);
  });

  it('clamps readings that run off either end', () => {
    expect(gaugeFill('temperature', 60)).toBe(1);
    expect(gaugeFill('temperature', 0)).toBe(0);
  });
});

describe('GAUGE_SCALE', () => {
  it('keeps every alert threshold on the track it belongs to', () => {
    expect(GAUGE_SCALE.ammonia[1]).toBeGreaterThan(HIGH_AMMONIA_THRESHOLD);
    expect(GAUGE_SCALE.nitrite[1]).toBeGreaterThan(HIGH_NITRITE_THRESHOLD);
    expect(GAUGE_SCALE.nitrate[1]).toBeGreaterThan(HIGH_NITRATE_THRESHOLD);
  });
});

describe('gaugeValues', () => {
  it('reads level as a percentage of capacity and the toxins as ppm', () => {
    const state = tank();
    state.resources.water = 150;
    state.resources.ammonia = 150 * 0.4;
    expect(gaugeValues(state).water).toBeCloseTo(75, 5);
    expect(gaugeValues(state).ammonia).toBeCloseTo(0.4, 5);
  });

  it('reads zero level rather than dividing by a capacity of nothing', () => {
    const state = tank();
    state.tank.capacity = 0;
    expect(gaugeValues(state).water).toBe(0);
  });
});

describe('waterGauges', () => {
  it('returns the six gauges in reading order', () => {
    expect(gauges(tank()).map((g) => g.key)).toEqual([
      'temperature',
      'ph',
      'water',
      'ammonia',
      'nitrite',
      'nitrate',
    ]);
  });

  it('bands the toxins at the engine thresholds and leaves temp and pH unbanded', () => {
    const state = tank();
    expect(byKey(state, 'ammonia').band).toEqual({
      from: 0,
      to: gaugeFill('ammonia', HIGH_AMMONIA_THRESHOLD),
    });
    expect(byKey(state, 'nitrate').band).toEqual({
      from: gaugeFill('nitrate', 5),
      to: gaugeFill('nitrate', HIGH_NITRATE_THRESHOLD),
    });
    expect(byKey(state, 'temperature').band).toBeNull();
    expect(byKey(state, 'ph').band).toBeNull();
  });

  it('marks where a reading is being driven, not a band it must sit in', () => {
    const state = tank();
    state.equipment.heater.enabled = true;
    state.equipment.heater.targetTemperature = 26;
    expect(byKey(state, 'temperature').setpoint?.at).toBeCloseTo(gaugeFill('temperature', 26), 5);
    expect(byKey(state, 'temperature').limits).toEqual([]);
  });

  it('drops the temperature setpoint when no heater is running', () => {
    const state = tank();
    state.equipment.heater.enabled = false;
    expect(byKey(state, 'temperature').setpoint).toBeNull();
    expect(byKey(state, 'temperature').caption).toContain('no heater');
  });

  it('labels every hairline on the axis', () => {
    const nitrate = byKey(tank(), 'nitrate');
    for (const limit of nitrate.limits) {
      expect(nitrate.ticks.some((t) => Math.abs(t.at - limit) < 1e-9)).toBe(true);
    }
  });

  it('takes its status and pill from classifyVital, never from the scale', () => {
    const state = tank();
    state.resources.ammonia = state.resources.water * (HIGH_AMMONIA_THRESHOLD + 0.1);
    const ammonia = byKey(state, 'ammonia');
    expect(ammonia.status).toBe('alert');
    expect(ammonia.pill).toBe('HIGH');
    // pH sits mid-scale and still reads neutral — the classifier gives it no band.
    expect(byKey(state, 'ph').status).toBe('neutral');
    expect(byKey(state, 'ph').pill).toBeNull();
  });

  it('shows the reading in the reader’s units without moving it on the track', () => {
    const state = tank();
    state.resources.temperature = 25;
    const metric = waterGauges({
      state,
      phConfig: DEFAULT_CONFIG.ph,
      history: [],
      units: 'metric',
    })[0];
    const imperial = waterGauges({
      state,
      phConfig: DEFAULT_CONFIG.ph,
      history: [],
      units: 'imperial',
    })[0];
    expect(metric.text).toBe('25.0');
    expect(imperial.text).toBe('77.0');
    expect(imperial.fill).toBeCloseTo(metric.fill, 10);
  });

  it('traces the last 24 hours, oldest first', () => {
    const state = tank();
    const history = Array.from({ length: 40 }, (_, tick) => ({
      ...snapshotFromState(state),
      tick,
      nitrate: tick,
    }));
    const trace = waterGauges({
      state,
      phConfig: DEFAULT_CONFIG.ph,
      history,
      units: 'metric',
    }).find((g) => g.key === 'nitrate')!.trace;
    expect(trace).toHaveLength(24);
    expect(trace[0]).toBe(16);
    expect(trace[23]).toBe(39);
  });

  it('states the trend once there are two samples, and stays quiet before that', () => {
    const state = tank();
    const first = snapshotFromState(state);
    expect(byKey(state, 'nitrate').caption).toBe('safe 5–80');

    const climbing = [
      { ...first, nitrate: 10 },
      { ...first, nitrate: 12.4 },
    ];
    const gauge = waterGauges({
      state,
      phConfig: DEFAULT_CONFIG.ph,
      history: climbing,
      units: 'metric',
    }).find((g) => g.key === 'nitrate')!;
    expect(gauge.caption).toBe('safe 5–80 · +2.4/h');
  });
});

describe('waterAlert', () => {
  const reading = (key: string, label: string, value: number, status: string): never =>
    ({ key, label, value, status }) as never;

  it('names an alert before anything else', () => {
    expect(
      waterAlert(
        [
          reading('nitrate', 'NO₃', 0, 'warn'),
          reading('ammonia', 'NH₃', 4, 'alert'),
        ],
        true
      )
    ).toEqual({ text: 'NH₃ high', status: 'alert' });
  });

  it('lets an uncycled tank outrank a soft warning', () => {
    expect(waterAlert([reading('nitrate', 'NO₃', 0, 'warn')], false)).toEqual({
      text: 'uncycled',
      status: 'neutral',
    });
  });

  it('falls through to the warning once the biofilter is established', () => {
    expect(waterAlert([reading('nitrate', 'NO₃', 0, 'warn')], true)).toEqual({
      text: 'NO₃ low',
      status: 'warn',
    });
  });

  it('says nothing about a cycled tank that reads clean', () => {
    expect(waterAlert([reading('nitrate', 'NO₃', 12, 'ok')], true)).toBeNull();
  });
});

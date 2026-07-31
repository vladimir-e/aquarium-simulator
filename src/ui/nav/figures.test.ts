import { describe, it, expect } from 'vitest';
import { formatMeter, navFigures, type MicroMeter, type NavFigure } from './figures';
import type { SectionId } from './sections';
import { nutrientAlert, nutrientReadings, waterAlert, waterGauges } from '../run/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import {
  applyAction,
  createSimulation,
  type Clutch,
  type Plant,
  type SimulationState,
} from '../../simulation/index.js';

function tank(overrides: Partial<SimulationState> = {}): SimulationState {
  return { ...createSimulation({ tankCapacity: 200 }), ...overrides };
}

/** A tank whose biofilter is fully colonised, so `uncycled` stops winning. */
function cycled(overrides: Partial<SimulationState> = {}): SimulationState {
  const state = tank(overrides);
  const ceiling = state.resources.surface * DEFAULT_CONFIG.nitrogenCycle.bacteriaPerCm2;
  state.resources.aob = ceiling;
  state.resources.nob = ceiling;
  return state;
}

function plant(condition: number): Plant {
  return { id: `p${condition}`, species: 'amazon_sword', size: 60, condition, surplus: 0 };
}

function clutch(id: string): Clutch {
  return { id, species: 'angelfish', eggCount: 30, laidTick: 0 };
}

function figures(
  state: SimulationState,
  units: 'metric' | 'imperial' = 'metric'
): Record<SectionId, NavFigure> {
  return navFigures({
    state,
    config: DEFAULT_CONFIG,
    presetName: 'Planted Tank',
    units,
    alerts: 6,
    deaths: 2,
    births: 18,
  });
}

describe('navFigures — Water', () => {
  it('pins the six chemistry meters in gauge order', () => {
    const meters = figures(tank()).water.meters ?? [];
    expect(meters.map((m) => m.key)).toEqual([
      'temperature',
      'ph',
      'water',
      'ammonia',
      'nitrite',
      'nitrate',
    ]);
  });

  it('fills each track against its own display scale', () => {
    const state = tank();
    state.resources.temperature = 25;
    const meters = figures(state).water.meters ?? [];
    // Temp runs 15–35 °C, so 25 sits mid-track; a full tank fills the level meter.
    expect(meters[0].fill).toBeCloseTo(0.5, 5);
    expect(meters[2].fill).toBeCloseTo(1, 5);
  });

  it('clamps a reading that runs off the end of its scale', () => {
    const state = tank();
    state.resources.temperature = 60;
    const meters = figures(state).water.meters ?? [];
    expect(meters[0].fill).toBe(1);
  });

  it('names the temperature meter in the reader’s own unit', () => {
    expect((figures(tank()).water.meters ?? [])[0].label).toBe('°C');
    expect((figures(tank(), 'imperial').water.meters ?? [])[0].label).toBe('°F');
  });

  it('calls a fresh tank uncycled', () => {
    expect(figures(tank()).water.pill).toEqual({ text: 'uncycled', status: 'neutral' });
  });

  it('lets an out-of-band reading outrank the uncycled notice', () => {
    const state = tank();
    // 200 L × 2 ppm of ammonia, well past the engine's 0.1 ppm alert line.
    state.resources.ammonia = state.resources.water * 2;
    expect(figures(state).water.pill).toEqual({ text: 'NH₃ high', status: 'alert' });
  });

  it('falls through to a soft warning once the colony is established', () => {
    // Nitrate is plant food, so an established tank sitting at zero warns.
    expect(figures(cycled()).water.pill).toEqual({ text: 'NO₃ low', status: 'warn' });
  });

  it('fills each toxin track against its own display scale', () => {
    const state = tank();
    // NH₃ runs 0–1 ppm, NO₂ 0–5, NO₃ 0–100, so each of these sits mid-track.
    state.resources.ammonia = state.resources.water * 0.5;
    state.resources.nitrite = state.resources.water * 2.5;
    state.resources.nitrate = state.resources.water * 50;

    const fills = (figures(state).water.meters ?? []).map((m) => m.fill);
    expect(fills.slice(3)).toEqual([0.5, 0.5, 0.5]);
  });

  it('drops the pill entirely when a cycled tank reads clean', () => {
    const state = cycled();
    state.resources.nitrate = state.resources.water * 12; // mid safe band
    expect(figures(state).water.pill).toBeNull();
  });
});

/**
 * The rail exists so the reader need not open the section — which only holds if
 * the two never disagree. These compare the rail's own figures against the
 * section's gauges on a tank pushed off every setpoint at once.
 */
describe('the rail carries the Water section’s own readings', () => {
  /** Neutral, warn and alert all on screen at once, across all six readings. */
  function offSetpoint(): SimulationState {
    const state = cycled();
    state.resources.temperature = 29;
    state.resources.ph = 6.2;
    state.resources.water = state.tank.capacity * 0.15;
    state.resources.ammonia = state.resources.water * 0.4;
    state.resources.nitrite = state.resources.water * 1.2;
    state.resources.nitrate = state.resources.water * 30;
    return state;
  }

  function gauges(state: SimulationState): ReturnType<typeof waterGauges> {
    return waterGauges({ state, phConfig: DEFAULT_CONFIG.ph, history: [], units: 'metric' });
  }

  it('matches every micro-meter to its gauge on value, fill and status', () => {
    const state = offSetpoint();
    const meters = figures(state).water.meters ?? [];
    const section = gauges(state);

    expect(meters).toHaveLength(section.length);
    section.forEach((gauge, i) => {
      expect(meters[i].key).toBe(gauge.key);
      expect(meters[i].value).toBe(gauge.value);
      expect(meters[i].fill).toBe(gauge.fill);
      expect(meters[i].status).toBe(gauge.status);
    });
  });

  it('names the same reading in the rail pill as in the section header', () => {
    const alerting = offSetpoint();
    expect(figures(alerting).water.pill).toEqual(waterAlert(gauges(alerting), true));

    // The level is the one reading whose rail caption ('lvl') is not its name,
    // and it surfaces in the pill only when no toxin outranks it.
    const low = cycled();
    low.resources.water = low.tank.capacity * 0.15;
    low.resources.nitrate = low.resources.water * 12;

    expect(figures(low).water.pill).toEqual(waterAlert(gauges(low), true));
    expect(figures(low).water.pill?.text).toBe('Level low');
  });
});

describe('navFigures — Equipment', () => {
  it('reports colonisation alongside the device count', () => {
    expect(figures(cycled()).equipment.lines[0]).toMatch(/^\d of 8 on · biofilter 100 %$/);
  });

  it('gives one dot per device, matching that device’s power state', () => {
    const state = tank();
    state.equipment.filter.enabled = false;
    state.equipment.powerhead.enabled = true;

    const f = figures(state).equipment;
    // filter · heater · light · air pump · ATO · CO₂ · powerhead · auto doser
    expect(f.dots).toEqual([false, true, true, false, false, false, true, false]);
    expect(f.lines[0]).toContain(`${f.dots?.filter(Boolean).length} of 8 on`);
  });
});

describe('navFigures — Flora', () => {
  /** A tank of one high-demand carpet, which the engine feeds on all four nutrients. */
  function carpeted(): SimulationState {
    const state = tank();
    state.plants = [{ id: 'mc', species: 'monte_carlo', size: 50, condition: 90, surplus: 0 }];
    return state;
  }

  it('reads plants against tank capacity, and the scape when nothing ails', () => {
    const f = figures(tank()).flora;
    expect(f.lines[0]).toBe('0 of 31 plants · no algae');
    expect(f.lines[1]).toBe('Bare');
  });

  it('stays quiet about nutrients while nothing is planted to want them', () => {
    expect(figures(tank()).flora.pill).toBeNull();
  });

  it('names the one deficiency a planted tank has', () => {
    const state = carpeted();
    // Everything dosed but iron — the classic planted-tank deficiency.
    state.resources.nitrate = state.resources.water * 20;
    state.resources.phosphate = state.resources.water * 2;
    state.resources.potassium = state.resources.water * 10;
    expect(figures(state).flora.pill).toEqual({ text: 'Fe depleted', status: 'alert' });
  });

  it('says so once when nothing at all is dosed, rather than naming four blanks', () => {
    expect(figures(carpeted()).flora.pill).toEqual({ text: 'nothing dosed', status: 'alert' });
  });

  it('carries the same nutrient reading the section’s panel does', () => {
    const state = carpeted();
    state.resources.nitrate = state.resources.water * 20;
    expect(figures(state).flora.pill).toEqual(
      nutrientAlert(nutrientReadings(state, DEFAULT_CONFIG))
    );
  });

  it('gives the second line to the worst plant when one is ailing', () => {
    const state = tank();
    state.plants = [plant(90), plant(20)];
    expect(figures(state).flora.lines[1]).toBe('Amazon Sword struggling');
  });

  it('keeps the scape on the second line while every plant is fine', () => {
    const state = tank();
    state.plants = [plant(90), plant(75)];
    state.equipment.substrate.type = 'sand';
    expect(figures(state).flora.lines[1]).toBe('Sand');
  });

  it('prints the algae reading once it registers', () => {
    const state = tank();
    state.algae.mass = 47;
    expect(figures(state).flora.lines[0]).toContain('algae 47 %');
  });
});

describe('navFigures — Livestock', () => {
  it('drops the species and clutch clauses on an empty roster', () => {
    expect(figures(tank()).livestock.lines).toEqual(['0 fish', 'bioload 0.0× vs guideline']);
  });

  it('counts stocked species', () => {
    let state = tank();
    state = applyAction(state, { type: 'addFish', species: 'neon_tetra' }).state;
    state = applyAction(state, { type: 'addFish', species: 'betta' }).state;
    const f = figures(state).livestock;
    expect(f.lines[0]).toBe('2 fish · 2 species');
    expect(f.lines[1]).toMatch(/^bioload \d\.\d× vs guideline$/);
  });

  it('counts clutches, in the plural only when there is more than one', () => {
    const state = tank();
    state.clutches = [clutch('a')];
    expect(figures(state).livestock.lines[0]).toBe('0 fish · 1 clutch');

    state.clutches = [clutch('a'), clutch('b')];
    expect(figures(state).livestock.lines[0]).toBe('0 fish · 2 clutches');
  });

  it('counts fry apart from the adults rather than folding them in', () => {
    let state = tank();
    state = applyAction(state, { type: 'addFish', species: 'guppy' }).state;
    state = {
      ...state,
      fish: [
        ...state.fish,
        { ...state.fish[0], id: 'fry1', stage: 'fry', age: 24, mass: 0.05 },
        { ...state.fish[0], id: 'fry2', stage: 'fry', age: 24, mass: 0.05 },
      ],
    };
    expect(figures(state).livestock.lines[0]).toBe('1 fish · 1 species · 2 fry');
  });

  it('reads the bioload against the tank, not against the head count', () => {
    let state = tank(); // 200 L → a 120 g guideline
    for (let i = 0; i < 4; i++) {
      state = applyAction(state, { type: 'addFish', species: 'angelfish' }).state;
    }
    // 4 angelfish project 60 g of adult mass — exactly half the guideline.
    expect(figures(state).livestock.lines[1]).toBe('bioload 0.5× vs guideline');
  });

  it('flags fish that need feeding', () => {
    let fed = tank();
    fed = applyAction(fed, { type: 'addFish', species: 'neon_tetra' }).state;
    fed = applyAction(fed, { type: 'addFish', species: 'betta' }).state;
    expect(figures(fed).livestock.pill).toBeNull();

    const starved = { ...fed, fish: fed.fish.map((f, i) => (i === 0 ? { ...f, satiation: 0 } : f)) };
    expect(figures(starved).livestock.pill).toEqual({ text: '1 hungry', status: 'warn' });
  });

  it('counts every hungry fish, not just the first', () => {
    let fed = tank();
    for (let i = 0; i < 3; i++) {
      fed = applyAction(fed, { type: 'addFish', species: 'guppy' }).state;
    }
    // Two starving, one well fed — the pill must not stop at the first hit.
    const hungry = {
      ...fed,
      fish: fed.fish.map((f, i) => ({ ...f, satiation: i < 2 ? 5 : 90 })),
    };
    expect(figures(hungry).livestock.pill).toEqual({ text: '2 hungry', status: 'warn' });
  });
});

describe('navFigures — Analytics and Scenario', () => {
  it('says so plainly when there is no history to read', () => {
    expect(figures(tank()).analytics.lines).toEqual(['0 ticks', 'no history yet']);
  });

  it('splits elapsed time into days and hours once the run starts', () => {
    expect(figures(tank({ tick: 1622 })).analytics.lines).toEqual([
      '1622 ticks · 67 d 14 h',
      '6 alerts · 2 deaths · 18 fry',
    ]);
  });

  it('states the scenario in the reader’s own units', () => {
    expect(figures(tank()).scenario.lines).toEqual(['Planted Tank · 200 L', 'room 22°C · no lid']);
    expect(figures(tank(), 'imperial').scenario.lines[0]).toBe('Planted Tank · 53 gal');
  });
});

describe('formatMeter', () => {
  const celsius = (c: number): number => c;

  it('prints each reading at its own precision', () => {
    const meter = (key: MicroMeter['key'], value: number): MicroMeter => ({
      key,
      label: '',
      value,
      fill: 0,
      status: 'ok',
    });
    expect(formatMeter(meter('temperature', 25.44), celsius)).toBe('25.4');
    expect(formatMeter(meter('ph', 6.823), celsius)).toBe('6.82');
    expect(formatMeter(meter('water', 97.6), celsius)).toBe('98');
    expect(formatMeter(meter('nitrate', 18.63), celsius)).toBe('18.6');
  });

  it('drops the leading zero on the toxins, which have no room for it', () => {
    const meter = (key: MicroMeter['key'], value: number): MicroMeter => ({
      key,
      label: '',
      value,
      fill: 0,
      status: 'ok',
    });
    expect(formatMeter(meter('ammonia', 0.0344), celsius)).toBe('.034');
    expect(formatMeter(meter('nitrite', 0.4122), celsius)).toBe('.412');
  });
});

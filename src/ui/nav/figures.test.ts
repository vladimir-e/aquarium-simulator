import { describe, it, expect } from 'vitest';
import { formatMeter, navFigures, type MicroMeter, type NavFigure } from './figures';
import type { SectionId } from './sections';
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

  it('drops the pill entirely when a cycled tank reads clean', () => {
    const state = cycled();
    state.resources.nitrate = state.resources.water * 12; // mid safe band
    expect(figures(state).water.pill).toBeNull();
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
  it('reads plants against tank capacity, and the scape when nothing ails', () => {
    const f = figures(tank()).flora;
    expect(f.lines[0]).toBe('0 of 31 plants · no algae');
    expect(f.lines[1]).toBe('Bare');
  });

  it('names the depleted nutrient', () => {
    const state = tank();
    // Everything dosed but iron — the classic planted-tank deficiency.
    state.resources.nitrate = state.resources.water * 12;
    state.resources.phosphate = state.resources.water * 1;
    state.resources.potassium = state.resources.water * 10;
    expect(figures(state).flora.pill).toEqual({ text: 'Fe 0', status: 'warn' });
  });

  it('says so once when nothing at all is dosed, rather than naming four blanks', () => {
    expect(figures(tank()).flora.pill).toEqual({ text: 'no nutrients', status: 'warn' });
  });

  it('gives the second line to the worst plant when one is ailing', () => {
    const state = tank();
    state.plants = [plant(90), plant(20)];
    expect(figures(state).flora.lines[1]).toBe('Amazon Sword struggling');
  });

  it('keeps the scape on the second line while every plant is fine', () => {
    const state = tank();
    state.plants = [plant(90), plant(75)];
    expect(figures(state).flora.lines[1]).toBe('Bare');
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

  it('flags fish that need feeding', () => {
    let fed = tank();
    fed = applyAction(fed, { type: 'addFish', species: 'neon_tetra' }).state;
    fed = applyAction(fed, { type: 'addFish', species: 'betta' }).state;
    expect(figures(fed).livestock.pill).toBeNull();

    const starved = { ...fed, fish: fed.fish.map((f, i) => (i === 0 ? { ...f, satiation: 0 } : f)) };
    expect(figures(starved).livestock.pill).toEqual({ text: '1 hungry', status: 'warn' });
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

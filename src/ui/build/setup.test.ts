import { describe, it, expect } from 'vitest';
import {
  LID_LABEL,
  LID_TYPES,
  RESET_CONFIRM_TICKS,
  driftsFromPreset,
  environmentNotes,
  presetLoadDestroys,
  presetLoadMessage,
  resetConsequence,
  resizeConsequence,
} from './setup.js';
import { PRESETS, type PresetId } from '../../simulation/presets.js';
import { presetTank } from '../test/presetTank';
import { TICKS_PER_DAY } from '../utils/clock.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import {
  applyAction,
  calculateEvaporationRatePerDay,
  calculateTemperatureDrift,
  tick,
  type SimulationState,
} from '../../simulation/index.js';

describe('environmentNotes', () => {
  it('reports the engine’s own evaporation rate under the lid the tank has', () => {
    const state = presetTank('community');
    const expected = calculateEvaporationRatePerDay(
      state.resources.temperature,
      state.environment.roomTemperature,
      'none',
      DEFAULT_CONFIG.evaporation
    );

    expect(expected).toBeGreaterThan(0);
    expect(environmentNotes(state, DEFAULT_CONFIG, 'metric').lid).toBe(
      `${expected.toFixed(1)} %/d evaporates`
    );
  });

  it('says nothing evaporates under a sealed lid rather than 0.0 %/d', () => {
    const state = presetTank('community');
    const sealed = { ...state, equipment: { ...state.equipment, lid: { type: 'sealed' as const } } };

    expect(environmentNotes(sealed, DEFAULT_CONFIG, 'metric').lid).toBe('nothing evaporates');
  });

  it('quotes the drift the room pulls, as a difference rather than a reading', () => {
    const state = presetTank('community');
    const cold = { ...state, environment: { ...state.environment, roomTemperature: 15 } };
    const drift = Math.abs(
      calculateTemperatureDrift(
        cold.resources.temperature,
        15,
        cold.resources.water,
        DEFAULT_CONFIG.temperature
      )
    );

    expect(drift).toBeGreaterThan(0);
    expect(environmentNotes(cold, DEFAULT_CONFIG, 'metric').room).toBe(
      `the water drifts ${drift.toFixed(1)}°C/h toward it`
    );
    // A gap scales without the freezing-point offset: 1 °C of drift is 1.8 °F.
    expect(environmentNotes(cold, DEFAULT_CONFIG, 'imperial').room).toBe(
      `the water drifts ${((drift * 9) / 5).toFixed(1)}°F/h toward it`
    );
  });

  it('says so when the water is already at room temperature', () => {
    const state = presetTank('community');
    const settled = {
      ...state,
      environment: { ...state.environment, roomTemperature: state.resources.temperature },
    };

    expect(environmentNotes(settled, DEFAULT_CONFIG, 'metric').room).toBe(
      'the water is already there'
    );
  });
});

describe('resetConsequence', () => {
  it('names what survives, and stays silent about elapsed days before the first one', () => {
    const message = resetConsequence(presetTank('planted'));
    expect(message).toContain('Equipment, scape, plants and fish stay.');
    expect(message).not.toMatch(/day/);
  });

  it('counts the run’s days once there are any', () => {
    let state = presetTank('planted');
    for (let i = 0; i < 25; i++) state = tick(state, DEFAULT_CONFIG);

    expect(resetConsequence(state)).toContain('— 1 day.');
    expect(resetConsequence({ ...state, tick: 48 })).toContain('— 2 days.');
  });

  it('warns about clutches, which reset destroys and the kept list does not cover', () => {
    const state = presetTank('planted');
    const one = { ...state, clutches: [{ id: 'c1' }] as never };
    const two = { ...state, clutches: [{ id: 'c1' }, { id: 'c2' }] as never };

    expect(resetConsequence(state)).not.toContain('clutch');
    expect(resetConsequence(one)).toContain('1 clutch in the water is lost.');
    expect(resetConsequence(two)).toContain('2 clutches in the water are lost.');
  });
});

describe('presetLoadMessage', () => {
  it('leads with the tank it builds, and says nothing was there to lose', () => {
    const message = presetLoadMessage('Betta Cube', presetTank('planted'));

    expect(message).toBe('Starts “Betta Cube” as a new tank at hour zero.');
  });

  it('names the run and the life the load takes with it', () => {
    let state = applyAction(presetTank('planted'), { type: 'addFish', species: 'neon_tetra' }).state;
    state = applyAction(state, { type: 'addPlant', species: 'java_fern' }).state;
    state = { ...state, tick: 3 * TICKS_PER_DAY + 2 };

    expect(presetLoadMessage('Betta Cube', state)).toBe(
      'Starts “Betta Cube” as a new tank at hour zero. ' +
        'This one — 3d 2h · 1 fish · 1 plant — goes, water chemistry and biofilter with it.'
    );
  });

  it('counts what it names', () => {
    const state = {
      ...presetTank('planted'),
      fish: [{}, {}, {}],
      plants: [{}, {}],
    } as unknown as SimulationState;

    expect(presetLoadMessage('Betta Cube', state)).toContain('3 fish · 2 plants');
  });
});

describe('presetLoadDestroys', () => {
  it('is false for the tank a preset just built, whatever stock that preset ships', () => {
    for (const preset of PRESETS) {
      expect(presetLoadDestroys(presetTank(preset.id), preset.id)).toBe(false);
    }
  });

  it('is true once the clock has moved or the stock is not the preset’s own', () => {
    const fresh = presetTank('planted');
    const stocked = applyAction(fresh, { type: 'addFish', species: 'neon_tetra' }).state;
    const planted = applyAction(fresh, { type: 'addPlant', species: 'java_fern' }).state;

    expect(presetLoadDestroys({ ...fresh, tick: 1 }, 'planted')).toBe(true);
    expect(presetLoadDestroys(stocked, 'planted')).toBe(true);
    expect(presetLoadDestroys(planted, 'planted')).toBe(true);
  });
});

describe('RESET_CONFIRM_TICKS', () => {
  it('is 30 days on whatever a day is worth', () => {
    expect(RESET_CONFIRM_TICKS / TICKS_PER_DAY).toBe(30);
  });
});

describe('driftsFromPreset', () => {
  it('says a freshly built preset matches itself', () => {
    for (const preset of PRESETS) {
      expect(driftsFromPreset(presetTank(preset.id), preset.id)).toBe(false);
    }
  });

  it('sees equipment, environment and tank move away from the defaults', () => {
    const state = presetTank('planted');
    const drift = (next: SimulationState): boolean => driftsFromPreset(next, 'planted');

    expect(
      drift({ ...state, equipment: { ...state.equipment, lid: { type: 'sealed' } } })
    ).toBe(true);
    expect(
      drift({ ...state, environment: { ...state.environment, roomTemperature: 30 } })
    ).toBe(true);
    expect(drift({ ...state, tank: { ...state.tank, capacity: 150 } })).toBe(true);
  });

  it('cancels a change against its own undo, where a touched flag could not', () => {
    const state = presetTank('planted');
    const warmer = { ...state, environment: { ...state.environment, roomTemperature: 30 } };
    const back = {
      ...warmer,
      environment: { ...warmer.environment, roomTemperature: state.environment.roomTemperature },
    };

    expect(driftsFromPreset(warmer, 'planted')).toBe(true);
    expect(driftsFromPreset(back, 'planted')).toBe(false);
  });

  it('ignores what the engine drives on its own', () => {
    let state = presetTank('planted');
    for (let i = 0; i < 30; i++) state = tick(state, DEFAULT_CONFIG);
    expect(driftsFromPreset(state, 'planted')).toBe(false);
  });

  it('ignores stocking, because drift is a question about the equipment', () => {
    const stocked = applyAction(presetTank('planted'), { type: 'addFish', species: 'neon_tetra' }).state;
    expect(stocked.fish.length).toBe(1);
    expect(driftsFromPreset(stocked, 'planted')).toBe(false);
  });

  it('reads the tank against the preset it is being compared to, not the one it was built from', () => {
    const planted = presetTank('planted');
    const others = PRESETS.filter((p) => p.id !== 'planted').map((p) => p.id as PresetId);
    for (const id of others) {
      expect(driftsFromPreset(planted, id)).toBe(true);
    }
  });
});

describe('LID_TYPES', () => {
  it('covers every lid the label map names', () => {
    expect([...LID_TYPES].sort()).toEqual(Object.keys(LID_LABEL).sort());
  });
});

describe('resizeConsequence', () => {
  it('names the new size and everything the rebuild costs', () => {
    const said = resizeConsequence(150, 'metric');

    expect(said).toContain('Rebuilding at 150 L');
    expect(said).toContain('hour zero');
    expect(said).toMatch(/biofilter/);
    expect(resizeConsequence(150, 'imperial')).toContain('40 gal');
  });
});

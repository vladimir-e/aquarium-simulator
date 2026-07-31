import { describe, it, expect } from 'vitest';
import {
  LID_LABEL,
  RESET_CONFIRM_TICKS,
  environmentDerived,
  presetCards,
  presetRestoreMessage,
  presetSwitchMessage,
  resetConsequence,
} from './scenario.js';
import { PRESETS, getPresetById } from '../presets.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import {
  calculateEvaporationRatePerDay,
  createSimulation,
  getFilterFlow,
  getMaxPlants,
  tick,
  type SimulationState,
} from '../../simulation/index.js';
import { SurfaceResource } from '../../simulation/resources/index.js';

function built(id: string): SimulationState {
  return createSimulation(getPresetById(id as never)!.config);
}

describe('presetCards', () => {
  it('covers every preset, in the order the selector lists them', () => {
    expect(presetCards('metric').map((c) => c.id)).toEqual(PRESETS.map((p) => p.id));
  });

  it('quotes the capacity the engine actually builds, in the reader’s units', () => {
    const metric = presetCards('metric');
    const imperial = presetCards('imperial');

    expect(metric.find((c) => c.id === 'angelfish')?.volume).toBe('300 L');
    expect(imperial.find((c) => c.id === 'angelfish')?.volume).toBe('79 gal');
    expect(metric.find((c) => c.id === 'betta')?.volume).toBe('20 L');
  });

  it('describes only what the preset sets up, never stocking it does not carry', () => {
    for (const card of presetCards('metric')) {
      expect(built(card.id).fish).toHaveLength(0);
      expect(built(card.id).plants).toHaveLength(0);
      expect(card.build).not.toMatch(/fish|betta|angelfish|shoal|plant|stock/i);
    }
  });

  it('lists only the gear a preset switches on, and always says what the lid is', () => {
    const cards = presetCards('metric');
    const planted = cards.find((c) => c.id === 'planted')!;
    const bare = cards.find((c) => c.id === 'bare')!;

    expect(built('planted').equipment.heater.enabled).toBe(false);
    expect(planted.build).not.toContain('heater');
    expect(planted.build).toBe('Aqua Soil + rock + driftwood ×2 · canister filter · light · CO₂ · ATO · no lid');

    expect(bare.build).toBe('Bare · no equipment · no lid');
    expect(cards.find((c) => c.id === 'angelfish')?.build).toContain('Sand + rock ×3');
    expect(cards.find((c) => c.id === 'betta')?.build.endsWith(LID_LABEL.mesh)).toBe(true);
  });
});

describe('environmentDerived', () => {
  it('reports the engine’s evaporation rate and the lid driving it', () => {
    const state = built('community');
    const expected = calculateEvaporationRatePerDay(
      state.resources.temperature,
      state.environment.roomTemperature,
      'none',
      DEFAULT_CONFIG.evaporation
    );

    const [evaporation] = environmentDerived(state, DEFAULT_CONFIG);
    expect(expected).toBeGreaterThan(0);
    expect(evaporation.value).toBe(`${expected.toFixed(1)} %/d`);
    expect(evaporation.note).toBe('no lid');
  });

  it('says none under a sealed lid rather than 0.0 %/d', () => {
    const state = built('community');
    const sealed = { ...state, equipment: { ...state.equipment, lid: { type: 'sealed' as const } } };

    const [evaporation] = environmentDerived(sealed, DEFAULT_CONFIG);
    expect(evaporation.value).toBe('none');
    expect(evaporation.note).toBe('sealed lid');
  });

  it('reads surface, turnover and plant slots off the same engine the sections do', () => {
    const state = built('community');
    const [, surface, turnover, slots] = environmentDerived(state, DEFAULT_CONFIG);

    expect(surface.value).toBe(SurfaceResource.format(state.resources.surface));
    // 150 L on a canister: 1200 L/h ÷ 150 L.
    expect(turnover.value).toBe('8.0 ×/h');
    expect(slots.value).toBe(String(getMaxPlants(state.tank.capacity)));
    expect(slots.note).toBe('0 used');
  });

  it('does not report a turnover the tank is not getting while the filter is off', () => {
    const state = built('bare');
    const [, , turnover] = environmentDerived(state, DEFAULT_CONFIG);

    expect(getFilterFlow(state.equipment.filter.type, state.tank.capacity)).toBeGreaterThan(0);
    expect(turnover.value).toBe('none');
    expect(turnover.note).toBe('filter off');
  });
});

describe('resetConsequence', () => {
  it('names what survives, and stays silent about elapsed days before the first one', () => {
    const message = resetConsequence(built('planted'));
    expect(message).toContain('Equipment, scape, plants and fish stay.');
    expect(message).not.toMatch(/day/);
  });

  it('counts the run’s days once there are any', () => {
    let state = built('planted');
    for (let i = 0; i < 25; i++) state = tick(state, DEFAULT_CONFIG);

    expect(resetConsequence(state)).toContain('— 1 day.');
    expect(resetConsequence({ ...state, tick: 48 })).toContain('— 2 days.');
  });

  it('warns about clutches, which reset destroys and the kept list does not cover', () => {
    const state = built('planted');
    const one = { ...state, clutches: [{ id: 'c1' }] as never };
    const two = { ...state, clutches: [{ id: 'c1' }, { id: 'c2' }] as never };

    expect(resetConsequence(state)).not.toContain('clutch');
    expect(resetConsequence(one)).toContain('1 clutch in the water is lost.');
    expect(resetConsequence(two)).toContain('2 clutches in the water are lost.');
  });
});

describe('preset messages', () => {
  it('promise the run survives, and differ only in what they call the change', () => {
    const tail = 'The run is not reset — the clock, plants and fish carry over';

    expect(presetSwitchMessage('Betta Cube')).toContain(tail);
    expect(presetRestoreMessage('Betta Cube')).toContain(tail);
    expect(presetSwitchMessage('Betta Cube')).toContain('Rebuilds the tank');
    expect(presetRestoreMessage('Betta Cube')).toContain('back to the “Betta Cube” defaults');
  });
});

describe('RESET_CONFIRM_TICKS', () => {
  it('is 30 days of ticks', () => {
    expect(RESET_CONFIRM_TICKS).toBe(30 * 24);
  });
});

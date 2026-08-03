import { describe, it, expect } from 'vitest';
import {
  LID_LABEL,
  LID_TYPES,
  RESET_CONFIRM_TICKS,
  driftsFromPreset,
  environmentDerived,
  presetCards,
  presetLoadDestroys,
  presetLoadMessage,
  resetConsequence,
} from './scenario.js';
import {
  PRESETS,
  createPresetSimulation,
  getPresetById,
  type PresetId,
} from '../../simulation/presets.js';
import { TICKS_PER_DAY } from '../utils/clock.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import {
  applyAction,
  calculateEvaporationRatePerDay,
  getFilterFlow,
  getMaxPlants,
  tick,
  type SimulationState,
} from '../../simulation/index.js';
import { SurfaceResource } from '../../simulation/resources/index.js';

/** The tank the app builds for a preset — both halves of it, as `loadPreset` does. */
function built(id: string): SimulationState {
  return createPresetSimulation(getPresetById(id as never)!);
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
    // 150 L on a canister: 1200 L/h ÷ 150 L, under the 4500 L/h cap.
    expect(turnover.value).toBe('8.0 × tank volume/h');
    expect(slots.value).toBe(String(getMaxPlants(state.tank.capacity)));
    expect(slots.note).toBe('0 used');
  });

  it('reports the flow the filter actually delivers once its cap bites', () => {
    const state = built('community'); // 150 L
    const sponge = {
      ...state,
      equipment: { ...state.equipment, filter: { enabled: true, type: 'sponge' as const } },
    };
    // 150 L × 4 turnovers = 600 L/h, capped at the sponge's 300 L/h ⇒ 2.0, not 4.0.
    expect(environmentDerived(sponge, DEFAULT_CONFIG)[2].value).toBe('2.0 × tank volume/h');

    const big = built('angelfish'); // 300 L
    const hob = {
      ...big,
      equipment: { ...big.equipment, filter: { enabled: true, type: 'hob' as const } },
    };
    // 300 L × 6 = 1800 L/h, capped at the HOB's 1250 L/h ⇒ 4.2, not 6.0.
    expect(environmentDerived(hob, DEFAULT_CONFIG)[2].value).toBe('4.2 × tank volume/h');
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

describe('presetLoadMessage', () => {
  it('leads with the tank it builds, and says nothing was there to lose', () => {
    const message = presetLoadMessage('Betta Cube', built('planted'));

    expect(message).toBe('Starts “Betta Cube” as a new tank at hour zero.');
  });

  it('names the run and the life the load takes with it', () => {
    let state = applyAction(built('planted'), { type: 'addFish', species: 'neon_tetra' }).state;
    state = applyAction(state, { type: 'addPlant', species: 'java_fern' }).state;
    state = { ...state, tick: 3 * TICKS_PER_DAY + 2 };

    expect(presetLoadMessage('Betta Cube', state)).toBe(
      'Starts “Betta Cube” as a new tank at hour zero. ' +
        'This one — 3d 2h · 1 fish · 1 plant — goes, water chemistry and biofilter with it.'
    );
  });

  it('counts what it names', () => {
    const state = {
      ...built('planted'),
      fish: [{}, {}, {}],
      plants: [{}, {}],
    } as unknown as SimulationState;

    expect(presetLoadMessage('Betta Cube', state)).toContain('3 fish · 2 plants');
  });
});

describe('presetLoadDestroys', () => {
  it('is false only for a tank with no clock on it and nothing living in it', () => {
    const fresh = built('planted');
    const stocked = applyAction(fresh, { type: 'addFish', species: 'neon_tetra' }).state;
    const planted = applyAction(fresh, { type: 'addPlant', species: 'java_fern' }).state;

    expect(presetLoadDestroys(fresh)).toBe(false);
    expect(presetLoadDestroys({ ...fresh, tick: 1 })).toBe(true);
    expect(presetLoadDestroys(stocked)).toBe(true);
    expect(presetLoadDestroys(planted)).toBe(true);
  });

  it('agrees with the message about whether there is anything to say', () => {
    for (const state of [built('planted'), { ...built('planted'), tick: 40 }]) {
      const named = presetLoadMessage('Betta Cube', state).includes('goes');
      expect(named).toBe(presetLoadDestroys(state));
    }
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
      expect(driftsFromPreset(built(preset.id), preset.id)).toBe(false);
    }
  });

  it('sees equipment, environment and tank move away from the defaults', () => {
    const state = built('planted');
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
    const state = built('planted');
    const warmer = { ...state, environment: { ...state.environment, roomTemperature: 30 } };
    const back = {
      ...warmer,
      environment: { ...warmer.environment, roomTemperature: state.environment.roomTemperature },
    };

    expect(driftsFromPreset(warmer, 'planted')).toBe(true);
    expect(driftsFromPreset(back, 'planted')).toBe(false);
  });

  it('ignores what the engine drives on its own', () => {
    let state = built('planted');
    for (let i = 0; i < 30; i++) state = tick(state, DEFAULT_CONFIG);
    expect(driftsFromPreset(state, 'planted')).toBe(false);
  });

  it('ignores stocking, which no preset carries and no restore returns', () => {
    const stocked = applyAction(built('planted'), { type: 'addFish', species: 'neon_tetra' }).state;
    expect(stocked.fish.length).toBe(1);
    expect(driftsFromPreset(stocked, 'planted')).toBe(false);
  });

  it('reads the tank against the preset it is being compared to, not the one it was built from', () => {
    const planted = built('planted');
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

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { NITRATE_EDGE, OXYGEN_EDGE } from '../../simulation/livestock/tolerance.js';
import { applyAction, createSimulation, type SimulationState } from '../../simulation/index.js';
import { getMassFromPpm } from '../../simulation/resources/index.js';
import { readTank } from '../readings';
import { snapshotFromState } from '../run';
import { ALERT_IDS, activeNeeds, needySections, type Need } from './needs.js';
import { gutAt } from '../test/gut';
import { hungerLine, type Fish } from '../../simulation/index.js';
import { livestockDefaults } from '../../simulation/config/livestock.js';

const base = createSimulation({ tankCapacity: 40 });

function needs(state: SimulationState): Need[] {
  const book = readTank({
    state,
    config: DEFAULT_CONFIG,
    history: [snapshotFromState(state)],
    units: 'metric',
  });
  return activeNeeds(state, book);
}

function withAlerts(
  flags: Partial<SimulationState['alertState']>,
  state: SimulationState = base
): SimulationState {
  return { ...state, alertState: { ...state.alertState, ...flags } };
}

function stocked(fullness: number, fish: Partial<Fish> = {}): SimulationState {
  let state = base;
  for (let i = 0; i < 3; i++) state = applyAction(state, { type: 'addFish', species: 'neon_tetra' }).state;
  return produce(state, (draft) => {
    for (const f of draft.fish) Object.assign(f, { gut: gutAt(fullness, f.mass), health: 100, ...fish });
  });
}

const BANKED = { surplus: livestockDefaults.surplusCap };

describe('activeNeeds', () => {
  it('says nothing about a tank with nothing latched', () => {
    expect(needs(base)).toEqual([]);
  });

  it('names what the engine has latched, the water before the bloom', () => {
    const state = withAlerts({ film: true, highNitrite: true, highAmmonia: true });

    expect(needs(state).map((need) => need.text)).toEqual(['NH₃ high', 'NO₂ high', 'Film bloom']);
  });

  it('takes each need’s tone and figure from the reading it names', () => {
    const state = withAlerts(
      { lowOxygen: true, highNitrate: true },
      produce(base, (draft) => {
        draft.resources.oxygen = OXYGEN_EDGE - 1;
        draft.resources.nitrate = getMassFromPpm(NITRATE_EDGE + 20, draft.resources.water);
      })
    );
    const [oxygen, nitrate] = needs(state);

    expect([oxygen.tone, nitrate.tone]).toEqual(['alert', 'alert']);
    expect(nitrate.figure).toBe(`${(NITRATE_EDGE + 20).toFixed(1)} ppm`);
  });

  it('lists the worst tone first, whatever order the needs are written in', () => {
    const state = withAlerts(
      { highNitrite: true, film: true },
      produce(base, (draft) => {
        draft.algae.film.mass = 95;
      })
    );

    expect(needs(state).map((need) => [need.text, need.tone])).toEqual([
      ['Film bloom', 'alert'],
      ['NO₂ high', 'warn'],
    ]);
  });

  it('stays quiet while their banks heal what hunger charges', () => {
    expect(needs(stocked(hungerLine(1, livestockDefaults) / 2, BANKED))).toEqual([]);
    expect(needs(stocked(0, BANKED))).toEqual([]);
    expect(needs(stocked(1))).toEqual([]);
  });

  it('asks for a feeding once hunger outruns what their banks heal', () => {
    const [starving] = needs(stocked(0, { surplus: 0 }));

    expect(starving).toMatchObject({ text: 'Fish starving', tone: 'alert', act: 'feed', figure: '3 of 3' });
  });

  it('does not let a starving fish hide one sick of something a feeding will not answer', () => {
    const state = produce(stocked(1, { surplus: 0 }), (draft) => {
      draft.fish[0].gut = 0;
      draft.resources.ammonia = 10 * draft.resources.water;
    });
    const [sick] = needs(state);

    expect(sick).toMatchObject({ text: 'Fish sick', verb: 'Inspect', figure: '3 of 3' });
    expect(sick.act).toBeUndefined();
  });

  it('sends each need to the section that answers it, in its worst tone', () => {
    const state = withAlerts(
      { lowOxygen: true, film: true },
      produce(base, (draft) => {
        draft.resources.oxygen = OXYGEN_EDGE - 1;
      })
    );

    expect(needySections(needs(state))).toEqual(
      new Map([
        ['water', 'alert'],
        ['life', 'warn'],
      ])
    );
  });

  it('gives each kind of bloom its own need, answered by its own verb', () => {
    const state = withAlerts({ greenWater: true, film: true });

    expect(needs(state).map((need) => [need.text, need.act])).toEqual([
      ['Green water bloom', 'waterChange'],
      ['Film bloom', 'scrubAlgae'],
    ]);
  });
});

describe('ALERT_IDS', () => {
  it('speaks for every alert the engine latches, and for no other', () => {
    expect([...ALERT_IDS].sort()).toEqual(Object.keys(base.alertState).sort());
  });
});

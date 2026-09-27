import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { NITRATE_EDGE, OXYGEN_EDGE } from '../../simulation/livestock/tolerance.js';
import { applyAction, createSimulation, type SimulationState } from '../../simulation/index.js';
import { getMassFromPpm } from '../../simulation/resources/index.js';
import { readTank } from '../readings';
import { snapshotFromState } from '../run';
import { ALERT_IDS, activeNeeds, needySections, type Need } from './needs.js';

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

function stocked(satiation: number): SimulationState {
  let state = base;
  for (let i = 0; i < 3; i++) state = applyAction(state, { type: 'addFish', species: 'neon_tetra' }).state;
  return produce(state, (draft) => {
    for (const fish of draft.fish) fish.satiation = satiation;
  });
}

describe('activeNeeds', () => {
  it('says nothing about a tank with nothing latched', () => {
    expect(needs(base)).toEqual([]);
  });

  it('names what the engine has latched, the water before the bloom', () => {
    const state = withAlerts({ highAlgae: true, highNitrite: true, highAmmonia: true });

    expect(needs(state).map((need) => need.text)).toEqual(['NH₃ high', 'NO₂ high', 'Algae bloom']);
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
      { highNitrite: true, highAlgae: true },
      produce(base, (draft) => {
        draft.algae.film.mass = 95;
      })
    );

    expect(needs(state).map((need) => [need.text, need.tone])).toEqual([
      ['Algae bloom', 'alert'],
      ['NO₂ high', 'warn'],
    ]);
  });

  it('asks for a feeding once fish go hungry, louder once they starve', () => {
    const [hungry] = needs(stocked(25));
    const [starving] = needs(stocked(2));

    expect(hungry).toMatchObject({ text: 'Fish hungry', tone: 'warn', act: 'feed', figure: '3 of 3' });
    expect(starving).toMatchObject({ text: 'Fish starving', tone: 'alert', act: 'feed' });
    expect(needs(stocked(70))).toEqual([]);
  });

  it('sends each need to the section that answers it, in its worst tone', () => {
    const state = withAlerts(
      { lowOxygen: true, highAlgae: true },
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
});

describe('ALERT_IDS', () => {
  it('speaks for every alert the engine latches, and for no other', () => {
    expect([...ALERT_IDS].sort()).toEqual(Object.keys(base.alertState).sort());
  });
});

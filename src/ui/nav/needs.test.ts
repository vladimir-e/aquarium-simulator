import { describe, it, expect } from 'vitest';
import { createSimulation } from '../../simulation/index.js';
import { activeNeeds, needySections } from './needs.js';

const base = createSimulation({ tankCapacity: 40 });

function withAlerts(flags: Partial<typeof base.alertState>): typeof base {
  return { ...base, alertState: { ...base.alertState, ...flags } };
}

describe('activeNeeds', () => {
  it('says nothing about a tank with nothing latched', () => {
    expect(activeNeeds(base)).toEqual([]);
  });

  it('names what the engine has latched, worst first', () => {
    const state = withAlerts({ highAlgae: true, highNitrite: true, highAmmonia: true });

    expect(activeNeeds(state).map((need) => need.text)).toEqual([
      'NH₃ high',
      'NO₂ high',
      'Algae bloom',
    ]);
  });

  it('sends each need to the section that answers it', () => {
    const state = withAlerts({ lowOxygen: true, highAlgae: true });

    expect(needySections(activeNeeds(state))).toEqual(new Set(['water', 'life']));
  });
});

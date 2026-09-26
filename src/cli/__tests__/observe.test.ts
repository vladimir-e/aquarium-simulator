import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { createSimulation, type SimulationState } from '../../simulation/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { classifyVital } from '../../ui/run/index.js';
import { renderObserve } from '../format.js';
import { SESSION_VERSION } from '../session.js';

function observe(state: SimulationState): string {
  return renderObserve({
    version: SESSION_VERSION,
    createdAt: '',
    config: DEFAULT_CONFIG,
    state,
    history: [],
  });
}

function line(text: string, prefix: string): string {
  return text.split('\n').find((row) => row.startsWith(prefix))!;
}

describe('renderObserve', () => {
  it('marks a reading wherever the console tints it', () => {
    const tank = createSimulation({ tankCapacity: 100 });
    const ppm = (value: number): number => value * tank.resources.water;

    for (const nitrate of [0, 20, 200]) {
      const text = observe(produce(tank, (draft) => void (draft.resources.nitrate = ppm(nitrate))));
      const tinted = classifyVital('nitrate', nitrate) !== 'ok';
      expect(line(text, '- NO3:').endsWith(' !')).toBe(tinted);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { applyAction, createSimulation, type SimulationState } from '../../simulation/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import { classifyVital, dailyLightReading, plantRows, readFish } from '../../ui/run/index.js';
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

  it('counts the fish and plants the console calls sick, and nothing it does not', () => {
    const stocked = ['addFish', 'addFish', 'addPlant'].reduce(
      (state, type) =>
        applyAction(
          state,
          type === 'addFish'
            ? { type: 'addFish', species: 'neon_tetra' }
            : { type: 'addPlant', species: 'java_fern' }
        ).state,
      createSimulation({ tankCapacity: 100 })
    );
    const failing = produce(stocked, (draft) => {
      draft.resources.ammonia = 20 * draft.resources.water;
      draft.equipment.light.enabled = false;
      draft.resources.lightByHour.fill(0);
    });

    for (const state of [stocked, failing]) {
      const text = observe(state);
      const count = (readings: { sick: boolean }[]): string => {
        const n = readings.filter((reading) => reading.sick).length;
        return n > 0 ? ` · ${n} sick` : '';
      };

      expect(line(text, '**Fish').endsWith(`%${count(readFish(state, DEFAULT_CONFIG))}`)).toBe(true);
      expect(line(text, '**Plants').endsWith(`%${count(plantRows(state, DEFAULT_CONFIG))}`)).toBe(true);
    }
    expect(line(observe(failing), '**Fish')).toContain('2 sick');
    expect(line(observe(failing), '**Plants')).toContain('1 sick');
  });

  it('prints the day of light the plants starve on, marked where the console tints it', () => {
    const planted = applyAction(createSimulation({ tankCapacity: 100 }), {
      type: 'addPlant',
      species: 'java_fern',
    }).state;
    const dark = produce(planted, (draft) => void draft.resources.lightByHour.fill(0));

    for (const state of [planted, dark]) {
      const reading = dailyLightReading(state);
      const light = line(observe(state), '**Light**');

      expect(light).toContain(`daily ${reading.text}`);
      expect(light.endsWith(' !')).toBe(reading.status === 'warn' || reading.status === 'alert');
    }
  });
});

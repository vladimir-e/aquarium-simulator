import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { applyAction, createSimulation, type Action, type SimulationState } from '../../simulation/index.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';
import {
  classifyVital,
  dailyLightReading,
  plantRows,
  readFish,
  readHourAhead,
} from '../../ui/run/index.js';
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

  it('counts the sick flags the console reads, for fish and plants', () => {
    const stocking: Action[] = [
      { type: 'addFish', species: 'neon_tetra' },
      { type: 'addFish', species: 'neon_tetra' },
      { type: 'addPlant', species: 'java_fern' },
    ];
    const stocked = stocking.reduce(
      (state, action) => applyAction(state, action).state,
      createSimulation({ tankCapacity: 100 })
    );
    const failing = produce(stocked, (draft) => {
      draft.resources.ammonia = 20 * draft.resources.water;
      draft.equipment.light.enabled = false;
      draft.resources.lightByHour.fill(0);
    });
    const ahead = readHourAhead(failing, DEFAULT_CONFIG);
    const fish = readFish(failing, DEFAULT_CONFIG, ahead).filter((read) => read.sick).length;
    const plants = plantRows(failing, DEFAULT_CONFIG, ahead).filter((row) => row.sick).length;
    expect(fish).toBeGreaterThan(0);
    expect(plants).toBeGreaterThan(0);

    const text = observe(failing);
    expect(line(text, '**Fish').endsWith(`% · ${fish} sick`)).toBe(true);
    expect(line(text, '**Plants').endsWith(`% · ${plants} sick`)).toBe(true);

    const healthy = observe(stocked);
    expect(line(healthy, '**Fish')).not.toContain(' sick');
    expect(line(healthy, '**Plants')).not.toContain(' sick');
  });

  it('prints the day of light the plants starve on, marked where the console tints it', () => {
    const planted = applyAction(createSimulation({ tankCapacity: 100 }), {
      type: 'addPlant',
      species: 'java_fern',
    }).state;
    const dark = produce(planted, (draft) => void draft.resources.lightByHour.fill(0));

    for (const state of [planted, dark]) {
      const reading = dailyLightReading(readHourAhead(state, DEFAULT_CONFIG));
      const light = line(observe(state), '**Light**');

      expect(light).toContain(`daily ${reading.text}`);
      expect(light.endsWith(' !')).toBe(reading.status === 'warn' || reading.status === 'alert');
    }
  });
});

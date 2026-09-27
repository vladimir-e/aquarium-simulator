import { describe, it, expect } from 'vitest';
import { ALGAE_KINDS, createSimulation } from '../../simulation/index.js';
import { getPresetById } from '../../simulation/presets.js';
import { renderTrace, TRACE_FIELDS } from '../format.js';
import { snapshot } from '../history.js';

const state = createSimulation(getPresetById('bare')!.config);
const history = [snapshot(state)];

const snakeCase = (key: string): string => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

describe('trace fields', () => {
  it('renders every field it publishes', () => {
    const csv = renderTrace(history, { fields: [...TRACE_FIELDS] });
    const [header, row] = csv.split('\n');
    expect(header?.split(',')).toEqual(TRACE_FIELDS);
    expect(row?.split(',').every((cell) => cell !== '')).toBe(true);
  });

  it('publishes every field the snapshot carries', () => {
    const entry = history[0]!;
    const groups = [
      [entry.resources, ''],
      [entry.fish, 'fish_'],
      [entry.plants, 'plant_'],
      ...ALGAE_KINDS.map((kind) => [entry.algae[kind], `${snakeCase(kind)}_`] as const),
    ] as const;
    for (const [group, prefix] of groups) {
      for (const key of Object.keys(group)) {
        expect(TRACE_FIELDS).toContain(`${prefix}${snakeCase(key)}`);
      }
    }
  });

  it('refuses a field it does not have, rather than a column of blanks', () => {
    expect(() => renderTrace(history, { fields: ['ph', 'nonsense'] })).toThrow(
      /Unknown trace field "nonsense"/
    );
  });

  it('names the valid fields when it refuses one', () => {
    expect(() => renderTrace(history, { fields: ['no3'] })).toThrow(/no3_ppm/);
  });

  it('refuses on an empty history, where no row would catch it', () => {
    expect(() => renderTrace([], { fields: ['nonsense'] })).toThrow(/Unknown trace field/);
  });

  it('traces each kind of bloom the snapshot records, a column per figure', () => {
    const bloom = snapshot({
      ...state,
      algae: { greenWater: { mass: 12.5, condition: 90, surplus: 3.25 }, film: { mass: 40, condition: 100, surplus: 1 } },
    });
    const csv = renderTrace([bloom], { fields: ['green_water_mass', 'green_water_surplus', 'film_mass'] });
    expect(csv).toBe(`tick,green_water_mass,green_water_surplus,film_mass\n${bloom.tick},12.5,3.25,40`);
  });
});

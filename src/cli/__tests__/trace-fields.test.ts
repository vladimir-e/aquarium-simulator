import { describe, it, expect } from 'vitest';
import { createSimulation } from '../../simulation/index.js';
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
      ['resources', ''],
      ['fish', 'fish_'],
      ['plants', 'plant_'],
      ['algae', 'algae_'],
    ] as const;
    for (const [group, prefix] of groups) {
      for (const key of Object.keys(entry[group])) {
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

  it('traces the algae the snapshot records', () => {
    const bloom = snapshot({ ...state, algae: { ...state.algae, mass: 12.5, surplus: 3.25 } });
    const csv = renderTrace([bloom], { fields: ['algae_mass', 'algae_surplus'] });
    expect(csv).toBe(`tick,algae_mass,algae_surplus\n${bloom.tick},12.5,3.25`);
  });
});

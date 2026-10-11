import { describe, it, expect } from 'vitest';
import { bloomAt } from '../../simulation/tests/blooms.js';
import { ALGAE_KINDS, createSimulation } from '../../simulation/index.js';
import { getPresetById } from '../../simulation/presets.js';
import { renderTrace, TRACE_FIELDS } from '../format.js';
import { snapshot } from '../history.js';
import { snakeCase } from '../names.js';
import { DEFAULT_CONFIG } from '../../simulation/config/index.js';

const state = createSimulation(getPresetById('bare')!.config);
const history = [snapshot(state, DEFAULT_CONFIG)];

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

  it('traces each kind of bloom the snapshot records, a column per figure, its reserve as a density', () => {
    const bloom = snapshot(
      {
        ...state,
        algae: { greenWater: bloomAt(state, 'greenWater', 12.5, 90), film: bloomAt(state, 'film', 40) },
      },
      DEFAULT_CONFIG
    );
    const fields = ['green_water_coverage', 'green_water_condition', 'green_water_reserve', 'film_coverage'];
    expect(renderTrace([bloom], { fields })).toBe(`tick,${fields.join(',')}\n${bloom.tick},12.5,90,1,40`);
  });
});

import { describe, it, expect } from 'vitest';
import { createSimulation } from '../../simulation/index.js';
import { getPresetById } from '../../simulation/presets.js';
import { renderTrace, TRACE_FIELDS } from '../format.js';
import { snapshot } from '../history.js';

const history = [snapshot(createSimulation(getPresetById('bare')!.config))];

describe('trace fields', () => {
  it('renders every field it publishes', () => {
    const csv = renderTrace(history, { fields: [...TRACE_FIELDS] });
    const [header, row] = csv.split('\n');
    expect(header?.split(',')).toEqual(TRACE_FIELDS);
    expect(row?.split(',').every((cell) => cell !== '')).toBe(true);
  });

  // A blank column reads as "no value here", not "you typed the name wrong",
  // and a calibration run is exactly where that goes unnoticed.
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
    const csv = renderTrace(history, { fields: ['algae_mass', 'algae_surplus'] });
    expect(csv.split('\n')[0]).toBe('tick,algae_mass,algae_surplus');
  });
});

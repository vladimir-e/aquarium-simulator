import { describe, it, expect } from 'vitest';
import { searchTunables, tunableSections } from './tunables.js';
import {
  DEFAULT_CONFIG,
  countModified,
  withTunable,
  type TunableConfig,
} from '../../simulation/config/index.js';

const sections = (config: TunableConfig = DEFAULT_CONFIG): ReturnType<typeof tunableSections> =>
  tunableSections(config);

describe('tunableSections', () => {
  it('covers every section the config has, in the order it holds them', () => {
    expect(sections().map((section) => section.key)).toEqual(Object.keys(DEFAULT_CONFIG));
  });

  it('reaches every leaf the badge counts, nested formulae included', () => {
    const leaves = sections().flatMap((section) => [
      ...section.fields,
      ...section.groups.flatMap((group) => group.fields),
    ]);
    const tuned = leaves.reduce(
      (config, field) => withTunable(config, field.path, field.value + 1),
      DEFAULT_CONFIG
    );

    expect(countModified(tuned)).toBe(leaves.length);
  });

  it('reads each leaf off the config it is given, and says which have moved', () => {
    const tuned = withTunable(DEFAULT_CONFIG, 'nutrients.fertilizerFormula.iron', 0.5);
    const nutrients = sections(tuned).find((section) => section.key === 'nutrients')!;
    const iron = nutrients.groups[0].fields.find((field) => field.path.endsWith('iron'))!;

    expect(iron.value).toBe(0.5);
    expect(iron.modified).toBe(true);
    expect(nutrients.modified).toBe(1);
    expect(nutrients.fields.every((field) => !field.modified)).toBe(true);
  });

  it('carries the range a leaf declares, and none where the engine declares none', () => {
    const list = sections();
    const optics = list.find((section) => section.key === 'optics')!;
    const nitrogen = list.find((section) => section.key === 'nitrogenCycle')!;

    expect(optics.fields[0].range).toBeDefined();
    expect(nitrogen.fields.some((field) => field.range === undefined)).toBe(true);
  });
});

describe('searchTunables', () => {
  it('leaves the whole set standing on an empty term', () => {
    expect(searchTunables(sections(), '  ')).toEqual(sections());
  });

  it('keeps only the fields a term names, and the sections holding them', () => {
    const found = searchTunables(sections(), 'iron');

    expect(found.map((section) => section.key)).toEqual(['nutrients']);
    expect(found[0].groups[0].fields.map((field) => field.path)).toEqual([
      'nutrients.fertilizerFormula.iron',
    ]);
  });

  it('matches the path as well as the label, so a constant is findable by its key', () => {
    const found = searchTunables(sections(), 'bacteriaPerCm2');
    expect(found.map((section) => section.key)).toEqual(['nitrogenCycle']);
  });

  it('keeps a section’s own modified count whatever the search hides', () => {
    const tuned = withTunable(DEFAULT_CONFIG, 'decay.q10', 2.5);
    const found = searchTunables(sections(tuned), 'reference temperature');

    expect(found[0].fields.map((field) => field.path)).toEqual(['decay.referenceTemp']);
    expect(found[0].modified).toBe(1);
  });
});

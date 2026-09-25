/**
 * The engine's constants as the drawer shows them: the config layer's own
 * sections, in its own order, each leaf carrying the range it declares and
 * whether it has been moved off stock. A nested formula is a group inside its
 * section, so the four fertiliser figures are reachable like any other.
 */

import {
  DEFAULT_CONFIG,
  algaeVitalityConfigMeta,
  configRange,
  decayConfigMeta,
  evaporationConfigMeta,
  fertilizerFormulaMeta,
  gasExchangeConfigMeta,
  livestockConfigMeta,
  nitrogenCycleConfigMeta,
  nutrientsConfigMeta,
  opticsConfigMeta,
  waterChemistryConfigMeta,
  plantsConfigMeta,
  temperatureConfigMeta,
  tunableAt,
  type ConfigRange,
  type TunableConfig,
} from '../../simulation/config/index.js';

interface FieldMeta {
  key: string;
  label: string;
  unit: string;
  step: number;
}

export interface TunableField {
  path: string;
  label: string;
  unit: string;
  step: number;
  value: number;
  /** Absent where the leaf declares no bounds — the nitrogen rates. */
  range?: ConfigRange;
  modified: boolean;
}

/** A nested formula, rendered as a sub-group of the section that holds it. */
export interface TunableGroup {
  label: string;
  fields: TunableField[];
}

export interface TunableSection {
  key: keyof TunableConfig;
  label: string;
  fields: TunableField[];
  groups: TunableGroup[];
  /** Leaves of this section standing off stock, formula included. */
  modified: number;
}

interface SectionSpec {
  key: keyof TunableConfig;
  label: string;
  meta: readonly FieldMeta[];
  groups?: { key: string; label: string; meta: readonly FieldMeta[] }[];
}

const SECTIONS: readonly SectionSpec[] = [
  { key: 'decay', label: 'Decay', meta: decayConfigMeta },
  { key: 'nitrogenCycle', label: 'Nitrogen cycle', meta: nitrogenCycleConfigMeta },
  { key: 'gasExchange', label: 'Gas exchange', meta: gasExchangeConfigMeta },
  { key: 'temperature', label: 'Temperature', meta: temperatureConfigMeta },
  { key: 'evaporation', label: 'Evaporation', meta: evaporationConfigMeta },
  { key: 'algae', label: 'Algae', meta: algaeVitalityConfigMeta },
  { key: 'optics', label: 'Water optics', meta: opticsConfigMeta },
  { key: 'waterChemistry', label: 'Water chemistry', meta: waterChemistryConfigMeta },
  { key: 'plants', label: 'Plants', meta: plantsConfigMeta },
  {
    key: 'nutrients',
    label: 'Nutrients',
    meta: nutrientsConfigMeta,
    groups: [
      { key: 'fertilizerFormula', label: 'Fertiliser formula', meta: fertilizerFormulaMeta },
    ],
  },
  { key: 'livestock', label: 'Livestock', meta: livestockConfigMeta },
];

function field(config: TunableConfig, prefix: string, meta: FieldMeta): TunableField {
  const path = `${prefix}.${meta.key}`;
  return {
    path,
    label: meta.label,
    unit: meta.unit,
    step: meta.step,
    value: tunableAt(config, path) ?? 0,
    range: configRange(path),
    modified: tunableAt(config, path) !== tunableAt(DEFAULT_CONFIG, path),
  };
}

export function tunableSections(config: TunableConfig): TunableSection[] {
  return SECTIONS.map((spec) => {
    const fields = spec.meta.map((meta) => field(config, spec.key, meta));
    const groups = (spec.groups ?? []).map((group) => ({
      label: group.label,
      fields: group.meta.map((meta) => field(config, `${spec.key}.${group.key}`, meta)),
    }));
    const modified = [...fields, ...groups.flatMap((group) => group.fields)].filter(
      (entry) => entry.modified
    ).length;

    return { key: spec.key, label: spec.label, fields, groups, modified };
  });
}

function matches(entry: TunableField, query: string): boolean {
  return `${entry.label} ${entry.path}`.toLowerCase().includes(query);
}

/**
 * The sections a search term leaves standing, each down to the fields that
 * match. A section keeps its own modified count whatever the search hides,
 * because its reset still resets all of it.
 */
export function searchTunables(sections: TunableSection[], query: string): TunableSection[] {
  const term = query.trim().toLowerCase();
  if (term === '') return sections;

  return sections
    .map((section) => ({
      ...section,
      fields: section.fields.filter((entry) => matches(entry, term)),
      groups: section.groups
        .map((group) => ({ ...group, fields: group.fields.filter((entry) => matches(entry, term)) }))
        .filter((group) => group.fields.length > 0),
    }))
    .filter((section) => section.fields.length > 0 || section.groups.length > 0);
}

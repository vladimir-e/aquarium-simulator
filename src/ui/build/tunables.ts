/**
 * The engine's constants as the drawer shows them: the config layer's own
 * sections, in its own order, each leaf carrying the range it declares and
 * whether it has been moved off stock. A nested formula is a group inside its
 * section, so the four fertiliser figures are reachable like any other; a
 * long section's own fields are grouped by what they tune.
 */

import {
  DEFAULT_CONFIG,
  algaeConfigMeta,
  configRange,
  decayConfigMeta,
  evaporationConfigMeta,
  fertilizerFormulaMeta,
  rootTabMeta,
  nutrientsConfigMeta,
  halfSaturationMeta,
  demandMeta,
  foodMineralContentMeta,
  gasExchangeConfigMeta,
  livestockConfigMeta,
  loadRateMeta,
  nitrogenCycleConfigMeta,
  opticsConfigMeta,
  waterChemistryConfigMeta,
  plantsConfigMeta,
  quotaMinMeta,
  quotaMaxMeta,
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

/** A nested formula, or a run of the section's own fields, rendered as a sub-group of the section. */
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

interface GroupSpec {
  label: string;
  /** The nested formula it holds; absent, its fields are the section's own. */
  path?: string;
  meta: readonly FieldMeta[];
}

interface SectionSpec {
  key: keyof TunableConfig;
  label: string;
  /** The section's own fields that sit in no group. */
  meta: readonly FieldMeta[];
  groups?: GroupSpec[];
}

/** A run of a section's own fields, by key. */
interface FieldRun<K extends string> {
  label: string;
  keys: readonly K[];
}

/** A section's own fields split into the runs its groups name, in their order, and the rest. */
function grouped<M extends FieldMeta>(
  meta: readonly M[],
  groups: readonly (FieldRun<M['key']> | GroupSpec)[]
): Pick<SectionSpec, 'meta' | 'groups'> {
  const runs = groups.filter((group): group is FieldRun<M['key']> => 'keys' in group);
  const named = new Set<string>(runs.flatMap((run) => run.keys));
  return {
    meta: meta.filter((m) => !named.has(m.key)),
    groups: groups.map((group) =>
      'keys' in group ? { label: group.label, meta: group.keys.map((key) => meta.find((m) => m.key === key)!) } : group
    ),
  };
}

const PLANTS = grouped(plantsConfigMeta, [
  { label: 'Energy budget', keys: ['somaShare', 'growthEfficiency', 'reserveCapacity', 'healingRate', 'healingCost'] },
  { label: 'Nutrient stores', keys: ['storeFillDays', 'droopEdge', 'nutrientDeficiencySeverity'] },
  { path: 'quotaMin', label: 'Tissue floor, Q_min', meta: quotaMinMeta },
  { path: 'quotaMax', label: 'Tissue ceiling, Q_max', meta: quotaMaxMeta },
  {
    label: 'Harm',
    keys: [
      'starvationSeverity',
      'lightExcessiveSeverity',
      'temperatureStressSeverity',
      'phStressSeverity',
      'ghStressSeverity',
      'nitrateStressSeverity',
      'nitrateEdge',
    ],
  },
  { label: 'Income', keys: ['co2BenefitPeak', 'temperatureBenefitPeak', 'phBenefitPeak'] },
  { label: 'Shedding', keys: ['maxSheddingRate'] },
]);

const OPTICS = grouped(opticsConfigMeta, [
  { label: 'Blooms', keys: ['algaeAttenuationPerCm', 'algaeCoatOpticalDepth'] },
]);

const SECTIONS: readonly SectionSpec[] = [
  { key: 'decay', label: 'Decay', meta: decayConfigMeta },
  { key: 'nitrogenCycle', label: 'Nitrogen cycle', meta: nitrogenCycleConfigMeta },
  { key: 'gasExchange', label: 'Gas exchange', meta: gasExchangeConfigMeta },
  { key: 'temperature', label: 'Temperature', meta: temperatureConfigMeta },
  { key: 'evaporation', label: 'Evaporation', meta: evaporationConfigMeta },
  { key: 'algae', label: 'Algae', meta: algaeConfigMeta },
  { key: 'optics', label: 'Water optics', ...OPTICS },
  { key: 'waterChemistry', label: 'Water chemistry', meta: waterChemistryConfigMeta },
  { key: 'plants', label: 'Plants', ...PLANTS },
  {
    key: 'nutrients',
    label: 'Nutrients',
    meta: nutrientsConfigMeta,
    groups: [
      { path: 'fertilizerFormula', label: 'Fertiliser formula', meta: fertilizerFormulaMeta },
      { path: 'rootTab', label: 'Root tab', meta: rootTabMeta },
      { path: 'halfSaturation', label: 'Half-saturation', meta: halfSaturationMeta },
      { path: 'demand.low', label: 'Low-demand species', meta: demandMeta },
      { path: 'demand.medium', label: 'Medium-demand species', meta: demandMeta },
      { path: 'demand.high', label: 'High-demand species', meta: demandMeta },
      { path: 'foodMineralContent', label: 'Minerals per gram of food', meta: foodMineralContentMeta },
    ],
  },
  {
    key: 'livestock',
    label: 'Livestock',
    meta: livestockConfigMeta,
    groups: [{ path: 'loadRate', label: 'Toxin load', meta: loadRateMeta }],
  },
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
      fields: group.meta.map((meta) => field(config, group.path ? `${spec.key}.${group.path}` : spec.key, meta)),
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

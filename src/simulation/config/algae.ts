/**
 * Algae tunable configuration. The bloom runs on the plants' constants — its
 * light curve, income peaks, severities, bank, healing, growth draw and
 * shedding are `PlantsConfig`'s — and what a kind of bloom is sits in its
 * traits (`algae/traits.ts`). What lives here is what thriving plants do to
 * any bloom.
 */

export interface AlgaeConfig {
  /**
   * Damage per rate unit of thriving plant per litre: the allelochemicals a
   * healthy planting leaks.
   */
  allelopathySeverity: number;
}

export const algaeDefaults: AlgaeConfig = {
  // A healthy planting of 0.1 rate units per litre — a well-planted tank —
  // charges 0.05 %/h before hardiness, half what a fed bloom earns averaged
  // over a lit day.
  allelopathySeverity: 0.5,
};

export interface AlgaeConfigMeta {
  key: keyof AlgaeConfig;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export const algaeConfigMeta: AlgaeConfigMeta[] = [
  { key: 'allelopathySeverity', label: 'Allelopathy Severity', unit: '%/(unit/L)/hr', min: 0, max: 20, step: 0.5 },
];

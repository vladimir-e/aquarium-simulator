/**
 * Algae tunable configuration. The bloom runs on the plants' constants — its
 * light curve, budget, income peaks, severities, healing and shedding are
 * `PlantsConfig`'s — and what a kind of bloom is sits in its
 * traits (`algae/traits.ts`). What lives here is what thriving plants do to
 * any bloom.
 */

export interface AlgaeConfig {
  /**
   * Litres per rate unit of thriving plant: the allelochemicals a healthy
   * planting leaks halve a bloom's assimilation at a dose of its inverse.
   */
  allelopathySeverity: number;
}

export const algaeDefaults: AlgaeConfig = {
  // Tune's: nothing measures a tank's exudates. A well-planted tank's 0.1 rate
  // units a litre halves what a bloom assimilates, and a 75 gal community's few
  // easy plants take a quarter, so kept planted water stays clear or hazy while
  // a climbing doser still tips a high-tech tank.
  allelopathySeverity: 10,
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
  { key: 'allelopathySeverity', label: 'Allelopathy Severity', unit: 'L/unit', min: 0, max: 100, step: 1 },
];

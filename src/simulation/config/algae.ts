/**
 * Algae tunable configuration. The bloom runs on the plants' constants — its
 * light curve, income peaks, severities, bank, healing, growth draw and
 * shedding are `PlantsConfig`'s — and its traits sit beside the plant species'
 * (`algae/traits.ts`). What lives here is what only algae has: the carbon it
 * reaches for, what a litre of full bloom weighs, the spores that keep landing
 * and what thriving plants do to it.
 */

export interface AlgaeConfig {
  /**
   * Dissolved CO₂ (mg/L) the bloom photosynthesises at half rate on. Algae
   * take bicarbonate as well as free CO₂, so the constant sits far under any
   * plant's and injection buys a bloom little.
   */
  co2HalfSaturation: number;
  /** Organic matter in a litre of habitat at a full bloom, g. */
  tissuePerLitre: number;
  /** Mass that lands every hour whatever the bloom is doing, 0–100 scale. */
  sporeRate: number;
  /**
   * Damage per rate unit of thriving plant per litre: the allelochemicals a
   * healthy planting leaks, and the small competition this model leaves out.
   */
  allelopathySeverity: number;
}

export const algaeDefaults: AlgaeConfig = {
  // Free CO₂ half-saturation for microalgae with carbon-concentrating
  // mechanisms runs well under 1 mg/L: 93 % on the 4 mg/L an uninjected tank
  // holds, 99 % at an injected 25 — where a medium-need plant goes from 57 %
  // to 89 %.
  co2HalfSaturation: 0.3,
  // Heavy green water carries some 10–50 mg/L of dry cells; 30 mg/L of
  // organic matter ties up about 7 ppm of nitrate-equivalent nitrogen.
  tissuePerLitre: 0.03,
  // 0.05 of the scale a day: nothing a reader sees, but an empty tank is never
  // closed to a bloom.
  sporeRate: 0.002,
  // A healthy planting of 0.1 rate units per litre — a well-planted tank —
  // charges 0.3 %/h before hardiness, above the bloom's income averaged over
  // a lit day.
  allelopathySeverity: 3,
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
  { key: 'co2HalfSaturation', label: 'Algae CO₂ Half-Saturation', unit: 'mg/L', min: 0.05, max: 10, step: 0.05 },
  { key: 'tissuePerLitre', label: 'Full Bloom Tissue', unit: 'g/L', min: 0.005, max: 0.2, step: 0.005 },
  { key: 'sporeRate', label: 'Spore Rate', unit: '/hr', min: 0, max: 0.05, step: 0.001 },
  { key: 'allelopathySeverity', label: 'Allelopathy Severity', unit: '%/(unit/L)/hr', min: 0, max: 20, step: 0.5 },
];

/**
 * Algae system tunable configuration.
 */

export interface AlgaeConfig {
  /** Maximum growth rate per hour (asymptotic limit) */
  maxGrowthRate: number;
  /** Half-saturation constant (W/L at which growth is 50% of max) */
  halfSaturation: number;
  /** Maximum algae level (relative scale) */
  algaeCap: number;
}

export const algaeDefaults: AlgaeConfig = {
  maxGrowthRate: 4,
  halfSaturation: 1.3,
  algaeCap: 100,
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
  { key: 'maxGrowthRate', label: 'Max Growth Rate', unit: '/hr', min: 1, max: 10, step: 0.5 },
  { key: 'halfSaturation', label: 'Half Saturation', unit: 'W/L', min: 0.5, max: 3, step: 0.1 },
  { key: 'algaeCap', label: 'Algae Cap', unit: '', min: 50, max: 200, step: 10 },
];

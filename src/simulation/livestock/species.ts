/**
 * Fish species types.
 */
export type FishSpecies =
  | 'neon_tetra'
  | 'betta'
  | 'guppy'
  | 'angelfish'
  | 'corydoras';

/**
 * Fish sex for reproduction.
 */
export type FishSex = 'male' | 'female';

/**
 * Life stage of a fish. Only adults breed; fry grow toward adult mass
 * and become adults at their species `maturityAge`.
 */
export type FishLifeStage = 'fry' | 'adult';

/**
 * How a species reproduces. Livebearers release free-swimming fry
 * directly; every egg-laying mode deposits an inert clutch that hatches
 * into fry after `hatchTime`. The mode is the anchor for the future
 * predation/guarding layer — nothing downstream branches on it yet
 * beyond livebearer-vs-clutch.
 */
export type BreedingMode =
  | 'livebearer'
  | 'egg-scatterer'
  | 'egg-depositor'
  | 'substrate-spawner'
  | 'bubble-nester';

/**
 * Per-species reproduction parameters. Costs are expressed as fractions
 * so they scale with `LivestockConfig.surplusCap`; times and counts are
 * in sim units (ticks = hours, individuals).
 */
export interface FishBreedingData {
  mode: BreedingMode;
  /**
   * Fraction of `surplusCap` the female spends per spawn. Re-accruing
   * this from the reserve bank IS the breeding cooldown — there are no
   * timers.
   */
  costFraction: number;
  /** Fraction of the female's cost the serving male pays per spawn. */
  maleShareFraction: number;
  /**
   * Ticks from clutch laid to hatch. Unused by livebearers (they skip
   * the clutch stage — gestation is already paid for by accrual).
   */
  hatchTime: number;
  /** Offspring per spawn: fry for livebearers, eggs for egg-layers. */
  clutchSize: number;
  /** Fry starting mass as a fraction of `adultMass`. */
  fryMassFraction: number;
  /** Age (ticks) at which fry mature into breeding adults. */
  maturityAge: number;
}

/**
 * Fish species characteristics.
 */
export interface FishSpeciesData {
  /** Display name */
  name: string;
  /** Adult body mass in grams */
  adultMass: number;
  /** Maximum lifespan in ticks (hours) */
  maxAge: number;
  /** Hardiness factor 0-1 (higher = more tolerant of stressors) */
  hardiness: number;
  /** Preferred temperature range [min, max] in °C */
  temperatureRange: [number, number];
  /** Preferred pH range [min, max] */
  phRange: [number, number];
  /** Maximum tolerable circulation in tank volumes per hour */
  maxTurnover: number;
  /** Reproduction parameters */
  breeding: FishBreedingData;
}

/**
 * Species catalog with characteristics for each fish type.
 */
export const FISH_SPECIES_DATA: Record<FishSpecies, FishSpeciesData> = {
  neon_tetra: {
    name: 'Neon Tetra',
    adultMass: 0.5,
    maxAge: 24 * 365 * 5, // ~5 years
    hardiness: 0.5,
    temperatureRange: [22, 28],
    phRange: [6.0, 7.5],
    maxTurnover: 10, // Slow tributaries, but fine on a community canister
    // Egg-scatterer: sheds adhesive eggs over plants/substrate, no
    // parental care. Fast incubation (~24 h in the wild), large broods,
    // slow to sexual maturity (~4 months here).
    breeding: {
      mode: 'egg-scatterer',
      costFraction: 0.8,
      maleShareFraction: 0.4,
      hatchTime: 24,
      clutchSize: 25,
      fryMassFraction: 0.05,
      maturityAge: 24 * 120,
    },
  },
  betta: {
    name: 'Betta',
    adultMass: 3.0,
    maxAge: 24 * 365 * 3, // ~3 years
    hardiness: 0.6,
    temperatureRange: [24, 30],
    phRange: [6.5, 7.5],
    maxTurnover: 5, // Still blackwater, long fins - a sponge filter and no more
    // Bubble-nester: male wraps eggs into a surface foam nest. Small
    // clutch, quick hatch (~36 h), matures in ~3 months.
    breeding: {
      mode: 'bubble-nester',
      costFraction: 0.8,
      maleShareFraction: 0.4,
      hatchTime: 36,
      clutchSize: 30,
      fryMassFraction: 0.03,
      maturityAge: 24 * 90,
    },
  },
  guppy: {
    name: 'Guppy',
    adultMass: 1.0,
    maxAge: 24 * 365 * 3, // ~3 years
    hardiness: 0.8,
    temperatureRange: [22, 28],
    phRange: [6.5, 8.0],
    maxTurnover: 13, // Hardy, tolerates a lot
    // Livebearer: internal gestation, drops free-swimming fry directly
    // (no clutch stage, so `hatchTime` is unused). Prolific and quick to
    // mature (~2 months).
    breeding: {
      mode: 'livebearer',
      costFraction: 0.8,
      maleShareFraction: 0.4,
      hatchTime: 0,
      clutchSize: 20,
      fryMassFraction: 0.05,
      maturityAge: 24 * 60,
    },
  },
  angelfish: {
    name: 'Angelfish',
    adultMass: 15.0,
    maxAge: 24 * 365 * 10, // ~10 years
    hardiness: 0.4,
    temperatureRange: [24, 30],
    phRange: [6.0, 7.5],
    maxTurnover: 10, // Tall body catches current, but its canonical home is a big canister tank
    // Substrate-spawner: lays a large clutch on a vertical surface,
    // hatches in ~2.5 days. Big fish, tiny fry, slow to mature (~6 months).
    breeding: {
      mode: 'substrate-spawner',
      costFraction: 0.8,
      maleShareFraction: 0.4,
      hatchTime: 60,
      clutchSize: 40,
      fryMassFraction: 0.02,
      maturityAge: 24 * 180,
    },
  },
  corydoras: {
    name: 'Corydoras',
    adultMass: 4.0,
    maxAge: 24 * 365 * 5, // ~5 years
    hardiness: 0.7,
    temperatureRange: [22, 26],
    phRange: [6.0, 7.5],
    maxTurnover: 15, // Bottom dweller, appreciates current
    // Egg-depositor: presses small batches of eggs onto glass and leaves.
    // Slow hatch (~4 days), modest clutch, matures in ~5 months.
    breeding: {
      mode: 'egg-depositor',
      costFraction: 0.8,
      maleShareFraction: 0.4,
      hatchTime: 96,
      clutchSize: 15,
      fryMassFraction: 0.04,
      maturityAge: 24 * 150,
    },
  },
};

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

/** What a fish's size reads as — a word for the keeper, never a switch. */
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

/** Per-species reproduction parameters, in sim units (ticks = hours). */
export interface FishBreedingData {
  mode: BreedingMode;
  /**
   * Ticks from clutch laid to hatch. Unused by livebearers (they skip
   * the clutch stage — gestation is already paid for by accrual).
   */
  hatchTime: number;
  /** Fry starting mass as a fraction of `adultMass`. */
  fryMassFraction: number;
  /** The male's share of a brood's cost, paid from his own bank. */
  maleShare: number;
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
  /** Preferred general hardness range [min, max] in dGH */
  ghRange: [number, number];
  /** Maximum tolerable circulation in tank volumes per hour */
  maxTurnover: number;
  /** Relative growth rate: the size a bank point buys, against a guppy at 1. */
  growthRate: number;
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
    phRange: [5.0, 7.8],
    ghRange: [1, 12],
    maxTurnover: 10, // Slow tributaries, but fine on a community canister
    growthRate: 0.5,
    // Egg-scatterer: sheds adhesive eggs over plants and leaves them. Fast
    // incubation (~24 h); grown in four to six months.
    breeding: {
      mode: 'egg-scatterer',
      hatchTime: 24,
      fryMassFraction: 0.05,
      maleShare: 0.2,
    },
  },
  betta: {
    name: 'Betta',
    adultMass: 3.0,
    maxAge: 24 * 365 * 3, // ~3 years
    hardiness: 0.6,
    temperatureRange: [24, 30],
    phRange: [6.0, 8.0],
    ghRange: [3, 15],
    maxTurnover: 5, // Still blackwater, long fins - a sponge filter and no more
    growthRate: 0.7,
    // Bubble-nester: the male builds the nest and guards the eggs, so he
    // pays most of the brood. Quick hatch (~36 h); grown in three to four months.
    breeding: {
      mode: 'bubble-nester',
      hatchTime: 36,
      fryMassFraction: 0.03,
      maleShare: 0.6,
    },
  },
  guppy: {
    name: 'Guppy',
    adultMass: 1.0,
    maxAge: 24 * 365 * 3, // ~3 years
    hardiness: 0.8,
    temperatureRange: [22, 28],
    phRange: [6.5, 8.5],
    ghRange: [6, 25],
    maxTurnover: 13, // Hardy, tolerates a lot
    growthRate: 1.0,
    // Livebearer: drops free-swimming fry directly (no clutch stage, so
    // `hatchTime` is unused). Grown in two to three months.
    breeding: {
      mode: 'livebearer',
      hatchTime: 0,
      fryMassFraction: 0.05,
      maleShare: 0.2,
    },
  },
  angelfish: {
    name: 'Angelfish',
    adultMass: 15.0,
    maxAge: 24 * 365 * 10, // ~10 years
    hardiness: 0.4,
    temperatureRange: [24, 30],
    phRange: [6.0, 8.0],
    ghRange: [3, 15],
    maxTurnover: 10, // Tall body catches current, but its canonical home is a big canister tank
    growthRate: 0.35,
    // Substrate-spawner: a pair cleans a leaf and fans the eggs together.
    // Hatches in ~2.5 days; big fish, tiny fry, grown in six to eight months.
    breeding: {
      mode: 'substrate-spawner',
      hatchTime: 60,
      fryMassFraction: 0.02,
      maleShare: 0.5,
    },
  },
  corydoras: {
    name: 'Corydoras',
    adultMass: 4.0,
    maxAge: 24 * 365 * 5, // ~5 years
    hardiness: 0.7,
    temperatureRange: [22, 26],
    phRange: [6.0, 8.0],
    ghRange: [2, 15],
    maxTurnover: 15, // Bottom dweller, appreciates current
    growthRate: 0.45,
    // Egg-depositor: presses eggs onto glass and leaves them. Slow hatch
    // (~4 days); grown in five to six months.
    breeding: {
      mode: 'egg-depositor',
      hatchTime: 96,
      fryMassFraction: 0.04,
      maleShare: 0.2,
    },
  },
};

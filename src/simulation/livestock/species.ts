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

/** How a species reproduces: a livebearer carries its clutch, every other mode lays it. */
export type BreedingMode =
  | 'livebearer'
  | 'egg-scatterer'
  | 'egg-depositor'
  | 'substrate-spawner'
  | 'bubble-nester';

/** Per-species reproduction parameters, in sim units (ticks = hours). */
export interface FishBreedingData {
  mode: BreedingMode;
  /** Hours a clutch takes to develop at the metabolic reference temperature in unlimited oxygen. */
  developmentTime: number;
  /** Share of the tank's egg predation that reaches its clutch: 1 left in the open, 0 carried. */
  clutchExposure: number;
  /** Grams one egg weighs, and the fry it hatches — a livebearer's, one embryo late in gestation. */
  eggMass: number;
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
  /** Median age, in ticks, a well-kept fish dies of wear at. */
  lifespan: number;
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
  /** Relative growth rate: the share of its own mass a bank point buys, against a guppy at 1. */
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
    lifespan: 24 * 365 * 5,
    hardiness: 0.5,
    temperatureRange: [22, 28],
    phRange: [5.0, 7.8],
    ghRange: [1, 12],
    maxTurnover: 10, // Slow tributaries, but fine on a community canister
    growthRate: 0.65,
    // Egg-scatterer: sheds adhesive eggs over plants and leaves them to be
    // eaten. Hatches in a day or so; grown in four to six months.
    breeding: {
      mode: 'egg-scatterer',
      developmentTime: 24,
      clutchExposure: 1,
      eggMass: 0.0004,
      maleShare: 0.2,
    },
  },
  betta: {
    name: 'Betta',
    adultMass: 3.0,
    lifespan: 24 * 365 * 3,
    hardiness: 0.6,
    temperatureRange: [24, 30],
    phRange: [6.0, 8.0],
    ghRange: [3, 15],
    maxTurnover: 5, // Still blackwater, long fins - a sponge filter and no more
    growthRate: 1.2,
    // Bubble-nester: the male builds the nest and guards the eggs, so he
    // pays most of the brood and few are eaten. Hatches in a day and a half;
    // grown in three to four months.
    breeding: {
      mode: 'bubble-nester',
      developmentTime: 32,
      clutchExposure: 0.3,
      eggMass: 0.0005,
      maleShare: 0.6,
    },
  },
  guppy: {
    name: 'Guppy',
    adultMass: 1.0,
    lifespan: 24 * 365 * 3,
    hardiness: 0.8,
    temperatureRange: [22, 28],
    phRange: [6.5, 8.5],
    ghRange: [6, 25],
    maxTurnover: 13, // Hardy, tolerates a lot
    growthRate: 1.0,
    // Livebearer: the female carries the clutch through a four-week
    // gestation, out of reach, and drops free-swimming fry. Grown in two to
    // three months.
    breeding: {
      mode: 'livebearer',
      developmentTime: 600,
      clutchExposure: 0,
      eggMass: 0.005,
      maleShare: 0.2,
    },
  },
  angelfish: {
    name: 'Angelfish',
    adultMass: 15.0,
    lifespan: 24 * 365 * 10,
    hardiness: 0.4,
    temperatureRange: [24, 30],
    phRange: [6.0, 8.0],
    ghRange: [3, 15],
    maxTurnover: 10, // Tall body catches current, but its canonical home is a big canister tank
    growthRate: 0.6,
    // Substrate-spawner: a pair cleans a leaf and fans and guards the eggs
    // together. Hatches in two and a half days; big fish, tiny fry, grown in
    // six to eight months.
    breeding: {
      mode: 'substrate-spawner',
      developmentTime: 54,
      clutchExposure: 0.5,
      eggMass: 0.002,
      maleShare: 0.5,
    },
  },
  corydoras: {
    name: 'Corydoras',
    adultMass: 4.0,
    lifespan: 24 * 365 * 5,
    hardiness: 0.7,
    temperatureRange: [22, 26],
    phRange: [6.0, 8.0],
    ghRange: [2, 15],
    maxTurnover: 15, // Bottom dweller, appreciates current
    growthRate: 0.6,
    // Egg-depositor: presses eggs onto glass and leaves them. Slow hatch,
    // three to five days; grown in five to six months.
    breeding: {
      mode: 'egg-depositor',
      developmentTime: 90,
      clutchExposure: 1,
      eggMass: 0.004,
      maleShare: 0.2,
    },
  },
};

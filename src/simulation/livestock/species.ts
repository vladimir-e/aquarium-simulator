import type { DebParams } from '../systems/deb.js';
import { HOURS_PER_DAY } from '../core/clock.js';
import {
  fromAmP,
  impliedFigures,
  proxyEntry,
  readEntry,
  readShaped,
  type AmpEntry,
  type AmpReading,
  type HobbyFigures,
  type LifeHistory,
} from './amp.js';
import { Betta_splendens } from './amp/entries/Betta_splendens.js';
import { Corydoras_aeneus } from './amp/entries/Corydoras_aeneus.js';
import { Paracheirodon_innesi } from './amp/entries/Paracheirodon_innesi.js';
import { Poecilia_reticulata } from './amp/entries/Poecilia_reticulata.js';
import { Pterophyllum_scalare } from './amp/entries/Pterophyllum_scalare.js';

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
 * Where a species' energy budget comes from: its Add-my-Pet entry used as it stands, a hobby adult length setting its
 * shape where the entry was fitted without length data; or, where no entry fits its own data, a base entry rescaled to
 * the keeper's figures, their ages read at the species' mid-range temperature.
 */
export type SpeciesBudget =
  | { kind: 'entry'; entry: AmpEntry; shape?: Pick<HobbyFigures, 'adultLengthCm'> }
  | { kind: 'proxy'; base: AmpEntry; figures: Omit<HobbyFigures, 'temperatureC'> };

/**
 * Fish species characteristics.
 */
export interface FishSpeciesData {
  /** Display name */
  name: string;
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
  /** Relative growth rate: the share of its metabolic mass a bank point buys, against a guppy at 1. */
  growthRate: number;
  /** Reproduction parameters */
  breeding: FishBreedingData;
  budget: SpeciesBudget;
}

/**
 * Species catalog with characteristics for each fish type.
 */
export const FISH_SPECIES_DATA: Record<FishSpecies, FishSpeciesData> = {
  neon_tetra: {
    name: 'Neon Tetra',
    hardiness: 0.5,
    temperatureRange: [22, 28],
    phRange: [5.0, 7.8],
    ghRange: [1, 12],
    maxTurnover: 10, // Slow tributaries, but fine on a community canister
    growthRate: 0.45,
    // Egg-scatterer: sheds adhesive eggs over plants and leaves them to be
    // eaten. Hatches in a day or so.
    breeding: {
      mode: 'egg-scatterer',
      developmentTime: 24,
      clutchExposure: 1,
      eggMass: 0.0004,
      maleShare: 0.2,
    },
    budget: { kind: 'entry', entry: Paracheirodon_innesi },
  },
  betta: {
    name: 'Betta',
    hardiness: 0.6,
    temperatureRange: [24, 30],
    phRange: [6.0, 8.0],
    ghRange: [3, 15],
    maxTurnover: 5, // Still blackwater, long fins - a sponge filter and no more
    growthRate: 1.0,
    // Bubble-nester: the male builds the nest and guards the eggs, so he
    // pays most of the brood and few are eaten. Hatches in a day and a half.
    breeding: {
      mode: 'bubble-nester',
      developmentTime: 32,
      clutchExposure: 0.3,
      eggMass: 0.0005,
      maleShare: 0.6,
    },
    // The entry predicts a 147 g adult against the 4.7 g it was given, so
    // its rates carry a body sized by the keeper.
    budget: {
      kind: 'proxy',
      base: Betta_splendens,
      figures: { adultLengthCm: 5.5, adultMassGrams: 3, maturityAgeDays: 120, lifespanDays: 1095 },
    },
  },
  guppy: {
    name: 'Guppy',
    hardiness: 0.8,
    temperatureRange: [22, 28],
    phRange: [6.5, 8.5],
    ghRange: [6, 25],
    maxTurnover: 13, // Hardy, tolerates a lot
    growthRate: 1.0,
    // Livebearer: the female carries the clutch through a four-week
    // gestation, out of reach, and drops free-swimming fry.
    breeding: {
      mode: 'livebearer',
      developmentTime: 600,
      clutchExposure: 0,
      eggMass: 0.005,
      maleShare: 0.2,
    },
    budget: { kind: 'entry', entry: Poecilia_reticulata },
  },
  angelfish: {
    name: 'Angelfish',
    hardiness: 0.4,
    temperatureRange: [24, 30],
    phRange: [6.0, 8.0],
    ghRange: [3, 15],
    maxTurnover: 10, // Tall body catches current, but its canonical home is a big canister tank
    growthRate: 0.2,
    // Substrate-spawner: a pair cleans a leaf and fans and guards the eggs
    // together. Hatches in two and a half days; big fish, tiny fry.
    breeding: {
      mode: 'substrate-spawner',
      developmentTime: 54,
      clutchExposure: 0.5,
      eggMass: 0.002,
      maleShare: 0.5,
    },
    // The entry was fitted without length data; its own shape makes a 35 cm fish.
    budget: { kind: 'entry', entry: Pterophyllum_scalare, shape: { adultLengthCm: 15 } },
  },
  corydoras: {
    name: 'Corydoras',
    hardiness: 0.7,
    temperatureRange: [22, 26],
    phRange: [6.0, 8.0],
    ghRange: [2, 15],
    maxTurnover: 15, // Bottom dweller, appreciates current
    growthRate: 0.25,
    // Egg-depositor: presses eggs onto glass and leaves them. Slow hatch,
    // three to five days.
    breeding: {
      mode: 'egg-depositor',
      developmentTime: 90,
      clutchExposure: 1,
      eggMass: 0.004,
      maleShare: 0.2,
    },
    budget: { kind: 'entry', entry: Corydoras_aeneus },
  },
};

function readBudget(budget: SpeciesBudget, temperatureC: number): AmpReading {
  if (budget.kind === 'entry') {
    return budget.shape ? readShaped(budget.entry, budget.shape) : readEntry(budget.entry.parameters);
  }
  return readEntry(proxyEntry(budget.base.parameters, { ...budget.figures, temperatureC }));
}

interface SpeciesReading {
  deb: DebParams;
  female: LifeHistory;
}

function readSpecies(species: FishSpecies): SpeciesReading {
  const { budget, temperatureRange: [low, high] } = FISH_SPECIES_DATA[species];
  const midRange = (low + high) / 2;
  const reading = readBudget(budget, midRange);
  return { deb: fromAmP(reading), female: impliedFigures(reading, midRange) };
}

const readings: Partial<Record<FishSpecies, SpeciesReading>> = {};

const readingOf = (species: FishSpecies): SpeciesReading => (readings[species] ??= readSpecies(species));

export const debParams = (species: FishSpecies): Readonly<DebParams> => readingOf(species).deb;

/** Grams a female weighs grown on unlimited food. */
export const grownMass = (species: FishSpecies): number => readingOf(species).female.adultMassGrams;

/** Physical length, cm, a female reaches grown on unlimited food. */
export const grownLength = (species: FishSpecies): number => readingOf(species).female.adultLengthCm;

/** Ticks from hatching until a female fed without limit in mid-range water first breeds. */
export const maturityAge = (species: FishSpecies): number => HOURS_PER_DAY * readingOf(species).female.maturityAgeDays;

/** Ticks from hatching by which half a cohort fed without limit in mid-range water has died of wear. */
export const lifespan = (species: FishSpecies): number => HOURS_PER_DAY * readingOf(species).female.lifespanDays;

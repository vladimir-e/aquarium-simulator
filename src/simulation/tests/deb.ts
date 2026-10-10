import { expect } from 'vitest';
import { LIFESPAN_SURVIVAL } from '../livestock/amp.js';
import {
  hatchling,
  mature,
  maxReserveDensity,
  maxStructuralLength,
  stepDeb,
  type DebParams,
  type DebState,
} from '../systems/deb.js';

export function feastFromHatching(p: DebParams, hours: number, tau = 1): DebState[] {
  const states: DebState[] = [];
  let state = hatchling(p);
  for (let t = 0; t < hours; t++) {
    state = stepDeb(state, p, { fromGut: 1, tau, omega: 1 }).state;
    states.push(state);
  }
  return states;
}

export function grown(p: DebParams): DebState {
  const structure = maxStructuralLength(p) ** 3;
  const reserve = maxReserveDensity(p) * structure;
  return { structure, reserve, maturity: p.EHp, broodBuffer: 0, wearLoad: 0, hazard: 0 };
}

export const pubertyHour = (life: readonly DebState[], p: DebParams): number =>
  life.findIndex((state) => mature(state, p)) + 1;

export function medianDeathHour(life: readonly DebState[]): number {
  let cumulativeHazard = 0;
  return life.findIndex(({ hazard }) => (cumulativeHazard += hazard) >= -Math.log(LIFESPAN_SURVIVAL)) + 1;
}

export const expectRelative = (actual: number, expected: number, tolerance = 1e-12): void => {
  expect(Math.abs(actual / expected - 1)).toBeLessThanOrEqual(tolerance);
};

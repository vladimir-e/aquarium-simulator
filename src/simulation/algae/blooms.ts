/**
 * The tank's blooms as a set: one of each kind, read by name.
 */

import type { AlgaeState, Blooms } from '../state.js';
import { ALGAE, ALGAE_KINDS, type AlgaeHabitat, type AlgaeKind } from './traits.js';

/** A bloom with nothing standing: what a clean tank holds of every kind. */
export const EMPTY_BLOOM: AlgaeState = { mass: 0, condition: 100, surplus: 0 };

export function emptyBlooms(): Blooms {
  return mapKinds(() => ({ ...EMPTY_BLOOM }));
}

export function isAlgaeKind(key: string): key is AlgaeKind {
  return (ALGAE_KINDS as readonly string[]).includes(key);
}

/** The kinds that live in this habitat. */
export function kindsIn(habitat: AlgaeHabitat): AlgaeKind[] {
  return ALGAE_KINDS.filter((kind) => ALGAE[kind].habitat === habitat);
}

/** A record over the kinds, each entry built from its kind and its place in `ALGAE_KINDS`. */
export function mapKinds<T>(fn: (kind: AlgaeKind, index: number) => T): Record<AlgaeKind, T> {
  return Object.fromEntries(ALGAE_KINDS.map((kind, index) => [kind, fn(kind, index)])) as Record<AlgaeKind, T>;
}

/**
 * The share of the light every kind's coverage takes together, 0–100, each
 * read as a layer the light passes through in turn: `100·(1 − Π(1 − mass/100))`,
 * folded a kind at a time so one kind alone is its own coverage exactly.
 */
export function combinedCoverage(blooms: Blooms): number {
  return ALGAE_KINDS.reduce((taken, kind) => taken + blooms[kind].mass * (1 - taken / 100), 0);
}

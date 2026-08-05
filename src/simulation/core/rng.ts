/**
 * The tank's draw stream — everything the simulation can't derive from
 * physics comes off it: an individual's variation, a scrub's bite, an
 * organism's name.
 *
 * A seed and a counter, both carried on `SimulationState`. A draw is a pure
 * function of `(seed, counter)` and the counter only ever climbs, so there is
 * no generator identity to keep in sync and no closure to lose — the same
 * state always has the same future, across a save and reload included.
 */

export interface RngState {
  /** Stream identity: the same seed replays the same draws. */
  seed: number;
  /** Position in the stream; every draw advances it by one. */
  counter: number;
}

/** 2³² / φ — the Weyl step splitmix walks its input by. */
const GOLDEN_GAMMA = 0x9e3779b9;

/** splitmix32: the position mixed to a uniform 32-bit word. */
function splitmix32(seed: number, counter: number): number {
  let z = (seed + Math.imul(counter, GOLDEN_GAMMA)) | 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  z ^= z >>> 15;
  return (z >>> 0) / 0x100000000;
}

/**
 * A fresh stream. Without a seed the tank takes a time-derived one, so two
 * tanks are alike only when a caller asks them to be.
 */
export function createRng(seed: number = Date.now()): RngState {
  return { seed: seed | 0, counter: 0 };
}

/** Uniform draw in [0, 1). */
export function draw(rng: RngState): number {
  return splitmix32(rng.seed, rng.counter++);
}

/**
 * A name under `prefix`, unique in this tank because the position it is cut
 * from is never revisited.
 */
export function drawId(rng: RngState, prefix: string): string {
  return `${prefix}_${(rng.counter++).toString(36)}`;
}

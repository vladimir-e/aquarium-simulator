/**
 * The tank's draw stream — everything the simulation can't derive from
 * physics comes off it: an individual's variation, a scrub's bite, an
 * organism's name.
 *
 * A pair rather than a closure because a pair serializes: a saved tank
 * resumes its stream where a generator identity would have been lost.
 *
 * It is an object on the state, so `{ ...state }` aliases it and the two
 * copies then advance each other's counter. Immer's producers copy it; a
 * hand-rolled spread has to.
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

/** Unnamed streams opened so far, so a millisecond can hold more than one. */
let unnamedStreams = 0;

/**
 * A fresh stream. Without a seed the tank takes one off the clock and the
 * count of streams before it, so two tanks are alike only when a caller asks
 * them to be.
 */
export function createRng(seed?: number): RngState {
  const chosen = seed ?? Date.now() + Math.imul(unnamedStreams++, GOLDEN_GAMMA);
  return { seed: chosen | 0, counter: 0 };
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

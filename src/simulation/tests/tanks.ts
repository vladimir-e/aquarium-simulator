/**
 * Shared scenario fixtures for the tests that watch a tank cycle itself.
 */

import { createSimulation, type SimulationState } from '../state.js';
import type { SubstrateType } from '../equipment/substrate.js';

/**
 * A fishless, unfed, unplanted tank: the bed is the only thing in it that can
 * produce ammonia, so it alone decides whether — and when — the tank cycles.
 *
 * The ATO is on by default so evaporation doesn't quietly concentrate every
 * reading: over the two months these runs cover, an open tank loses most of
 * its water, and a rising ppm would then be a story about the water level
 * rather than about the bed. Turn it off to watch evaporation itself.
 */
export function fishlessTank(
  substrate: SubstrateType,
  { capacity = 20, ato = true }: { capacity?: number; ato?: boolean } = {}
): SimulationState {
  return createSimulation({
    tankCapacity: capacity,
    substrate: { type: substrate },
    ato: { enabled: ato },
  });
}

/**
 * The sim hook as a section sees it: real engine state, the buffer behind it,
 * and a fresh `vi.fn()` conjured for every callback the section reaches for.
 * Sections drive the world only through those callbacks, so a test asserts on
 * the call rather than on the state that would have come back.
 */

import { vi } from 'vitest';
import type { SimulationState } from '../../simulation/index.js';
import type { useSimulation } from '../hooks/useSimulation';
import type { RunSnapshot } from '../run/index.js';

export function stubSim(
  state: SimulationState,
  history: RunSnapshot[] = []
): ReturnType<typeof useSimulation> {
  const cache = new Map<string, ReturnType<typeof vi.fn>>();
  const values: Record<string, unknown> = { state, tankId: 0, history };
  return new Proxy(values, {
    get(target: Record<string, unknown>, prop: string): unknown {
      if (prop in target) return target[prop];
      if (!cache.has(prop)) cache.set(prop, vi.fn());
      return cache.get(prop);
    },
  }) as unknown as ReturnType<typeof useSimulation>;
}

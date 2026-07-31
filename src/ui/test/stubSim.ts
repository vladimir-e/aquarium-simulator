/**
 * The sim hook as a section sees it: real engine state, and a fresh `vi.fn()`
 * conjured for every callback the section reaches for. Sections drive the world
 * only through those callbacks, so a test asserts on the call rather than on
 * the state that would have come back.
 */

import { vi } from 'vitest';
import type { SimulationState } from '../../simulation/index.js';
import type { useSimulation } from '../hooks/useSimulation';

export function stubSim(state: SimulationState): ReturnType<typeof useSimulation> {
  const cache = new Map<string, ReturnType<typeof vi.fn>>();
  return new Proxy(
    { state },
    {
      get(target: { state: SimulationState }, prop: string): unknown {
        if (prop === 'state') return target.state;
        if (!cache.has(prop)) cache.set(prop, vi.fn());
        return cache.get(prop);
      },
    }
  ) as unknown as ReturnType<typeof useSimulation>;
}

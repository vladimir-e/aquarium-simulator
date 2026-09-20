import { useMemo } from 'react';
import type { TunableConfig } from '../../simulation/config/index.js';
import { readTank, type ReadingBook } from '../readings';
import type { useSimulation } from './useSimulation';
import { useUnits } from './useUnits';

/**
 * The tank read once, for whichever module is standing on the stage. Every
 * surface takes the book the same way, so two of them on the same tick are two
 * views of one reading rather than two readings that happen to agree.
 */
export function useReadingBook(
  sim: ReturnType<typeof useSimulation>,
  config: TunableConfig
): ReadingBook {
  const { unitSystem } = useUnits();
  const { state, history } = sim;

  return useMemo(
    () => readTank({ state, config, history, units: unitSystem }),
    [state, config, history, unitSystem]
  );
}

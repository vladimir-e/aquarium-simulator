import { useMemo } from 'react';
import type { TunableConfig } from '../../simulation/config/index.js';
import { readTank, type ReadingBook, type TankInput } from '../readings';
import type { useSimulation } from './useSimulation';
import { useUnits } from './useUnits';

let held: { input: TankInput; book: ReadingBook } | null = null;

function sameTank(a: TankInput, b: TankInput): boolean {
  return a.state === b.state && a.config === b.config && a.history === b.history && a.units === b.units;
}

/** The last tank read, handed back to whoever asks for the same one. */
function readOnce(input: TankInput): ReadingBook {
  if (held === null || !sameTank(held.input, input)) held = { input, book: readTank(input) };
  return held.book;
}

/**
 * The tank read once a tick for the whole console: the shell reads it for what
 * needs the keeper and the stage for its module, and both get the same book —
 * two surfaces on one tick are two views of one reading rather than two
 * readings that happen to agree.
 */
export function useReadingBook(
  sim: ReturnType<typeof useSimulation>,
  config: TunableConfig
): ReadingBook {
  const { unitSystem } = useUnits();
  const { state, history } = sim;

  return useMemo(
    () => readOnce({ state, config, history, units: unitSystem }),
    [state, config, history, unitSystem]
  );
}

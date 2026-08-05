import { useState } from 'react';
import type { SimulationState } from '../../simulation/index.js';

export type ExpandedRows = [open: ReadonlySet<string>, toggle: (key: string) => void];

/**
 * The disclosure rows a reader has opened, keyed by organism id.
 *
 * Dropped whenever the tank is replaced — a preset load, a resize. Ids are cut
 * from the tank's own stream position, so the new tank hands out the ones the
 * old one gave out, and a row left open would reopen on a fish nobody ever
 * clicked. The seed is the tank's identity: a tank built fresh opens a fresh
 * stream, and only a tank built fresh replaces its organisms.
 */
export function useExpandedRows(state: SimulationState): ExpandedRows {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [tank, setTank] = useState(state.rng.seed);

  if (tank !== state.rng.seed) {
    setTank(state.rng.seed);
    setOpen(new Set());
  }

  const toggle = (key: string): void =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return [open, toggle];
}

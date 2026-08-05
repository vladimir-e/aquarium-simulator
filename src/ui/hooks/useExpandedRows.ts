import { useState } from 'react';

export type ExpandedRows = [open: ReadonlySet<string>, toggle: (key: string) => void];

/**
 * The disclosure rows a reader has opened, keyed by organism id.
 *
 * Dropped whenever `tankId` changes. Ids are cut from the tank's own stream
 * position, so a replacement tank hands out the ones the old one gave out, and
 * a row left open would reopen on a fish nobody ever clicked.
 */
export function useExpandedRows(tankId: number): ExpandedRows {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [tank, setTank] = useState(tankId);

  if (tank !== tankId) {
    setTank(tankId);
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

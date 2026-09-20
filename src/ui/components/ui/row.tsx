import React from 'react';
import { Link } from 'react-router-dom';
import { INSET_FOCUS } from './focus';

/**
 * The shape every table row in the app takes — the roster, the rack, the
 * reading sheet. Height and columns come from the caller, because a row kind
 * owns its own rhythm; everything else is shared so the tables line up.
 */
export const ROW =
  'relative grid w-full items-center gap-2.5 border-t border-hairline first:border-t-0';

/**
 * Cells sit above the row-wide overlay: it is positioned, so without a
 * stacking position of their own the hover background would paint over them.
 */
export const CELL = 'relative pointer-events-none truncate';

/** A column only a tablet-wide stage has room for. */
export const WIDE = 'hidden md:block';

const OVERLAY = `absolute inset-0 rounded-none transition-colors hover:bg-surface-2 ${INSET_FOCUS}`;

interface OverlayProps {
  /** What the row reads out as, since the cells under it are inert. */
  label: string;
  /** Where the row opens, for a row that navigates. */
  to?: string;
  /** What the row does, for a row that acts in place. */
  onClick?: () => void;
  expanded?: boolean;
}

/**
 * The row-wide hit target, laid under every cell so the columns stay one grid.
 * A row either goes somewhere or does something, and takes the element that
 * says so.
 */
export function RowOverlay({ label, to, onClick, expanded }: OverlayProps): React.JSX.Element {
  if (to !== undefined) return <Link to={to} aria-label={label} className={OVERLAY} />;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={expanded}
      className={OVERLAY}
    />
  );
}

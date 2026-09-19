import React from 'react';

/**
 * Where a species or device silhouette goes. The drawn set is the project's one
 * piece of illustration and lands with the modules that show it off; until then
 * every row keeps its 16 px of room so nothing shifts when they arrive.
 */
export function Glyph({ className = '' }: { className?: string }): React.JSX.Element {
  return (
    <span
      aria-hidden
      className={`block h-4 w-4 shrink-0 rounded-full border border-ink-3 ${className}`}
    />
  );
}

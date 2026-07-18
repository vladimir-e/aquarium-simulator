import { useCallback } from 'react';
import { usePersistentState } from './usePersistentState';
import { useIsMobile } from './useMediaQuery';

export interface CardCollapse {
  /** Whether the card body is collapsed (remembered per key, persists reloads). */
  collapsed: boolean;
  toggle: () => void;
  /** Only mobile shows the collapse control; desktop always renders the body. */
  showToggle: boolean;
}

/**
 * Collapse state for a stacked card or accordion section. State is remembered
 * across mode switches and reloads; the toggle affordance appears on mobile
 * only, where cards stack and space is scarce.
 */
export function useCardCollapse(key: string, initialCollapsed = false): CardCollapse {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = usePersistentState(`card.${key}`, initialCollapsed);
  const toggle = useCallback(() => setCollapsed((v) => !v), [setCollapsed]);
  return { collapsed, toggle, showToggle: isMobile };
}

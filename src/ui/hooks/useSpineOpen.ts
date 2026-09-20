import { useCallback, useEffect, useState } from 'react';
import { usePersistence } from '../persistence/index.js';

/**
 * Whether the spine is showing its tracks. Kept with the session the way the
 * tunables drawer is: a keeper who reads the run off the charts opens on them.
 */
export function useSpineOpen(): [open: boolean, toggle: () => void] {
  const { initialUI, onUIChange } = usePersistence();
  const [open, setOpen] = useState(initialUI.spineOpen);

  useEffect(() => {
    onUIChange({ spineOpen: open });
  }, [open, onUIChange]);

  return [open, useCallback(() => setOpen((was) => !was), [])];
}

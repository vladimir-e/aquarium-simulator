import { useCallback, useEffect, useState } from 'react';
import { usePersistence } from '../persistence/index.js';

/**
 * Whether the spine is showing its tracks — remembered across reloads the way
 * the tunables drawer is, so a keeper who reads the run off the tracks opens
 * on them.
 */
export function useSpineOpen(): [open: boolean, toggle: () => void] {
  const { initialUI, onUIChange } = usePersistence();
  const [open, setOpen] = useState(initialUI.spineOpen);

  useEffect(() => {
    onUIChange({ spineOpen: open });
  }, [open, onUIChange]);

  return [open, useCallback(() => setOpen((was) => !was), [])];
}

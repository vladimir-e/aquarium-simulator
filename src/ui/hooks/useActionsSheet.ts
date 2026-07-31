import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Action } from '../../simulation/index.js';
import {
  DEFAULT_SETTINGS,
  verbAction,
  type SettableVerb,
  type VerbId,
  type VerbSettings,
} from '../actions';

export interface ActionsSheet {
  open: boolean;
  /** The verb whose settings the detail panel shows. */
  selected: VerbId;
  /** The verb the trigger names — the last one committed. */
  promoted: VerbId;
  settings: VerbSettings;
  toggle: () => void;
  close: () => void;
  select: (id: VerbId) => void;
  setSetting: (id: SettableVerb, value: number) => void;
  commit: (id: VerbId) => void;
}

/**
 * The sheet's whole state. Settings outlive a dismissal on purpose: the trigger
 * names the promoted verb and its setting, so closing has to mean "not now"
 * rather than "discard" or that label would be a lie. Nothing reaches the
 * simulation until a commit.
 */
export function useActionsSheet(executeAction: (action: Action) => void): ActionsSheet {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<VerbId>('feed');
  const [promoted, setPromoted] = useState<VerbId>('feed');
  const [settings, setSettings] = useState<VerbSettings>(DEFAULT_SETTINGS);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((was) => !was), []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return (): void => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  const commit = useCallback(
    (id: VerbId) => {
      executeAction(verbAction(id, settings));
      setPromoted(id);
      setOpen(false);
    },
    [executeAction, settings]
  );

  return useMemo(
    () => ({
      open,
      selected,
      promoted,
      settings,
      toggle,
      close,
      select: setSelected,
      setSetting: (id, value) => setSettings((current) => ({ ...current, [id]: value })),
      commit,
    }),
    [open, selected, promoted, settings, toggle, close, commit]
  );
}

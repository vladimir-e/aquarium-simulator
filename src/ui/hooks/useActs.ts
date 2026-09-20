import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Action } from '../../simulation/index.js';
import {
  verbAction,
  withAmount,
  type SettableVerb,
  type VerbId,
  type VerbSettings,
} from '../actions';
import { usePersistence } from '../persistence/index.js';

export interface Acts {
  palette: boolean;
  /** The verb whose sheet is open, if one is. */
  verb: VerbId | null;
  settings: VerbSettings;
  /** The last verb committed — what the top bar's button names. */
  promoted: VerbId | null;
  openPalette: () => void;
  /** Opens a verb, optionally on the amount the calling surface asked for. */
  open: (verb: VerbId, at?: number) => void;
  setAmount: (verb: SettableVerb, value: number) => void;
  commit: (verb: VerbId) => void;
  close: () => void;
}

/**
 * What the reader has chosen but not yet done, kept with the tank so it
 * outlives a reload as well. Amounts outlive a dismissal on
 * purpose — the footer buttons and the palette name them while every sheet is
 * shut, so closing has to mean "not now" rather than "discard" or those labels
 * would be a lie. Nothing reaches the simulation until a commit.
 */
export function useActs(executeAction: (action: Action) => void): Acts {
  const { initialUI, onUIChange } = usePersistence();
  const [palette, setPalette] = useState(false);
  const [verb, setVerb] = useState<VerbId | null>(null);
  const [promoted, setPromoted] = useState<VerbId | null>(initialUI.acts.promoted);
  const [settings, setSettings] = useState<VerbSettings>(initialUI.acts.settings);

  useEffect(() => {
    onUIChange({ acts: { settings, promoted } });
  }, [settings, promoted, onUIChange]);

  const close = useCallback(() => {
    setPalette(false);
    setVerb(null);
  }, []);

  const openPalette = useCallback(() => {
    setVerb(null);
    setPalette((was) => !was);
  }, []);

  const open = useCallback(
    (id: VerbId, at?: number) => {
      const opening = verb !== id;
      setPalette(false);
      setVerb(opening ? id : null);
      if (opening) setSettings((current) => withAmount(current, id, at));
    },
    [verb]
  );

  const setAmount = useCallback((id: SettableVerb, value: number) => {
    setSettings((current) => ({ ...current, [id]: value }));
  }, []);

  const commit = useCallback(
    (id: VerbId) => {
      executeAction(verbAction(id, settings));
      setPromoted(id);
      setVerb(null);
    },
    [executeAction, settings]
  );

  return useMemo(
    () => ({
      palette,
      verb,
      settings,
      promoted,
      openPalette,
      open,
      setAmount,
      commit,
      close,
    }),
    [palette, verb, settings, promoted, openPalette, open, setAmount, commit, close]
  );
}

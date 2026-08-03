import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { SimulationState } from '../../simulation/index.js';
import { presetName, type PresetId } from '../../simulation/presets.js';
import { presetLoadDestroys, presetLoadMessage } from '../build/index.js';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

export interface PresetLoad {
  current: PresetId;
  /** Ask to load a preset. Asking for the loaded one starts it over. */
  request: (id: PresetId) => void;
}

const PresetLoadContext = createContext<PresetLoad | null>(null);

/**
 * The preset selector sits in the chrome row and the preset picker sits in the
 * Scenario section; both come through here, so a load is confirmed once, in one
 * wording, wherever it was asked for.
 */
export function PresetLoadProvider({
  current,
  state,
  onLoad,
  children,
}: {
  current: PresetId;
  state: SimulationState;
  onLoad: (id: PresetId) => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const [pending, setPending] = useState<PresetId | null>(null);

  const request = useCallback(
    (id: PresetId) => {
      if (presetLoadDestroys(state, current)) setPending(id);
      else onLoad(id);
    },
    [state, current, onLoad]
  );
  const value = useMemo<PresetLoad>(() => ({ current, request }), [current, request]);

  return (
    <PresetLoadContext.Provider value={value}>
      {children}
      <ConfirmDialog
        isOpen={pending !== null}
        title="Start a new tank?"
        message={pending === null ? '' : presetLoadMessage(presetName(pending), state)}
        confirmLabel="Start"
        onConfirm={() => {
          if (pending !== null) onLoad(pending);
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />
    </PresetLoadContext.Provider>
  );
}

export function usePresetLoad(): PresetLoad {
  const value = useContext(PresetLoadContext);
  if (!value) {
    throw new Error('usePresetLoad must be used inside a PresetLoadProvider');
  }
  return value;
}
